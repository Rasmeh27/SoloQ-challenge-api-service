import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { InMemoryCacheService } from '../../../common/cache/in-memory-cache.service';
import {
  ChallengeNotInitializedError,
  SynchronizationAlreadyRunningError,
} from '../../../common/exceptions/application.exceptions';
import { toSafeErrorDescriptor } from '../../../common/exceptions/safe-error';
import { CLOCK, type Clock } from '../../../common/time/clock';
import { type IsoDateTime, toIsoDateTime } from '../../../common/time/iso-date-time';
import { MILLISECONDS_PER_MINUTE } from '../../../common/time/time.constants';
import { mapWithConcurrency } from '../../../common/utils/concurrency';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';
import { type AppEnvironment, environmentConfig } from '../../../config/environment.config';
import type { ParticipantDefinition } from '../../../config/participants.config';
import type { ChallengeState } from '../../challenge/domain/challenge-state';
import {
  CHALLENGE_STATE_REPOSITORY,
  type ChallengeStateRepository,
} from '../../challenge/domain/challenge-state.repository';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import { countersSince, RiotRequestMeter } from '../../riot/domain/riot-request.meter';
import {
  buildGlobalSynchronizationReport,
  type GlobalSynchronizationReport,
  type ParticipantSynchronizationReport,
  type ParticipantSynchronizationResult,
} from '../domain/synchronization.report';
import { ParticipantSynchronizer } from './participant-synchronizer';

const MIN_SYNCHRONIZATION_LOCK_TIMEOUT_MINUTES = 15;
const SYNCHRONIZATION_LOCK_TIMEOUT_MULTIPLIER = 3;

export interface SynchronizationStatus {
  readonly challengeInitialized: boolean;
  readonly inProgress: boolean;
  readonly scheduledSynchronizationEnabled: boolean;
  readonly syncIntervalMinutes: number;
  readonly lastGlobalSyncAt: IsoDateTime | null;
  readonly lastSuccessfulGlobalSyncAt: IsoDateTime | null;
  readonly lastReport: GlobalSynchronizationReport | null;
}

/**
 * Coordinates synchronization runs.
 *
 * Only one run at a time (in-memory guard, single process by design). A failing
 * participant never aborts the others. The persisted `synchronizationInProgress` flag is
 * only used for observability and is reset while booting in case of a previous crash.
 */
