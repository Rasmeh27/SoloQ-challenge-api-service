/**
 * Ordered comparison criteria applied by the leaderboard.
 * The active order lives in `challenge.config.ts`, so the ranking rules are
 * configuration and not code.
 */
export const LEADERBOARD_TIE_BREAKERS = [
  /** Current official position, compared by tier, division and current LP. */
  'CURRENT_VISIBLE_RANK',
  /** Visible progress during the event. `null` values are always pushed to the end. */
  'PROGRESS_UNITS',
  /** Current visible league points. */
  'LEAGUE_POINTS',
  /** Wins inside the challenge period (Match-V5), never lifetime wins. */
  'EVENT_WINS',
  /** Win rate inside the challenge period. */
  'EVENT_WIN_RATE',
  /** Deterministic final tie breaker. */
  'RIOT_ID',
] as const;

export type LeaderboardTieBreaker = (typeof LEADERBOARD_TIE_BREAKERS)[number];
