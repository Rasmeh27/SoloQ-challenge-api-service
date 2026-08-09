import { compareVisibleRank } from '../../challenge/domain/rank/visible-rank-score';
import type { RankedPosition } from '../../challenge/domain/rank/ranked-position';
import type { LeaderboardTieBreaker } from './leaderboard-tie-breaker';

/**
 * Minimal shape the ordering needs. Keeping it structural lets the domain sort without
 * knowing about read models, states or DTOs.
 */
export interface LeaderboardCandidate {
  readonly riotId: string;
  /** `null` when the progress is not computable; those entries always go last. */
  readonly progressUnits: number | null;
  /** `null` when UNRANKED. */
  readonly currentRank: RankedPosition | null;
  readonly leaguePoints: number | null;
  /** Wins inside the challenge period, never lifetime wins. */
  readonly eventWins: number;
  readonly eventWinRate: number;
}

type LeaderboardComparator = (left: LeaderboardCandidate, right: LeaderboardCandidate) => number;

/** Descending order where `null` is always pushed to the end, regardless of direction. */
function compareNullableDescending(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return right - left;
}

/** Descending official ladder order where UNRANKED entries always go last. */
function compareCurrentRank(left: RankedPosition | null, right: RankedPosition | null): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return compareVisibleRank(right, left);
}

const COMPARATORS: Readonly<Record<LeaderboardTieBreaker, LeaderboardComparator>> = {
  PROGRESS_UNITS: (left, right) =>
    compareNullableDescending(left.progressUnits, right.progressUnits),
  CURRENT_VISIBLE_RANK: (left, right) => compareCurrentRank(left.currentRank, right.currentRank),
  LEAGUE_POINTS: (left, right) => compareNullableDescending(left.leaguePoints, right.leaguePoints),
  EVENT_WINS: (left, right) => right.eventWins - left.eventWins,
  EVENT_WIN_RATE: (left, right) => right.eventWinRate - left.eventWinRate,
  RIOT_ID: (left, right) => left.riotId.localeCompare(right.riotId),
};

export function buildLeaderboardComparator(
  tieBreakers: readonly LeaderboardTieBreaker[],
): LeaderboardComparator {
  return (left, right) => {
    for (const tieBreaker of tieBreakers) {
      const result = COMPARATORS[tieBreaker](left, right);

      if (result !== 0) {
        return result;
      }
    }

    return 0;
  };
}

/** Stable sort driven by the configured tie breakers. Never mutates the input. */
export function sortLeaderboardCandidates<TCandidate extends LeaderboardCandidate>(
  candidates: readonly TCandidate[],
  tieBreakers: readonly LeaderboardTieBreaker[],
): TCandidate[] {
  return [...candidates].sort(buildLeaderboardComparator(tieBreakers));
}
