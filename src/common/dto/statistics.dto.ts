import { ApiProperty } from '@nestjs/swagger';

import type {
  MatchStatistics,
  MostPlayedChampion,
} from '../../modules/matches/domain/match-statistics';
import { roundTo } from '../utils/numbers';

const PERCENTAGE_DECIMALS = 1;
const RATIO_DECIMALS = 2;
const UNIT_DECIMALS = 1;

export class MostPlayedChampionDto {
  @ApiProperty({ example: 64 })
  public readonly championId!: number;

  @ApiProperty({ example: 'Lee Sin' })
  public readonly championName!: string;

  @ApiProperty({ example: 7 })
  public readonly games!: number;

  public static from(champion: MostPlayedChampion | null): MostPlayedChampionDto | null {
    return champion === null
      ? null
      : {
          championId: champion.championId,
          championName: champion.championName,
          games: champion.games,
        };
  }
}

/** Compact statistics used by the leaderboard. */
export class StatisticsSummaryDto {
  @ApiProperty({ example: 18 })
  public readonly gamesPlayed!: number;

  @ApiProperty({ example: 11 })
  public readonly wins!: number;

  @ApiProperty({ example: 7 })
  public readonly losses!: number;

  @ApiProperty({ example: 61.1, description: 'Percentage. 0 when no games were played.' })
  public readonly winRate!: number;

  @ApiProperty({
    example: 3.42,
    description: 'Aggregated KDA of the period: (kills + assists) / max(1, deaths).',
  })
  public readonly averageKda!: number;

  public static from(statistics: MatchStatistics): StatisticsSummaryDto {
    return {
      gamesPlayed: statistics.gamesPlayed,
      wins: statistics.wins,
      losses: statistics.losses,
      winRate: roundTo(statistics.winRate, PERCENTAGE_DECIMALS),
      averageKda: roundTo(statistics.averageKda, RATIO_DECIMALS),
    };
  }
}

/**
 * Full statistics computed by this application from Match-V5 data restricted to the
 * challenge period. They are not the lifetime totals reported by League-V4.
 * Rounding happens here, never while accumulating.
 */
export class MatchStatisticsDto {
  @ApiProperty({ example: 18 })
  public readonly gamesPlayed!: number;

  @ApiProperty({ example: 11 })
  public readonly wins!: number;

  @ApiProperty({ example: 7 })
  public readonly losses!: number;

  @ApiProperty({ example: 61.1 })
  public readonly winRate!: number;

  @ApiProperty({ example: 112 })
  public readonly totalKills!: number;

  @ApiProperty({ example: 74 })
  public readonly totalDeaths!: number;

  @ApiProperty({ example: 141 })
  public readonly totalAssists!: number;

  @ApiProperty({ example: 6.2 })
  public readonly averageKills!: number;

  @ApiProperty({ example: 4.1 })
  public readonly averageDeaths!: number;

  @ApiProperty({ example: 7.8 })
  public readonly averageAssists!: number;

  @ApiProperty({ example: 3.42 })
  public readonly averageKda!: number;

  @ApiProperty({ example: 3_842 })
  public readonly totalCs!: number;

  @ApiProperty({ example: 213.4 })
  public readonly averageCs!: number;

  @ApiProperty({ example: 6.8 })
  public readonly averageCsPerMinute!: number;

  @ApiProperty({ example: 24.3 })
  public readonly averageVisionScore!: number;

  @ApiProperty({ example: 21_450.6 })
  public readonly averageDamageToChampions!: number;

  @ApiProperty({ example: 6 })
  public readonly uniqueChampionsPlayed!: number;

  @ApiProperty({ type: MostPlayedChampionDto, nullable: true })
  public readonly mostPlayedChampion!: MostPlayedChampionDto | null;

  @ApiProperty({ example: 2 })
  public readonly currentWinStreak!: number;

  @ApiProperty({ example: 5 })
  public readonly longestWinStreak!: number;

  @ApiProperty({ example: 1, description: 'Games ended as a remake.' })
  public readonly earlySurrenderGames!: number;

  @ApiProperty({ example: 3 })
  public readonly surrenderGames!: number;

  public static from(statistics: MatchStatistics): MatchStatisticsDto {
    return {
      gamesPlayed: statistics.gamesPlayed,
      wins: statistics.wins,
      losses: statistics.losses,
      winRate: roundTo(statistics.winRate, PERCENTAGE_DECIMALS),
      totalKills: statistics.totalKills,
      totalDeaths: statistics.totalDeaths,
      totalAssists: statistics.totalAssists,
      averageKills: roundTo(statistics.averageKills, RATIO_DECIMALS),
      averageDeaths: roundTo(statistics.averageDeaths, RATIO_DECIMALS),
      averageAssists: roundTo(statistics.averageAssists, RATIO_DECIMALS),
      averageKda: roundTo(statistics.averageKda, RATIO_DECIMALS),
      totalCs: statistics.totalCs,
      averageCs: roundTo(statistics.averageCs, UNIT_DECIMALS),
      averageCsPerMinute: roundTo(statistics.averageCsPerMinute, RATIO_DECIMALS),
      averageVisionScore: roundTo(statistics.averageVisionScore, UNIT_DECIMALS),
      averageDamageToChampions: roundTo(statistics.averageDamageToChampions, UNIT_DECIMALS),
      uniqueChampionsPlayed: statistics.uniqueChampionsPlayed,
      mostPlayedChampion: MostPlayedChampionDto.from(statistics.mostPlayedChampion),
      currentWinStreak: statistics.currentWinStreak,
      longestWinStreak: statistics.longestWinStreak,
      earlySurrenderGames: statistics.earlySurrenderGames,
      surrenderGames: statistics.surrenderGames,
    };
  }
}