@Injectable()
export class SynchronizationOrchestrator implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SynchronizationOrchestrator.name);
  private running = false;
  private currentRun: Promise<unknown> | null = null;
  private lastReport: GlobalSynchronizationReport | null = null;

  constructor(
    @Inject(CHALLENGE_STATE_REPOSITORY) private readonly repository: ChallengeStateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(environmentConfig.KEY) private readonly environment: AppEnvironment,
    @Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration,
    private readonly registry: ParticipantRegistry,
    private readonly synchronizer: ParticipantSynchronizer,
    private readonly cache: InMemoryCacheService,
    private readonly requestMeter: RiotRequestMeter,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    if (this.environment.storageDriver === 'vercel-blob') {
      // A Vercel function can start while another instance is processing the cron job.
      // Never clear a persisted flag merely because this particular instance is cold.
      return;
    }

    try {
      const state = await this.repository.loadChallengeState();

      if (state.synchronizationInProgress) {
        this.logger.warn(
          'Found a synchronization marked as in progress from a previous run; resetting the flag.',
        );
        await this.repository.saveChallengeState({
          ...state,
          synchronizationInProgress: false,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Could not inspect the stored challenge state while booting: ${toSafeErrorDescriptor(error).code}`,
      );
    }
  }

  /** Lets an in-flight run finish before the process exits, so no write is left halfway. */
  public async onApplicationShutdown(): Promise<void> {
    if (this.currentRun === null) {
      return;
    }

    this.logger.log('Waiting for the in-flight synchronization to finish before shutting down.');

    try {
      await this.currentRun;
    } catch {
      // Already reported by the run itself.
    }
  }

  public get isRunning(): boolean {
    return this.running;
  }

  public async runGlobalSynchronization(): Promise<GlobalSynchronizationReport> {
    this.acquireRunSlot();
    const run = this.executeGlobalSynchronization();
    this.currentRun = run;

    try {
      return await run;
    } finally {
      this.releaseRunSlot();
    }
  }

  public async runParticipantSynchronization(
    participantId: string,
  ): Promise<ParticipantSynchronizationResult> {
    const definition = this.registry.require(participantId);

    this.acquireRunSlot();
    const run = this.executeParticipantSynchronization(definition);
    this.currentRun = run;

    try {
      return await run;
    } finally {
      this.releaseRunSlot();
    }
  }

  public async status(): Promise<SynchronizationStatus> {
    const state = await this.repository.loadChallengeState();

    return {
      challengeInitialized: state.initialized,
      inProgress: this.running || state.synchronizationInProgress,
      scheduledSynchronizationEnabled: this.environment.synchronizationEnabled,
      syncIntervalMinutes: this.challenge.syncIntervalMinutes,
      lastGlobalSyncAt: state.lastGlobalSyncAt,
      lastSuccessfulGlobalSyncAt: state.lastSuccessfulGlobalSyncAt,
      lastReport: this.lastReport,
    };
  }

  private async executeGlobalSynchronization(): Promise<GlobalSynchronizationReport> {
    const startedAt = this.clock.now();
    await this.assertChallengeInitialized();
    await this.markGlobalSynchronizationStarted(startedAt);

    const requestsBefore = this.requestMeter.snapshot();

    try {
      const definitions = this.registry.enabled();
      // Participants are processed with bounded concurrency; each Riot request is in turn
      // capped globally by the HTTP client semaphore.
      const reports = await mapWithConcurrency(
        definitions,
        this.environment.riot.maxConcurrency,
        (definition) => this.synchronizeSafely(definition),
      );

      const report = buildGlobalSynchronizationReport(
        startedAt,
        this.clock.now(),
        reports,
        countersSince(requestsBefore, this.requestMeter.snapshot()),
      );
      this.lastReport = report;

      await this.markGlobalSynchronizationFinished(report);
      this.invalidateCachesIfAnythingChanged(report.successfulParticipants);

      this.logger.log(
        `Synchronization finished in ${report.durationMs}ms: ` +
          `${report.successfulParticipants} ok, ${report.failedParticipants} failed, ` +
          `${report.skippedParticipants} pending initialization, ` +
          `${report.newMatchesProcessed} new match(es), ${report.riotRequests.total} Riot request(s).`,
      );

      return report;
    } catch (error) {
      await this.clearInProgressFlag();
      throw error;
    }
  }

  private async executeParticipantSynchronization(
    definition: ParticipantDefinition,
  ): Promise<ParticipantSynchronizationResult> {
    await this.assertChallengeInitialized();

    // The run slot guarantees exclusivity, so the counter difference belongs to this
    // participant only.
    const requestsBefore = this.requestMeter.snapshot();
    const participant = await this.synchronizeSafely(definition);
    this.invalidateCachesIfAnythingChanged(participant.status === 'FAILED' ? 0 : 1);

    return {
      participant,
      riotRequests: countersSince(requestsBefore, this.requestMeter.snapshot()),
    };
  }

  /** A single participant failure is recorded and never propagated to the whole run. */
  private async synchronizeSafely(
    definition: ParticipantDefinition,
  ): Promise<ParticipantSynchronizationReport> {
    try {
      return await this.synchronizer.synchronize(definition);
    } catch (error) {
      const safeError = toSafeErrorDescriptor(error);

      this.logger.error(
        `Unexpected error while synchronizing participant "${definition.id}": ${safeError.code}`,
      );

      return {
        participantId: definition.id,
        riotId: this.registry.riotIdOf(definition),
        status: 'FAILED',
        newMatchesProcessed: 0,
        rankUpdated: false,
        snapshotCaptured: false,
        error: safeError,
      };
    }
  }

  private async assertChallengeInitialized(): Promise<void> {
    const state = await this.repository.loadChallengeState();

    if (!state.initialized) {
      throw new ChallengeNotInitializedError(state.challengeId);
    }
  }

  private markGlobalSynchronizationStarted(startedAt: Date): Promise<void> {
    return this.repository.runExclusively(async () => {
      const state = await this.repository.loadChallengeState();

      if (state.synchronizationInProgress && !this.hasStaleSynchronizationLock(state, startedAt)) {
        throw new SynchronizationAlreadyRunningError();
      }

      if (state.synchronizationInProgress) {
        this.logger.warn('Replacing a stale persisted synchronization lock.');
      }

      await this.repository.saveChallengeState({
        ...state,
        synchronizationInProgress: true,
        lastGlobalSyncAt: toIsoDateTime(startedAt),
      });
    });
  }

  private markGlobalSynchronizationFinished(report: GlobalSynchronizationReport): Promise<void> {
    const completedWithoutFailures = report.failedParticipants === 0;

    return this.updateChallengeState((state) => ({
      ...state,
      synchronizationInProgress: false,
      lastSuccessfulGlobalSyncAt: completedWithoutFailures
        ? report.finishedAt
        : state.lastSuccessfulGlobalSyncAt,
    }));
  }

  private async clearInProgressFlag(): Promise<void> {
    try {
      await this.updateChallengeState((state) => ({
        ...state,
        synchronizationInProgress: false,
      }));
    } catch (error) {
      this.logger.warn(
        `Could not clear the synchronization flag: ${toSafeErrorDescriptor(error).code}`,
      );
    }
  }

  private updateChallengeState(mutate: (state: ChallengeState) => ChallengeState): Promise<void> {
    return this.repository.runExclusively(async () => {
      const state = await this.repository.loadChallengeState();
      await this.repository.saveChallengeState(mutate(state));
    });
  }

  private invalidateCachesIfAnythingChanged(updatedParticipants: number): void {
    if (updatedParticipants > 0) {
      this.cache.invalidateAll();
    }
  }

  private hasStaleSynchronizationLock(state: ChallengeState, now: Date): boolean {
    if (state.lastGlobalSyncAt === null) {
      return true;
    }

    const startedAt = Date.parse(state.lastGlobalSyncAt);
    if (Number.isNaN(startedAt)) {
      return true;
    }

    const timeoutMinutes = Math.max(
      MIN_SYNCHRONIZATION_LOCK_TIMEOUT_MINUTES,
      this.challenge.syncIntervalMinutes * SYNCHRONIZATION_LOCK_TIMEOUT_MULTIPLIER,
    );

    return now.getTime() - startedAt >= timeoutMinutes * MILLISECONDS_PER_MINUTE;
  }

  /** Set synchronously, before any `await`, so two concurrent callers cannot both pass. */
  private acquireRunSlot(): void {
    if (this.running) {
      throw new SynchronizationAlreadyRunningError();
    }

    this.running = true;
  }

  private releaseRunSlot(): void {
    this.running = false;
    this.currentRun = null;
  }
}
