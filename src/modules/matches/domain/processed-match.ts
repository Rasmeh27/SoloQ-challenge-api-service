/**
 * A Ranked Solo/Duo match of a single participant, reduced to the fields the challenge
 * needs. The other nine participants of the match are intentionally not stored.
 * Timestamps are epoch milliseconds (UTC); `gameDuration` is seconds.
 */
export interface ProcessedMatch {
  readonly matchId: string;
  readonly gameCreation: number;
  readonly gameStartTimestamp: number;
  readonly gameEndTimestamp: number;
  readonly gameDuration: number;
  readonly queueId: number;
  readonly gameVersion: string;
  readonly win: boolean;
  readonly championId: number;
  readonly championName: string;
  readonly teamPosition: string;
  readonly individualPosition: string;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  readonly kda: number;
  readonly totalMinionsKilled: number;
  readonly neutralMinionsKilled: number;
  readonly totalCs: number;
  readonly visionScore: number;
  readonly goldEarned: number;
  readonly totalDamageDealtToChampions: number;
  /** Remake indicator. Remakes are stored, never silently discarded. */
  readonly gameEndedInEarlySurrender: boolean;
  readonly gameEndedInSurrender: boolean;
}

const MINIMUM_DEATHS_DIVISOR = 1;

/** kda = (kills + assists) / max(1, deaths) */
export function computeKda(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(MINIMUM_DEATHS_DIVISOR, deaths);
}
