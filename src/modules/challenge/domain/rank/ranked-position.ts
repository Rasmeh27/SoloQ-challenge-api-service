import type { IsoDateTime } from '../../../../common/time/iso-date-time';
import type { RANKED_SOLO_QUEUE_TYPE } from '../../../../config/riot.constants';
import { formatTierName, isApexTier, type RankDivision, type RankTier } from './rank-tier';

export type RankedQueueType = typeof RANKED_SOLO_QUEUE_TYPE;

const DISPLAY_SEPARATOR = ' · ';
const LEAGUE_POINTS_SUFFIX = 'LP';

/**
 * Current visible ranked position as reported by Riot.
 *
 * Absence of a position (no Ranked Solo/Duo entry) is modelled as `null` at the call
 * sites, which the API exposes as UNRANKED. Flags are nullable because Riot may stop
 * returning them.
 */
export interface RankedPosition {
  readonly queueType: RankedQueueType;
  readonly tier: RankTier;
  /** `null` for apex tiers, which have no division. */
  readonly division: RankDivision | null;
  readonly leaguePoints: number;
  readonly wins: number;
  readonly losses: number;
  readonly veteran: boolean | null;
  readonly inactive: boolean | null;
  readonly freshBlood: boolean | null;
  readonly hotStreak: boolean | null;
}

/**
 * Position captured once, when the challenge is initialized.
 *
 * `rank === null` means the participant was UNRANKED at capture time, which is a valid
 * baseline and different from "no baseline captured yet" (represented by a `null`
 * `BaselineRank`). Baselines are never replaced afterwards, and `capturedAt` is the
 * instant from which the visible progress of this participant is measured.
 */
export interface BaselineRank {
  readonly rank: RankedPosition | null;
  readonly capturedAt: IsoDateTime;
}

/** Best visible position observed during the event. */
export interface HighestObservedRank {
  readonly rank: RankedPosition;
  readonly observedAt: IsoDateTime;
}

/** `Emerald I · 72 LP` / `Master · 245 LP`. */
export function formatRankDisplayName(position: RankedPosition): string {
  const tierName = formatTierName(position.tier);
  const tierWithDivision =
    isApexTier(position.tier) || position.division === null
      ? tierName
      : `${tierName} ${position.division}`;

  return `${tierWithDivision}${DISPLAY_SEPARATOR}${position.leaguePoints} ${LEAGUE_POINTS_SUFFIX}`;
}

/**
 * True when both positions describe the same observable state.
 * Used to decide whether a snapshot is worth storing and whether the rank changed during a
 * synchronization. Riot flags (veteran, hot streak, ...) are ignored on purpose: they are
 * decorations, not ladder position.
 */
export function hasSameVisiblePosition(
  left: RankedPosition | null,
  right: RankedPosition | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return (
    left.tier === right.tier &&
    left.division === right.division &&
    left.leaguePoints === right.leaguePoints &&
    left.wins === right.wins &&
    left.losses === right.losses
  );
}
