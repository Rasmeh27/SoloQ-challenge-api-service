import { ApiProperty } from '@nestjs/swagger';

import { ProgressDto } from '../../../../common/dto/progress.dto';
import {
  BaselineRankDto,
  CurrentRankDto,
  HighestObservedRankDto,
} from '../../../../common/dto/rank.dto';
import { StatisticsSummaryDto } from '../../../../common/dto/statistics.dto';
import { DATA_FRESHNESS_VALUES } from '../../../challenge/domain/data-freshness';
import { SYNC_STATUSES } from '../../../challenge/domain/sync-status';
import { RIOT_PLATFORMS } from '../../../../config/routing.config';
import type { LeaderboardEntry, LeaderboardPage } from '../../application/leaderboard.service';

export class LeaderboardEntryDto {
  @ApiProperty({ example: 1 })
  public readonly position!: number;

  @ApiProperty({ example: 'player-one' })
  public readonly participantId!: string;

  @ApiProperty({ example: 'PlayerOne#LAN' })
  public readonly riotId!: string;

  @ApiProperty({ example: 'PlayerOne' })
  public readonly gameName!: string;

  @ApiProperty({ example: 'LAN' })
  public readonly tagLine!: string;

  @ApiProperty({ enum: [...RIOT_PLATFORMS], example: 'LA1' })
  public readonly platform!: string;

  @ApiProperty({ nullable: true, example: 1234 })
  public readonly profileIconId!: number | null;

  @ApiProperty({ nullable: true, example: 350 })
  public readonly summonerLevel!: number | null;

  @ApiProperty({ type: CurrentRankDto, nullable: true, description: 'Null means UNRANKED.' })
  public readonly currentRank!: CurrentRankDto | null;

  @ApiProperty({ type: BaselineRankDto, nullable: true })
  public readonly baselineRank!: BaselineRankDto | null;

  @ApiProperty({ type: HighestObservedRankDto, nullable: true })
  public readonly highestObservedRank!: HighestObservedRankDto | null;

  @ApiProperty({ type: ProgressDto })
  public readonly progress!: ProgressDto;

  @ApiProperty({ type: StatisticsSummaryDto, description: 'Computed from the event matches only.' })
  public readonly statistics!: StatisticsSummaryDto;

  @ApiProperty({ nullable: true, example: '2026-08-06T12:00:00.000Z' })
  public readonly lastSuccessfulSyncAt!: string | null;

  @ApiProperty({ enum: [...DATA_FRESHNESS_VALUES], example: 'FRESH' })
  public readonly dataFreshness!: string;

  @ApiProperty({ enum: [...SYNC_STATUSES], example: 'SUCCESS' })
  public readonly syncStatus!: string;

  public static from(entry: LeaderboardEntry): LeaderboardEntryDto {
    const { participant } = entry;
    const state = participant.state;

    return {
      position: entry.position,
      participantId: participant.definition.id,
      riotId: participant.riotId,
      gameName: participant.gameName,
      tagLine: participant.tagLine,
      platform: participant.definition.platform,
      profileIconId: state?.profileIconId ?? null,
      summonerLevel: state?.summonerLevel ?? null,
      currentRank: CurrentRankDto.from(state?.currentRank ?? null),
      baselineRank: BaselineRankDto.from(state?.baselineRank ?? null),
      highestObservedRank: HighestObservedRankDto.from(state?.highestObservedRank ?? null),
      progress: ProgressDto.from(participant.progress),
      statistics: StatisticsSummaryDto.from(participant.statistics),
      lastSuccessfulSyncAt: state?.lastSuccessfulSyncAt ?? null,
      dataFreshness: participant.dataFreshness,
      syncStatus: participant.syncStatus,
    };
  }
}

export class LeaderboardMetaDto {
  @ApiProperty({ example: 10 })
  public readonly total!: number;

  @ApiProperty({ example: 50 })
  public readonly limit!: number;

  @ApiProperty({ example: 0 })
  public readonly offset!: number;

  @ApiProperty({ nullable: true, example: '2026-08-06T12:00:00.000Z' })
  public readonly lastSuccessfulSyncAt!: string | null;

  @ApiProperty({
    enum: [...DATA_FRESHNESS_VALUES],
    example: 'FRESH',
    description: 'STALE means the last successful synchronization is behind schedule.',
  })
  public readonly dataFreshness!: string;
}

export class LeaderboardResponseDto {
  @ApiProperty({ type: [LeaderboardEntryDto] })
  public readonly data!: LeaderboardEntryDto[];

  @ApiProperty({ type: LeaderboardMetaDto })
  public readonly meta!: LeaderboardMetaDto;

  public static from(page: LeaderboardPage): LeaderboardResponseDto {
    return {
      data: page.entries.map((entry) => LeaderboardEntryDto.from(entry)),
      meta: {
        total: page.total,
        limit: page.limit,
        offset: page.offset,
        lastSuccessfulSyncAt: page.lastSuccessfulSyncAt,
        dataFreshness: page.dataFreshness,
      },
    };
  }
}
