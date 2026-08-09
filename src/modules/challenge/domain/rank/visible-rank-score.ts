import type { RankedPosition } from './ranked-position';
import {
  APEX_TIER_BASE_SCORE,
  DIVISION_OFFSET_SCORE,
  isApexTier,
  TIER_BASE_SCORE,
  tierLadderIndex,
} from './rank-tier';

/**
 * Score of the *visible* position on the ladder.
 *
 * This is not MMR, not ELO and not a skill estimation: it is only the position a
 * player currently occupies (tier, division and visible league points), which is what
 * the challenge measures.
 *
 *   IRON..DIAMOND: tierBase + divisionOffset + leaguePoints
 *   MASTER..CHALLENGER: apexBase + leaguePoints
 */
export function visibleRankScore(position: RankedPosition): number {
  if (isApexTier(position.tier)) {
    return APEX_TIER_BASE_SCORE + position.leaguePoints;
  }

  const divisionOffset = position.division === null ? 0 : DIVISION_OFFSET_SCORE[position.division];

  return TIER_BASE_SCORE[position.tier] + divisionOffset + position.leaguePoints;
}

/**
 * Ascending comparison of two visible positions.
 * The official ladder is compared structurally: tier first, then division and finally
 * league points. A player in a higher tier therefore stays above every player in a
 * lower tier, even when apex tiers have very different LP amounts.
 */
export function compareVisibleRank(left: RankedPosition, right: RankedPosition): number {
  const tierDifference = tierLadderIndex(left.tier) - tierLadderIndex(right.tier);

  if (tierDifference !== 0) {
    return tierDifference;
  }

  const leftDivision = left.division === null ? 0 : DIVISION_OFFSET_SCORE[left.division];
  const rightDivision = right.division === null ? 0 : DIVISION_OFFSET_SCORE[right.division];
  const divisionDifference = leftDivision - rightDivision;

  if (divisionDifference !== 0) {
    return divisionDifference;
  }

  return left.leaguePoints - right.leaguePoints;
}

export function isHigherVisibleRank(
  candidate: RankedPosition,
  reference: RankedPosition | null,
): boolean {
  if (reference === null) {
    return true;
  }

  return compareVisibleRank(candidate, reference) > 0;
}
