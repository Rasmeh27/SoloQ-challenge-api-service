import { ApiProperty } from '@nestjs/swagger';

import { ProgressDto } from '../../../../common/dto/progress.dto';
import {
  BaselineRankDto,
  CurrentRankDto,
  HighestObservedRankDto,
} from '../../../../common/dto/rank.dto';
import { MatchStatisticsDto, StatisticsSummaryDto } from '../../../../common/dto/statistics.dto';
import { fromEpochMilliseconds } from '../../../../common/time/iso-date-time';
import type { Page } from '../../../../common/types/page';
import { roundTo } from '../../../../common/utils/numbers';
import { RIOT_PLATFORMS } from '../../../../config/routing.config';
import { DATA_FRESHNESS_VALUES } from '../../../challenge/domain/data-freshness';
import { RANK_DIVISIONS, RANK_TIERS } from '../../../challenge/domain/rank/rank-tier';
import { SYNC_STATUSES } from '../../../challenge/domain/sync-status';
import type { ProcessedMatch } from '../../../matches/domain/processed-match';
import {
  MATCH_QUOTA_MODES,
  type MatchQuotaTracker,
} from '../../../matches/domain/match-quota-tracker';
import type { ParticipantView } from '../../application/participant-view.factory';
import type {
  ParticipantProfile,
  ParticipantProgression,
} from '../../application/participants-query.service';

const RATIO_DECIMALS = 2;

export class MatchQuotaTrackerDto {
  @ApiProperty({ enum: [...MATCH_QUOTA_MODES], example: 'LIMITED' })
  public readonly mode!: string;

  @ApiProperty({ example: '2026-08-10', description: 'Local date in the challenge time zone.' })
  public readonly date!: string;

  @ApiProperty({ example: 'America/La_Paz' })
  public readonly timeZone!: string;

  @ApiProperty({
    example: 5,
    description: 'New match credits granted every Monday through Friday.',
  })
  public readonly weekdayDailyLimit!: number;

  @ApiProperty({ nullable: true, example: 8, description: 'Null on unlimited weekend days.' })
  public readonly remainingMatches!: number | null;

  @ApiProperty({ example: 3, description: 'Unused weekday credits carried from earlier weekdays.' })
  public readonly carriedOverMatches!: number;

  @ApiProperty({ example: 2 })
  public readonly matchesPlayedToday!: number;

  @ApiProperty({ example: 10 })
  public readonly weekdayCreditsEarned!: number;

  @ApiProperty({ example: 2 })
  public readonly weekdayMatchesPlayed!: number;

  @ApiProperty({ example: 0, description: 'Matches above the weekday credits earned so far.' })
  public readonly exceededBy!: number;

  public static from(tracker: MatchQuotaTracker): MatchQuotaTrackerDto {
    return { ...tracker };
  }
}

export class ParticipantSummaryDto {
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

  @ApiProperty({ example: true })
  public readonly enabled!: boolean;

  @ApiProperty({ nullable: true, example: 1234 })
  public readonly profileIconId!: number | null;

  @ApiProperty({ nullable: true, example: 350 })
  public readonly summonerLevel!: number | null;

  @ApiProperty({ type: CurrentRankDto, nullable: true })
  public readonly currentRank!: CurrentRankDto | null;

  @ApiProperty({ type: ProgressDto })
  public readonly progress!: ProgressDto;

  @ApiProperty({ type: StatisticsSummaryDto })
  public readonly statistics!: StatisticsSummaryDto;

  @ApiProperty({ nullable: true, example: '2026-08-06T12:00:00.000Z' })
  public readonly lastSuccessfulSyncAt!: string | null;

  @ApiProperty({
    nullable: true,
    example: '2026-08-01T00:05:00.000Z',
    description:
      'Instant from which the RANK PROGRESS of this participant is measured: the baseline ' +
      'capture. A past ladder position cannot be reconstructed, so progress is never computed ' +
      'retroactively. It does NOT bound matches or statistics: those cover the whole challenge ' +
      'period for everybody, no matter when the participant joined the roster.',
  })
  public readonly rankProgressStartedAt!: string | null;

  @ApiProperty({ enum: [...DATA_FRESHNESS_VALUES] })
  public readonly dataFreshness!: string;

  @ApiProperty({ enum: [...SYNC_STATUSES] })
  public readonly syncStatus!: string;

