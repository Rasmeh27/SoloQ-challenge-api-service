import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../common/time/clock';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';
import type { ParticipantDefinition } from '../../../config/participants.config';
import { type DataFreshness, resolveDataFreshness } from '../../challenge/domain/data-freshness';
import { formatRiotId, type ParticipantState } from '../../challenge/domain/participant-state';
import {
  calculateRankProgress,
  type RankProgress,
} from '../../challenge/domain/rank/rank-progress';
import type { SyncStatus } from '../../challenge/domain/sync-status';
import {
  EMPTY_MATCH_STATISTICS,
  type MatchStatistics,
} from '../../matches/domain/match-statistics';

/**
 * Read model combining the static definition with the persisted state and the derived
 * values (progress, freshness, effective sync status). Response mappers consume this.
 */
export interface ParticipantView {
  readonly definition: ParticipantDefinition;
  readonly gameName: string;
  readonly tagLine: string;
  readonly riotId: string;
  readonly state: ParticipantState | null;
  readonly progress: RankProgress;
  readonly statistics: MatchStatistics;
  readonly syncStatus: SyncStatus;
  readonly dataFreshness: DataFreshness;
  /**
   * Instant from which the **rank progress** of this participant is measured: the baseline
   * capture, never the challenge start date, because a past ladder position cannot be
   * reconstructed. Matches and statistics are not bounded by it: those cover the whole
   * challenge period for everybody.
   */
  readonly baselineCoverageStartAt: string | null;
}

@Injectable()
export class ParticipantViewFactory {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration,
  ) {}

  public build(
    definition: ParticipantDefinition,
    state: ParticipantState | null,
    challengeInitialized: boolean,
  ): ParticipantView {
    const dataFreshness = resolveDataFreshness(
      state?.lastSuccessfulSyncAt ?? null,
      this.clock.now(),
      this.challenge.syncIntervalMinutes,
    );

    // The stored Riot ID wins: Riot IDs can be renamed and synchronization refreshes them.
    const gameName = state?.resolvedAccount.gameName ?? definition.gameName;
    const tagLine = state?.resolvedAccount.tagLine ?? definition.tagLine;

    return {
      definition,
      gameName,
      tagLine,
      riotId: formatRiotId(gameName, tagLine),
      state,
      progress: calculateRankProgress(state?.baselineRank ?? null, state?.currentRank ?? null),
      statistics: state?.matchStatistics ?? EMPTY_MATCH_STATISTICS,
      syncStatus: this.resolveSyncStatus(state, challengeInitialized, dataFreshness),
      dataFreshness,
      baselineCoverageStartAt: state?.baselineRank?.capturedAt ?? null,
    };
  }

  public buildAll(
    definitions: readonly ParticipantDefinition[],
    states: readonly ParticipantState[],
    challengeInitialized: boolean,
  ): ParticipantView[] {
    const statesById = new Map(states.map((state) => [state.participantId, state]));

    return definitions.map((definition) =>
      this.build(definition, statesById.get(definition.id) ?? null, challengeInitialized),
    );
  }

  /**
   * `PENDING_INITIALIZATION` and `STALE` are derived here, never persisted: a participant
   * added after initialization has no baseline and must not silently capture a new one.
   */
  private resolveSyncStatus(
    state: ParticipantState | null,
    challengeInitialized: boolean,
    dataFreshness: DataFreshness,
  ): SyncStatus {
    if (state === null || state.baselineRank === null) {
      return challengeInitialized ? 'PENDING_INITIALIZATION' : 'NEVER_SYNCED';
    }

    if (state.syncStatus === 'SUCCESS' && dataFreshness === 'STALE') {
      return 'STALE';
    }

    return state.syncStatus;
  }
}
