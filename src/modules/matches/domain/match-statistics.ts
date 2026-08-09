import { SECONDS_PER_MINUTE } from '../../../common/time/time.constants';
import { safeDivide } from '../../../common/utils/numbers';
import { sortMatchesByRecency } from './match-collection';
import { computeKda, type ProcessedMatch } from './processed-match';

const PERCENTAGE_FACTOR = 100;

export interface MostPlayedChampion {
  readonly championId: number;
  readonly championName: string;
  readonly games: number;
}

/**
 * Statistics computed by this application from Match-V5 data restricted to the challenge
 * period. They must never be mixed with the lifetime wins/losses reported by League-V4.
 *
 * Values keep full precision here; rounding happens only in the response mappers.
 */
export interface MatchStatistics {
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  /** Percentage in the 0..100 range. `0` when no games were played. */
  readonly winRate: number;
  readonly totalKills: number;
  readonly totalDeaths: number;
  readonly totalAssists: number;
  readonly averageKills: number;
  readonly averageDeaths: number;
  readonly averageAssists: number;
  /** Aggregated KDA of the period: (totalKills + totalAssists) / max(1, totalDeaths). */
  readonly averageKda: number;
  readonly totalCs: number;
  readonly averageCs: number;
  readonly averageCsPerMinute: number;
  readonly averageVisionScore: number;
  readonly averageDamageToChampions: number;
  readonly uniqueChampionsPlayed: number;
  readonly mostPlayedChampion: MostPlayedChampion | null;
  readonly currentWinStreak: number;
  readonly longestWinStreak: number;
  readonly earlySurrenderGames: number;
  readonly surrenderGames: number;
}

export const EMPTY_MATCH_STATISTICS: MatchStatistics = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  totalKills: 0,
  totalDeaths: 0,
  totalAssists: 0,
  averageKills: 0,
  averageDeaths: 0,
  averageAssists: 0,
  averageKda: 0,
  totalCs: 0,
  averageCs: 0,
  averageCsPerMinute: 0,
  averageVisionScore: 0,
  averageDamageToChampions: 0,
  uniqueChampionsPlayed: 0,
  mostPlayedChampion: null,
  currentWinStreak: 0,
  longestWinStreak: 0,
  earlySurrenderGames: 0,
  surrenderGames: 0,
};

interface ChampionUsage {
  readonly championId: number;
  readonly championName: string;
  games: number;
}

interface Totals {
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  visionScore: number;
  damageToChampions: number;
  durationSeconds: number;
  earlySurrenderGames: number;
  surrenderGames: number;
}

function createTotals(): Totals {
  return {
    wins: 0,
    losses: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    cs: 0,
    visionScore: 0,
    damageToChampions: 0,
    durationSeconds: 0,
    earlySurrenderGames: 0,
    surrenderGames: 0,
  };
}

function accumulate(
  totals: Totals,
  championUsage: Map<number, ChampionUsage>,
  match: ProcessedMatch,
): void {
  if (match.win) {
    totals.wins += 1;
  } else {
    totals.losses += 1;
  }

  totals.kills += match.kills;
  totals.deaths += match.deaths;
  totals.assists += match.assists;
  totals.cs += match.totalCs;
  totals.visionScore += match.visionScore;
  totals.damageToChampions += match.totalDamageDealtToChampions;
  totals.durationSeconds += match.gameDuration;

  if (match.gameEndedInEarlySurrender) {
    totals.earlySurrenderGames += 1;
  }

  if (match.gameEndedInSurrender) {
    totals.surrenderGames += 1;
  }

  const usage = championUsage.get(match.championId);

  if (usage) {
    usage.games += 1;
    return;
  }

  championUsage.set(match.championId, {
    championId: match.championId,
    championName: match.championName,
    games: 1,
  });
}

function resolveMostPlayedChampion(usage: Map<number, ChampionUsage>): MostPlayedChampion | null {
  let best: ChampionUsage | null = null;

  for (const candidate of usage.values()) {
    if (
      best === null ||
      candidate.games > best.games ||
      (candidate.games === best.games &&
        candidate.championName.localeCompare(best.championName) < 0)
    ) {
      best = candidate;
    }
  }

  return best === null
    ? null
    : { championId: best.championId, championName: best.championName, games: best.games };
}

/** Consecutive wins counting back from the most recent match. */
function currentWinStreakOf(newestFirst: readonly ProcessedMatch[]): number {
  let streak = 0;

  for (const match of newestFirst) {
    if (!match.win) {
      break;
    }

    streak += 1;
  }

  return streak;
}

function longestWinStreakOf(matches: readonly ProcessedMatch[]): number {
  let longest = 0;
  let current = 0;

  for (const match of matches) {
    current = match.win ? current + 1 : 0;
    longest = Math.max(longest, current);
  }

  return longest;
}

/**
 * Computes the statistics of the challenge period from already filtered matches.
 *
 * Pure: it derives everything from its input and never touches Riot, storage or the clock.
 * Averages are `0` (never `NaN`/`Infinity`) when there are no games, and the input order is
 * normalised locally so streaks never depend on the caller.
 */
export function calculateMatchStatistics(matches: readonly ProcessedMatch[]): MatchStatistics {
  if (matches.length === 0) {
    return EMPTY_MATCH_STATISTICS;
  }

  const newestFirst = sortMatchesByRecency(matches);
  const totals = createTotals();
  const championUsage = new Map<number, ChampionUsage>();

  for (const match of newestFirst) {
    accumulate(totals, championUsage, match);
  }

  const gamesPlayed = newestFirst.length;

  return {
    gamesPlayed,
    wins: totals.wins,
    losses: totals.losses,
    winRate: safeDivide(totals.wins, gamesPlayed) * PERCENTAGE_FACTOR,
    totalKills: totals.kills,
    totalDeaths: totals.deaths,
    totalAssists: totals.assists,
    averageKills: safeDivide(totals.kills, gamesPlayed),
    averageDeaths: safeDivide(totals.deaths, gamesPlayed),
    averageAssists: safeDivide(totals.assists, gamesPlayed),
    averageKda: computeKda(totals.kills, totals.deaths, totals.assists),
    totalCs: totals.cs,
    averageCs: safeDivide(totals.cs, gamesPlayed),
    averageCsPerMinute: safeDivide(totals.cs, totals.durationSeconds / SECONDS_PER_MINUTE),
    averageVisionScore: safeDivide(totals.visionScore, gamesPlayed),
    averageDamageToChampions: safeDivide(totals.damageToChampions, gamesPlayed),
    uniqueChampionsPlayed: championUsage.size,
    mostPlayedChampion: resolveMostPlayedChampion(championUsage),
    currentWinStreak: currentWinStreakOf(newestFirst),
    longestWinStreak: longestWinStreakOf(newestFirst),
    earlySurrenderGames: totals.earlySurrenderGames,
    surrenderGames: totals.surrenderGames,
  };
}
