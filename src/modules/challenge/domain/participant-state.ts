import type { IsoDateTime } from '../../../common/time/iso-date-time';
import type { RiotPlatform } from '../../../config/routing.config';
import type { MatchStatistics } from '../../matches/domain/match-statistics';
import type { ProcessedMatch } from '../../matches/domain/processed-match';
import type { RankSnapshot } from './rank/rank-snapshot';
import type { BaselineRank, HighestObservedRank, RankedPosition } from './rank/ranked-position';
import type { PersistedSyncStatus } from './sync-status';

/** Riot account resolved from the configured Riot ID. The PUUID is the stable key. */
export interface ResolvedAccount {
  readonly puuid: string;
  readonly gameName: string;
  readonly tagLine: string;
  readonly platform: RiotPlatform;
  readonly resolvedAt: IsoDateTime;
}

/** Last synchronization error, stored in a safe shape (no Riot payloads, no stacks). */
export interface ParticipantSyncError {
  readonly code: string;
  readonly message: string;
  readonly occurredAt: IsoDateTime;
}

export interface ParticipantState {
  readonly participantId: string;
  readonly resolvedAccount: ResolvedAccount;
  readonly puuid: string;
  readonly summonerId: string | null;
  readonly profileIconId: number | null;
  readonly summonerLevel: number | null;
  /** Last Summoner-V4 refresh. Drives the profile TTL so the endpoint is not polled every cycle. */
  readonly profileRefreshedAt: IsoDateTime | null;
  /**
   * Position captured when this participant joined. `capturedAt` is the instant from which
   * their **rank progress** is measurable; it never limits which matches are counted.
   */
  readonly baselineRank: BaselineRank | null;
  /**
   * Earliest instant for which Match-V5 has actually been queried for this participant.
   *
   * Bookkeeping only, never a business rule: matches always count from `challenge.startAt`.
   * It exists so a participant incorporated late can be backfilled, because an incremental
   * window anchored on the newest stored match would never reach back. `null` means the
   * history was never swept, so the next synchronization backfills from `challenge.startAt`.
   */
  readonly earliestMatchCoverageAt: IsoDateTime | null;
  readonly currentRank: RankedPosition | null;
  readonly highestObservedRank: HighestObservedRank | null;
  /** Chronological history used to build the progression chart. */
  readonly rankSnapshots: readonly RankSnapshot[];
  /** Newest first, deduplicated by `matchId`. */
  readonly processedMatches: readonly ProcessedMatch[];
  readonly matchStatistics: MatchStatistics;
  readonly lastSyncAt: IsoDateTime | null;
  readonly lastSuccessfulSyncAt: IsoDateTime | null;
  readonly syncStatus: PersistedSyncStatus;
  readonly lastError: ParticipantSyncError | null;
}

export function formatRiotId(gameName: string, tagLine: string): string {
  return `${gameName}#${tagLine}`;
}
