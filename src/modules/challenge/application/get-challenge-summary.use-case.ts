import { Inject, Injectable } from '@nestjs/common';

import { CACHE_KEYS, InMemoryCacheService } from '../../../common/cache/in-memory-cache.service';
import { CLOCK, type Clock } from '../../../common/time/clock';
import type { IsoDateTime } from '../../../common/time/iso-date-time';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';
import {
  type LeaderboardEntry,
  LeaderboardService,
} from '../../leaderboard/application/leaderboard.service';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import {
  CHALLENGE_STATE_REPOSITORY,
  type ChallengeStateRepository,
} from '../domain/challenge-state.repository';
import { type ChallengeStatus, ChallengeStatusResolver } from '../domain/challenge-status';
import { type DataFreshness, resolveDataFreshness } from '../domain/data-freshness';

export interface ChallengeSummary {
  readonly configuration: ChallengeConfiguration;
  readonly status: ChallengeStatus;
  readonly initialized: boolean;
  readonly initializedAt: IsoDateTime | null;
  /**
   * Instant from which visible progress is measured. Equal to `initializedAt`: progress is
   * never computed retroactively from `startAt`.
   */
  readonly baselineCoverageStartAt: IsoDateTime | null;
  readonly lastSynchronizationAt: IsoDateTime | null;
  readonly lastSuccessfulSynchronizationAt: IsoDateTime | null;
  readonly synchronizationInProgress: boolean;
  readonly dataFreshness: DataFreshness;
  readonly totalParticipants: number;
  readonly totalEnabledParticipants: number;
  readonly totalProcessedMatches: number;
  readonly leader: LeaderboardEntry | null;
}

/**
 * Public summary of the challenge: configuration, derived status, synchronization
 * information and the current leader. Answers from the local state, never from Riot.
 */
@Injectable()
export class GetChallengeSummaryUseCase {
  constructor(
    @Inject(CHALLENGE_STATE_REPOSITORY) private readonly repository: ChallengeStateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration,
    private readonly statusResolver: ChallengeStatusResolver,
    private readonly registry: ParticipantRegistry,
    private readonly leaderboard: LeaderboardService,
    private readonly cache: InMemoryCacheService,
  ) {}

  public execute(): Promise<ChallengeSummary> {
    return this.cache.getOrSet(CACHE_KEYS.challengeSummary, () => this.buildSummary());
  }

  private async buildSummary(): Promise<ChallengeSummary> {
    const challengeState = await this.repository.loadChallengeState();
    // Reuses the cached leaderboard read model instead of loading every state again.
    const leaderboardSnapshot = await this.leaderboard.getSnapshot();

    return {
      configuration: this.challenge,
      status: this.statusResolver.resolve(challengeState.initialized),
      initialized: challengeState.initialized,
      initializedAt: challengeState.initializedAt,
      baselineCoverageStartAt: challengeState.initializedAt,
      lastSynchronizationAt: challengeState.lastGlobalSyncAt,
      lastSuccessfulSynchronizationAt: challengeState.lastSuccessfulGlobalSyncAt,
      synchronizationInProgress: challengeState.synchronizationInProgress,
      dataFreshness: resolveDataFreshness(
        challengeState.lastSuccessfulGlobalSyncAt,
        this.clock.now(),
        this.challenge.syncIntervalMinutes,
      ),
      totalParticipants: this.registry.all().length,
      totalEnabledParticipants: this.registry.enabled().length,
      totalProcessedMatches: leaderboardSnapshot.entries.reduce(
        (total, entry) => total + (entry.participant.state?.processedMatches.length ?? 0),
        0,
      ),
      // A leader before any baseline exists would be meaningless.
      leader: challengeState.initialized ? (leaderboardSnapshot.entries[0] ?? null) : null,
    };
  }
}
