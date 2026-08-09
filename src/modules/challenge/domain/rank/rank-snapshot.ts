import type { IsoDateTime } from '../../../../common/time/iso-date-time';
import type { RankedPosition } from './ranked-position';
import type { RankDivision, RankTier } from './rank-tier';
import { visibleRankScore } from './visible-rank-score';

/**
 * Point in time observation of the visible position, used to build the historic chart
 * of the event. Snapshots are only ever appended from real observations; historic ranks
 * are never reconstructed from match history.
 */
export interface RankSnapshot {
  readonly capturedAt: IsoDateTime;
  /** `null` when the participant was UNRANKED at capture time. */
  readonly tier: RankTier | null;
  readonly division: RankDivision | null;
  readonly leaguePoints: number | null;
  readonly wins: number | null;
  readonly losses: number | null;
  readonly visibleRankScore: number | null;
}

export function toRankSnapshot(
  position: RankedPosition | null,
  capturedAt: IsoDateTime,
): RankSnapshot {
  if (position === null) {
    return {
      capturedAt,
      tier: null,
      division: null,
      leaguePoints: null,
      wins: null,
      losses: null,
      visibleRankScore: null,
    };
  }

  return {
    capturedAt,
    tier: position.tier,
    division: position.division,
    leaguePoints: position.leaguePoints,
    wins: position.wins,
    losses: position.losses,
    visibleRankScore: visibleRankScore(position),
  };
}

/** True when the snapshot already describes exactly the same observable state. */
export function describesSameRankState(
  snapshot: RankSnapshot,
  position: RankedPosition | null,
): boolean {
  if (position === null) {
    return snapshot.tier === null && snapshot.leaguePoints === null;
  }

  return (
    snapshot.tier === position.tier &&
    snapshot.division === position.division &&
    snapshot.leaguePoints === position.leaguePoints &&
    snapshot.wins === position.wins &&
    snapshot.losses === position.losses
  );
}
