export const RANK_TIERS = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  'MASTER',
  'GRANDMASTER',
  'CHALLENGER',
] as const;

export type RankTier = (typeof RANK_TIERS)[number];

export const RANK_DIVISIONS = ['IV', 'III', 'II', 'I'] as const;

export type RankDivision = (typeof RANK_DIVISIONS)[number];

/** Tiers without divisions, where league points keep growing without a cap. */
export const APEX_TIERS = ['MASTER', 'GRANDMASTER', 'CHALLENGER'] as const;

export type ApexTier = (typeof APEX_TIERS)[number];

/**
 * Base score of every tier on the visible ladder.
 *
 * Apex tiers deliberately share the same base: their separation is the league point
 * amount itself, so no artificial thousand point jumps are introduced between
 * Master, Grandmaster and Challenger. The apex tier is still kept as a separate value
 * for presentation and tie breaking.
 */
export const APEX_TIER_BASE_SCORE = 2_800;

export const TIER_BASE_SCORE: Readonly<Record<RankTier, number>> = {
  IRON: 0,
  BRONZE: 400,
  SILVER: 800,
  GOLD: 1_200,
  PLATINUM: 1_600,
  EMERALD: 2_000,
  DIAMOND: 2_400,
  MASTER: APEX_TIER_BASE_SCORE,
  GRANDMASTER: APEX_TIER_BASE_SCORE,
  CHALLENGER: APEX_TIER_BASE_SCORE,
};

export const DIVISION_OFFSET_SCORE: Readonly<Record<RankDivision, number>> = {
  IV: 0,
  III: 100,
  II: 200,
  I: 300,
};

export function isApexTier(tier: RankTier): tier is ApexTier {
  return (APEX_TIERS as readonly RankTier[]).includes(tier);
}

export function isRankTier(value: string): value is RankTier {
  return (RANK_TIERS as readonly string[]).includes(value);
}

export function isRankDivision(value: string): value is RankDivision {
  return (RANK_DIVISIONS as readonly string[]).includes(value);
}

/** Position of the tier on the ladder. Only used for deterministic comparisons. */
export function tierLadderIndex(tier: RankTier): number {
  return RANK_TIERS.indexOf(tier);
}

/** `EMERALD` -> `Emerald`. Presentation helper, never used for comparisons. */
export function formatTierName(tier: RankTier): string {
  return `${tier.charAt(0)}${tier.slice(1).toLowerCase()}`;
}
