import { RANKED_SOLO_QUEUE_TYPE } from '../../../../config/riot.constants';
import type { RankedPosition } from '../../../challenge/domain/rank/ranked-position';
import {
  isApexTier,
  isRankDivision,
  isRankTier,
  type RankDivision,
  type RankTier,
} from '../../../challenge/domain/rank/rank-tier';
import { RiotUnexpectedResponseError } from '../../domain/riot.errors';
import type { RiotLeagueEntryResponse } from '../dto/riot-responses';

function resolveDivision(tier: RankTier, rank: string | undefined): RankDivision | null {
  if (isApexTier(tier) || rank === undefined) {
    return null;
  }

  const normalizedRank = rank.toUpperCase();

  return isRankDivision(normalizedRank) ? normalizedRank : null;
}

/**
 * Maps a League-V4 entry to the domain position.
 *
 * `leaguePoints` is the visible league point amount reported by Riot. It is not MMR and
 * nothing in this application infers MMR from it.
 */
export function toRankedPosition(
  entry: RiotLeagueEntryResponse,
  operation: string,
): RankedPosition {
  const normalizedTier = entry.tier.toUpperCase();

  if (!isRankTier(normalizedTier)) {
    throw new RiotUnexpectedResponseError(operation, `unknown tier "${entry.tier}"`);
  }

  return {
    queueType: RANKED_SOLO_QUEUE_TYPE,
    tier: normalizedTier,
    division: resolveDivision(normalizedTier, entry.rank),
    leaguePoints: entry.leaguePoints,
    wins: entry.wins,
    losses: entry.losses,
    veteran: entry.veteran ?? null,
    inactive: entry.inactive ?? null,
    freshBlood: entry.freshBlood ?? null,
    hotStreak: entry.hotStreak ?? null,
  };
}