  public static from(view: ParticipantView): ParticipantSummaryDto {
    return {
      participantId: view.definition.id,
      riotId: view.riotId,
      gameName: view.gameName,
      tagLine: view.tagLine,
      platform: view.definition.platform,
      enabled: view.definition.enabled,
      profileIconId: view.state?.profileIconId ?? null,
      summonerLevel: view.state?.summonerLevel ?? null,
      currentRank: CurrentRankDto.from(view.state?.currentRank ?? null),
      progress: ProgressDto.from(view.progress),
      statistics: StatisticsSummaryDto.from(view.statistics),
      lastSuccessfulSyncAt: view.state?.lastSuccessfulSyncAt ?? null,
      rankProgressStartedAt: view.baselineCoverageStartAt,
      dataFreshness: view.dataFreshness,
      syncStatus: view.syncStatus,
    };
  }
}

export class ParticipantMatchDto {
  @ApiProperty({ example: 'LA1_1234567890' })
  public readonly matchId!: string;

  @ApiProperty({ example: '2026-08-05T22:14:31.000Z' })
  public readonly playedAt!: string;

  @ApiProperty({ example: 1_812, description: 'Game duration in seconds.' })
  public readonly gameDuration!: number;

  @ApiProperty({ example: 420 })
  public readonly queueId!: number;

  @ApiProperty({ example: '15.15.1234.5678' })
  public readonly gameVersion!: string;

  @ApiProperty({ example: true })
  public readonly win!: boolean;

  @ApiProperty({ example: 64 })
  public readonly championId!: number;

  @ApiProperty({ example: 'Lee Sin' })
  public readonly championName!: string;

  @ApiProperty({ example: 'JUNGLE' })
  public readonly teamPosition!: string;

  @ApiProperty({ example: 'JUNGLE' })
  public readonly individualPosition!: string;

  @ApiProperty({ example: 9 })
  public readonly kills!: number;

  @ApiProperty({ example: 4 })
  public readonly deaths!: number;

  @ApiProperty({ example: 11 })
  public readonly assists!: number;

  @ApiProperty({ example: 5 })
  public readonly kda!: number;

  @ApiProperty({ example: 32 })
  public readonly totalMinionsKilled!: number;

  @ApiProperty({ example: 148 })
  public readonly neutralMinionsKilled!: number;

  @ApiProperty({ example: 180 })
  public readonly totalCs!: number;

  @ApiProperty({ example: 28 })
  public readonly visionScore!: number;

  @ApiProperty({ example: 13_450 })
  public readonly goldEarned!: number;

  @ApiProperty({ example: 24_310 })
  public readonly totalDamageDealtToChampions!: number;

  @ApiProperty({ example: false, description: 'True for remakes.' })
  public readonly gameEndedInEarlySurrender!: boolean;

  @ApiProperty({ example: false })
  public readonly gameEndedInSurrender!: boolean;

  public static from(match: ProcessedMatch): ParticipantMatchDto {
    return {
      matchId: match.matchId,
      playedAt: fromEpochMilliseconds(match.gameStartTimestamp),
      gameDuration: match.gameDuration,
      queueId: match.queueId,
      gameVersion: match.gameVersion,
      win: match.win,
      championId: match.championId,
      championName: match.championName,
      teamPosition: match.teamPosition,
      individualPosition: match.individualPosition,
      kills: match.kills,
      deaths: match.deaths,
      assists: match.assists,
      kda: roundTo(match.kda, RATIO_DECIMALS),
      totalMinionsKilled: match.totalMinionsKilled,
      neutralMinionsKilled: match.neutralMinionsKilled,
      totalCs: match.totalCs,
      visionScore: match.visionScore,
      goldEarned: match.goldEarned,
      totalDamageDealtToChampions: match.totalDamageDealtToChampions,
      gameEndedInEarlySurrender: match.gameEndedInEarlySurrender,
      gameEndedInSurrender: match.gameEndedInSurrender,
    };
  }
}

export class ParticipantProfileDto extends ParticipantSummaryDto {
  @ApiProperty({ type: BaselineRankDto, nullable: true })
  public readonly baselineRank!: BaselineRankDto | null;

  @ApiProperty({ type: HighestObservedRankDto, nullable: true })
  public readonly highestObservedRank!: HighestObservedRankDto | null;

  @ApiProperty({
    type: MatchStatisticsDto,
    description: 'Computed from the challenge period matches, not lifetime Riot totals.',
  })
  public readonly eventStatistics!: MatchStatisticsDto;

  @ApiProperty({ example: 18 })
  public readonly processedMatchesCount!: number;

  @ApiProperty({ type: MatchQuotaTrackerDto })
  public readonly matchQuota!: MatchQuotaTrackerDto;

  @ApiProperty({ type: [ParticipantMatchDto], description: 'Most recent matches, newest first.' })
  public readonly recentMatches!: ParticipantMatchDto[];

  @ApiProperty({ nullable: true, example: '2026-08-06T12:00:00.000Z' })
  public readonly lastSyncAt!: string | null;

