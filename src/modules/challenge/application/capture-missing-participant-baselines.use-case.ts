import { Inject, Injectable, Logger } from '@nestjs/common';

import { InMemoryCacheService } from '../../../common/cache/in-memory-cache.service';
import {
  ChallengeNotInitializedError,
  ParticipantNotFoundError,
} from '../../../common/exceptions/application.exceptions';
import { CLOCK, type Clock } from '../../../common/time/clock';
import { toIsoDateTime } from '../../../common/time/iso-date-time';
import { mapWithConcurrency } from '../../../common/utils/concurrency';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';
import { type AppEnvironment, environmentConfig } from '../../../config/environment.config';
import type { ParticipantDefinition } from '../../../config/participants.config';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import { BaselineTimelinessPolicy } from '../domain/baseline-timeliness.policy';
import { type ChallengeState, withRegisteredParticipant } from '../domain/challenge-state';
import {
  CHALLENGE_STATE_REPOSITORY,
  type ChallengeStateRepository,
} from '../domain/challenge-state.repository';
import type {
  BaselineCaptureReport,
  ParticipantInitializationOutcome,
} from './challenge-initialization.report';
import { ParticipantBaselineCapturer } from './participant-baseline.capturer';

export interface CaptureMissingBaselinesCommand {
  /**
   * Acknowledges that the progress of the incorporated participants starts at this capture
   * and that their earlier games are not measurable. Required under the same rule as the
   * initial initialization, so both operations demand the same explicit confirmation.
   */
  readonly acknowledgeLateBaseline: boolean;
  /** Restricts the run to a single participant. Absent means every pending one. */
  readonly participantId?: string;
}

/**
 * Incorporates participants added to the roster after the challenge was initialized.
 *
 * This is the counterpart of `InitializeChallengeUseCase`, which stays a strictly initial
 * operation and keeps rejecting an already initialized challenge. Splitting them keeps the
 * guarantee that matters: nothing here can flag the challenge as initialized, move
 * `initializedAt`, or rewrite the global baseline coverage.
 *
 * Guarantees:
 *  - only participants that are enabled and have no persisted baseline are captured;
 *  - an existing baseline is never read back, replaced or recaptured;
 *  - idempotent: running it with nothing pending succeeds with `captured: 0`;
 *  - one participant failing against Riot never affects the others.
 */
@Injectable()
export class CaptureMissingParticipantBaselinesUseCase {
  private readonly logger = new Logger(CaptureMissingParticipantBaselinesUseCase.name);

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

  public execute(command: CaptureMissingBaselinesCommand): Promise<BaselineCaptureReport> {
    return this.repository.runExclusively(() => this.captureMissing(command));
  }

  private async captureMissing(
    command: CaptureMissingBaselinesCommand,
  ): Promise<BaselineCaptureReport> {
    const startedAt = this.clock.now();
    const challengeState = await this.repository.loadChallengeState();

    if (!challengeState.initialized) {
      throw new ChallengeNotInitializedError(challengeState.challengeId);
    }

    const candidates = this.resolveCandidates(command.participantId);
    const pending = await this.filterWithoutBaseline(candidates);

    // Nothing to do is a success, not a conflict: the operation is idempotent.
    if (pending.length === 0) {
      return this.buildReport(challengeState, startedAt, [], candidates.length);
    }

    this.timeliness.assertCaptureIsTimely(startedAt, command.acknowledgeLateBaseline);

    const outcomes = await mapWithConcurrency(
      pending,
      this.environment.riot.maxConcurrency,
      (definition) => this.capturer.capture(definition),
    );

    await this.registerCapturedParticipants(challengeState, outcomes);
    this.cache.invalidateAll();

    const captured = outcomes.filter((outcome) => outcome.result === 'INITIALIZED').length;
    const failed = outcomes.filter((outcome) => outcome.result === 'FAILED').length;

    if (failed > 0) {
      this.logger.warn(
        `${failed} of ${outcomes.length} pending participant(s) could not capture a baseline. ` +
          'The rest were incorporated and existing baselines are untouched.',
      );
    }

    return this.buildReport(
      challengeState,
      startedAt,
      outcomes,
      candidates.length - captured - failed,
    );
  }

  private resolveCandidates(participantId: string | undefined): readonly ParticipantDefinition[] {
    const enabled = this.registry.enabled();

    if (participantId === undefined) {
      return enabled;
    }

    const definition = enabled.find((candidate) => candidate.id === participantId);

    if (definition === undefined) {
      throw new ParticipantNotFoundError(participantId);
    }

    return [definition];
  }

  private async filterWithoutBaseline(
    definitions: readonly ParticipantDefinition[],
  ): Promise<readonly ParticipantDefinition[]> {
    const states = await mapWithConcurrency(
      definitions,
      this.environment.riot.maxConcurrency,
      (definition) => this.repository.loadParticipantState(definition.id),
    );

    return definitions.filter((_definition, index) => {
      const state = states[index];
      return state === null || state === undefined || state.baselineRank === null;
    });
  }

  /**
   * Adds the newly captured participants to the registered roster, keeping every global
   * flag as it was. `withRegisteredParticipant` is a no-op for anyone already present, so
   * an existing entry can never be rewritten.
   */
  private async registerCapturedParticipants(
    current: ChallengeState,
    outcomes: readonly ParticipantInitializationOutcome[],
  ): Promise<void> {
    const nextState = outcomes.reduce<ChallengeState>((state, outcome) => {
      if (outcome.puuid === null || outcome.baselineRank === null) {
        return state;
      }

      return withRegisteredParticipant(state, {
        participantId: outcome.participantId,
        puuid: outcome.puuid,
        initializedAt: outcome.baselineRank.capturedAt,
      });
    }, current);

    if (nextState === current) {
      return;
    }

    await this.repository.saveChallengeState(nextState);
  }

  private buildReport(
    challengeState: ChallengeState,
    startedAt: Date,
    outcomes: readonly ParticipantInitializationOutcome[],
    skipped: number,
  ): BaselineCaptureReport {
    const finishedAt = this.clock.now();

    return {
      challengeId: challengeState.challengeId,
      startedAt: toIsoDateTime(startedAt),
      finishedAt: toIsoDateTime(finishedAt),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      challengeStartAt: this.challenge.startAt,
      // Never recomputed here: a late incorporation does not move the global coverage.
      baselineCoverageStartAt: challengeState.initializedAt,
      captured: outcomes.filter((outcome) => outcome.result === 'INITIALIZED').length,
      skipped,
      failed: outcomes.filter((outcome) => outcome.result === 'FAILED').length,
      participants: outcomes,
    };
  }
}
