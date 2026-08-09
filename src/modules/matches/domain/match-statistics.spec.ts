import { aProcessedMatch } from '../../../test-support/builders';
import { calculateMatchStatistics, EMPTY_MATCH_STATISTICS } from './match-statistics';
import type { ProcessedMatch } from './processed-match';

describe('MatchStatisticsCalculator', () => {
  function match(overrides: Partial<ProcessedMatch>): ProcessedMatch {
    return aProcessedMatch(overrides);
  }

  it('returns zeroed statistics without games and never NaN or Infinity', () => {
    const statistics = calculateMatchStatistics([]);

    expect(statistics.gamesPlayed).toBe(0);
    expect(statistics.winRate).toBe(0);
    expect(statistics.averageKda).toBe(0);
    expect(statistics.averageCsPerMinute).toBe(0);
    expect(statistics.mostPlayedChampion).toBeNull();

    for (const value of Object.values(statistics)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value)).toBe(true);
      }
    }

    expect(EMPTY_MATCH_STATISTICS).toEqual(statistics);
  });

  it('computes the aggregated KDA using max(1, deaths) so zero deaths do not divide by zero', () => {
    const statistics = calculateMatchStatistics([
      match({ matchId: 'm1', kills: 5, deaths: 0, assists: 5 }),
    ]);

    expect(statistics.totalDeaths).toBe(0);
    expect(statistics.averageKda).toBe(10);
    expect(Number.isFinite(statistics.averageKda)).toBe(true);
  });

  it('computes the win rate as a percentage of played games', () => {
    const statistics = calculateMatchStatistics([
      match({ matchId: 'm1', win: true }),
      match({ matchId: 'm2', win: true }),
      match({ matchId: 'm3', win: false }),
    ]);

    expect(statistics.gamesPlayed).toBe(3);
    expect(statistics.wins).toBe(2);
    expect(statistics.losses).toBe(1);
    expect(statistics.winRate).toBeCloseTo(66.6667, 3);
  });

  it('keeps full precision while accumulating, leaving rounding to the response mappers', () => {
    const statistics = calculateMatchStatistics([
      match({ matchId: 'm1', kills: 1, deaths: 3, assists: 1 }),
      match({ matchId: 'm2', kills: 2, deaths: 3, assists: 1 }),
      match({ matchId: 'm3', kills: 4, deaths: 3, assists: 1 }),
    ]);

    expect(statistics.averageKills).toBeCloseTo(2.3333, 4);
  });

  it('computes cs per minute from the accumulated duration', () => {
    const statistics = calculateMatchStatistics([
      match({
        matchId: 'm1',
        totalMinionsKilled: 200,
        neutralMinionsKilled: 0,
        gameDuration: 1_200,
      }),
      match({ matchId: 'm2', totalMinionsKilled: 100, neutralMinionsKilled: 0, gameDuration: 600 }),
    ]);

    // 300 cs over 30 minutes
    expect(statistics.totalCs).toBe(300);
    expect(statistics.averageCsPerMinute).toBeCloseTo(10, 5);
  });

  describe('streaks', () => {
    const newestFirst = [
      match({ matchId: 'm6', win: true, gameStartTimestamp: 600 }),
      match({ matchId: 'm5', win: true, gameStartTimestamp: 500 }),
      match({ matchId: 'm4', win: false, gameStartTimestamp: 400 }),
      match({ matchId: 'm3', win: true, gameStartTimestamp: 300 }),
      match({ matchId: 'm2', win: true, gameStartTimestamp: 200 }),
      match({ matchId: 'm1', win: true, gameStartTimestamp: 100 }),
    ];

    it('counts the current streak from the most recent match', () => {
      const statistics = calculateMatchStatistics(newestFirst);

      expect(statistics.currentWinStreak).toBe(2);
      expect(statistics.longestWinStreak).toBe(3);
    });

    it('does not depend on the order of the input', () => {
      const shuffled = [
        newestFirst[3],
        newestFirst[0],
        newestFirst[5],
        newestFirst[1],
        newestFirst[4],
        newestFirst[2],
      ];

      expect(calculateMatchStatistics(shuffled).currentWinStreak).toBe(2);
      expect(calculateMatchStatistics(shuffled).longestWinStreak).toBe(3);
    });

    it('reports no current streak when the latest match is a loss', () => {
      const statistics = calculateMatchStatistics([
        match({ matchId: 'm2', win: false, gameStartTimestamp: 200 }),
        match({ matchId: 'm1', win: true, gameStartTimestamp: 100 }),
      ]);

      expect(statistics.currentWinStreak).toBe(0);
      expect(statistics.longestWinStreak).toBe(1);
    });
  });

  it('reports champion usage and breaks ties by champion name', () => {
    const statistics = calculateMatchStatistics([
      match({ matchId: 'm1', championId: 1, championName: 'Zed' }),
      match({ matchId: 'm2', championId: 2, championName: 'Ahri' }),
      match({ matchId: 'm3', championId: 3, championName: 'Yasuo' }),
    ]);

    expect(statistics.uniqueChampionsPlayed).toBe(3);
    expect(statistics.mostPlayedChampion).toEqual({
      championId: 2,
      championName: 'Ahri',
      games: 1,
    });
  });

  it('prefers the champion with more games', () => {
    const statistics = calculateMatchStatistics([
      match({ matchId: 'm1', championId: 1, championName: 'Zed' }),
      match({ matchId: 'm2', championId: 1, championName: 'Zed' }),
      match({ matchId: 'm3', championId: 2, championName: 'Ahri' }),
    ]);

    expect(statistics.mostPlayedChampion).toEqual({
      championId: 1,
      championName: 'Zed',
      games: 2,
    });
  });

  it('counts remakes and surrenders without discarding them', () => {
    const statistics = calculateMatchStatistics([
      match({ matchId: 'm1', gameEndedInEarlySurrender: true, gameEndedInSurrender: true }),
      match({ matchId: 'm2', gameEndedInSurrender: true }),
      match({ matchId: 'm3' }),
    ]);

    expect(statistics.gamesPlayed).toBe(3);
    expect(statistics.earlySurrenderGames).toBe(1);
    expect(statistics.surrenderGames).toBe(2);
  });
});