  public static fromProfile(profile: ParticipantProfile): ParticipantProfileDto {
    const view = profile.view;

    return {
      ...ParticipantSummaryDto.from(view),
      baselineRank: BaselineRankDto.from(view.state?.baselineRank ?? null),
      highestObservedRank: HighestObservedRankDto.from(view.state?.highestObservedRank ?? null),
      eventStatistics: MatchStatisticsDto.from(view.statistics),
      processedMatchesCount: profile.processedMatchesCount,
      matchQuota: MatchQuotaTrackerDto.from(profile.matchQuota),
      recentMatches: profile.recentMatches.map((match) => ParticipantMatchDto.from(match)),
      lastSyncAt: view.state?.lastSyncAt ?? null,
    };
  }
}

export class ParticipantMatchesMetaDto {
  @ApiProperty({ example: 18 })
  public readonly total!: number;

  @ApiProperty({ example: 1 })
  public readonly page!: number;

  @ApiProperty({ example: 20 })
  public readonly pageSize!: number;

  @ApiProperty({ example: 1 })
  public readonly totalPages!: number;
}

export class ParticipantMatchesResponseDto {
  @ApiProperty({ type: [ParticipantMatchDto] })
  public readonly data!: ParticipantMatchDto[];

  @ApiProperty({ type: ParticipantMatchesMetaDto })
  public readonly meta!: ParticipantMatchesMetaDto;

  public static from(page: Page<ProcessedMatch>): ParticipantMatchesResponseDto {
    return {
      data: page.items.map((match) => ParticipantMatchDto.from(match)),
      meta: {
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
        totalPages: page.totalPages,
      },
    };
  }
}

export class RankSnapshotDto {
  @ApiProperty({ example: '2026-08-06T12:00:00.000Z' })
  public readonly capturedAt!: string;

  @ApiProperty({ enum: [...RANK_TIERS], nullable: true })
  public readonly tier!: string | null;

  @ApiProperty({ enum: [...RANK_DIVISIONS], nullable: true })
  public readonly division!: string | null;

  @ApiProperty({ nullable: true, example: 72 })
  public readonly leaguePoints!: number | null;

  @ApiProperty({ nullable: true, example: 40 })
  public readonly wins!: number | null;

  @ApiProperty({ nullable: true, example: 32 })
  public readonly losses!: number | null;

  @ApiProperty({ nullable: true, example: 2_372 })
  public readonly visibleRankScore!: number | null;
}

export class ParticipantProgressionResponseDto {
  @ApiProperty({ example: 'player-one' })
  public readonly participantId!: string;

  @ApiProperty({ example: 'PlayerOne#LAN' })
  public readonly riotId!: string;

  @ApiProperty({ type: BaselineRankDto, nullable: true })
  public readonly baselineRank!: BaselineRankDto | null;

  @ApiProperty({ type: CurrentRankDto, nullable: true })
  public readonly currentRank!: CurrentRankDto | null;

  @ApiProperty({ type: HighestObservedRankDto, nullable: true })
  public readonly highestObservedRank!: HighestObservedRankDto | null;

  @ApiProperty({ type: ProgressDto })
  public readonly progress!: ProgressDto;

  @ApiProperty({ type: [RankSnapshotDto], description: 'Chronological order, oldest first.' })
  public readonly snapshots!: RankSnapshotDto[];

  public static from(progression: ParticipantProgression): ParticipantProgressionResponseDto {
    const view = progression.view;

    return {
      participantId: view.definition.id,
      riotId: view.riotId,
      baselineRank: BaselineRankDto.from(view.state?.baselineRank ?? null),
      currentRank: CurrentRankDto.from(view.state?.currentRank ?? null),
      highestObservedRank: HighestObservedRankDto.from(view.state?.highestObservedRank ?? null),
      progress: ProgressDto.from(view.progress),
      snapshots: progression.snapshots.map((snapshot) => ({
        capturedAt: snapshot.capturedAt,
        tier: snapshot.tier,
        division: snapshot.division,
        leaguePoints: snapshot.leaguePoints,
        wins: snapshot.wins,
        losses: snapshot.losses,
        visibleRankScore: snapshot.visibleRankScore,
      })),
    };
  }
}

export class ParticipantsListResponseDto {
  @ApiProperty({ type: [ParticipantSummaryDto] })
  public readonly data!: ParticipantSummaryDto[];

  @ApiProperty({ example: 10 })
  public readonly total!: number;

  public static from(views: readonly ParticipantView[]): ParticipantsListResponseDto {
    return {
      data: views.map((view) => ParticipantSummaryDto.from(view)),
      total: views.length,
    };
  }
}
