import { Inject, Injectable, Logger } from '@nestjs/common';

import { InMemoryCacheService } from '../../../common/cache/in-memory-cache.service';
import { ChallengeAlreadyInitializedError } from '../../../common/exceptions/application.exceptions';
import { CLOCK, type Clock } from '../../../common/time/clock';
import { toIsoDateTime } from '../../../common/time/iso-date-time';
import { mapWithConcurrency } from '../../../common/utils/concurrency';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';
import { type AppEnvironment, environmentConfig } from '../../../config/environment.config';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import { type ChallengeState, withRegisteredParticipant } from '../domain/challenge-state';
import {
  CHALLENGE_STATE_REPOSITORY,
  type ChallengeStateRepository,
} from '../domain/challenge-state.repository';
import { BaselineTimelinessPolicy } from '../domain/baseline-timeliness.policy';
import type {
  ChallengeInitializationReport,
  ParticipantInitializationOutcome,
} from './challenge-initialization.report';
import { ParticipantBaselineCapturer } from './participant-baseline.capturer';

export interface InitializeChallengeCommand {
  /**
   * Explicit administrative acknowledgement that the baseline is being captured late and
   * that progress before this instant is not measurable. It never overwrites an existing
   * baseline: initialization stays idempotent.
   */
  readonly acknowledgeLateBaseline: boolean;
}

/**
 * Captures the baseline of every enabled participant, once, as the initial global
 * initialization of the challenge.
 *
 * Refuses to run on an already initialized challenge (409 CHALLENGE_ALREADY_INITIALIZED).
 * That protection is deliberate: this operation must never be used to incorporate
 * participants added later, because it would also touch the global `initializedAt`.
 * For that case there is a separate use case,
 * `CaptureMissingParticipantBaselinesUseCase`, which never modifies the global flags.
 *
 * The challenge is flagged as initialized only when every enabled participant has a
 * baseline, so a Riot failure cannot produce a half initialized event. UNRANKED is a valid
 * baseline and never aborts the process.
 *
 * Coverage: progress is measured from the effective baseline capture, never retroactively
 * from `startAt`. Whatever was played before the capture is invisible to the challenge and
 * cannot be reconstructed, which is why capturing very late requires an acknowledgement.
 */
@Injectable()
export class InitializeChallengeUseCase {
  private readonly logger = new Logger(InitializeChallengeUseCase.name);

  constructor(
    @Inject(CHALLENGE_STATE_REPOSITORY) private readonly repository: ChallengeStateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(environmentConfig.KEY) private readonly environment: AppEnvironment,
    @Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration,
    private readonly registry: ParticipantRegistry,
    private readonly capturer: ParticipantBaselineCapturer,
    private readonly timeliness: BaselineTimelinessPolicy,
    private readonly cache: InMemoryCacheService,
  ) {}

  public execute(command: InitializeChallengeCommand): Promise<ChallengeInitializationReport> {
    return this.repository.runExclusively(() => this.initialize(command));
  }

  private async initialize(
    command: InitializeChallengeCommand,
  ): Promise<ChallengeInitializationReport> {
    const startedAt = this.clock.now();
    const challengeState = await this.repository.loadChallengeState();

    if (challengeState.initialized) {
      throw new ChallengeAlreadyInitializedError(challengeState.challengeId);
    }

    this.timeliness.assertCaptureIsTimely(startedAt, command.acknowledgeLateBaseline);

    const definitions = this.registry.enabled();
    const outcomes = await mapWithConcurrency(
      definitions,
      this.environment.riot.maxConcurrency,
      (definition) => this.capturer.capture(definition),
    );

    const failedParticipants = outcomes.filter((outcome) => outcome.result === 'FAILED').length;
    // An empty roster is not a valid initialized challenge.
    const initialized = outcomes.length > 0 && failedParticipants === 0;
    const finishedAt = this.clock.now();
    const nextState = this.buildNextChallengeState(
      challengeState,
      outcomes,
      initialized,
      finishedAt,
    );

    await this.repository.saveChallengeState(nextState);
    this.cache.invalidateAll();

    if (!initialized) {
      this.logger.warn(
        `Challenge "${challengeState.challengeId}" was not initialized: ` +
          `${failedParticipants} of ${outcomes.length} participant(s) failed.`,
      );
    }

    return {
      challengeId: challengeState.challengeId,
      initialized,
      startedAt: toIsoDateTime(startedAt),
      finishedAt: toIsoDateTime(finishedAt),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      challengeStartAt: this.challenge.startAt,
      baselineCoverageStartAt: nextState.initializedAt,
      totalParticipants: outcomes.length,
      successfulParticipants: outcomes.length - failedParticipants,
      failedParticipants,
      participants: outcomes,
    };
  }

  private buildNextChallengeState(
    current: ChallengeState,
    outcomes: readonly ParticipantInitializationOutcome[],
    initialized: boolean,
    finishedAt: Date,
  ): ChallengeState {
    const registered = outcomes.reduce<ChallengeState>((state, outcome) => {
      if (outcome.puuid === null || outcome.baselineRank === null) {
        return state;
      }

      return withRegisteredParticipant(state, {
        participantId: outcome.participantId,
        puuid: outcome.puuid,
        initializedAt: outcome.baselineRank.capturedAt,
      });
    }, current);

    return {
      ...registered,
      initialized,
      initializedAt: initialized ? toIsoDateTime(finishedAt) : null,
    };
  }
}
