import { ApiProperty } from '@nestjs/swagger';

import { RIOT_PLATFORMS, RIOT_REGIONAL_ROUTES } from '../../../../config/routing.config';
import { LeaderboardEntryDto } from '../../../leaderboard/presentation/dto/leaderboard-response.dto';
import type { ChallengeSummary } from '../../application/get-challenge-summary.use-case';
import { CHALLENGE_STATUSES } from '../../domain/challenge-status';
import { DATA_FRESHNESS_VALUES } from '../../domain/data-freshness';

/** Public, non sensitive part of `challenge.config.ts`. */
export class ChallengeConfigurationDto {
  @ApiProperty({ example: 'soloq-challenge-2026' })
  public readonly id!: string;

  @ApiProperty({ example: 'SoloQ Challenge' })
  public readonly name!: string;

  @ApiProperty({ example: 'Temporada 2026' })
  public readonly seasonLabel!: string;

  @ApiProperty()
  public readonly description!: string;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z', description: 'ISO 8601, UTC.' })
  public readonly startAt!: string;

  @ApiProperty({ example: '2026-10-31T23:59:59.999Z', description: 'ISO 8601, UTC.' })
  public readonly endAt!: string;

  @ApiProperty({
    example: 'America/La_Paz',
    description: 'Calendar zone used for the match-limit rules.',
  })
  public readonly timeZone!: string;

  @ApiProperty({ example: 5, description: 'Credits granted each Monday through Friday.' })
  public readonly weekdayMatchLimit!: number;

  @ApiProperty({ example: 420, description: 'Ranked Solo/Duo queue.' })
  public readonly queueId!: number;

  @ApiProperty({ enum: [...RIOT_PLATFORMS], example: 'LA1' })
  public readonly platform!: string;

  @ApiProperty({ enum: [...RIOT_REGIONAL_ROUTES], example: 'AMERICAS' })
  public readonly regionalRoute!: string;

  @ApiProperty({ example: 5 })
  public readonly syncIntervalMinutes!: number;
}

export class ChallengeResponseDto {
  @ApiProperty({ type: ChallengeConfigurationDto })
  public readonly challenge!: ChallengeConfigurationDto;

  @ApiProperty({
    enum: [...CHALLENGE_STATUSES],
    example: 'ACTIVE',
    description: 'Derived from the configured dates and the initialization flag.',
  })
  public readonly status!: string;

  @ApiProperty({ example: true })
  public readonly initialized!: boolean;

  @ApiProperty({ nullable: true, example: '2026-08-01T00:05:00.000Z' })
  public readonly initializedAt!: string | null;

  @ApiProperty({
    nullable: true,
    example: '2026-08-01T00:05:00.000Z',
    description:
      'Instant from which visible progress is measured. Progress is not computed retroactively ' +
      'from startAt: games played before this instant are not measurable by the challenge.',
  })
  public readonly baselineCoverageStartAt!: string | null;

  @ApiProperty({ nullable: true, example: '2026-08-06T12:00:00.000Z' })
  public readonly lastSynchronizationAt!: string | null;

  @ApiProperty({ nullable: true, example: '2026-08-06T12:00:00.000Z' })
  public readonly lastSuccessfulSynchronizationAt!: string | null;

  @ApiProperty({ example: false })
  public readonly synchronizationInProgress!: boolean;

  @ApiProperty({ enum: [...DATA_FRESHNESS_VALUES], example: 'FRESH' })
  public readonly dataFreshness!: string;

  @ApiProperty({ example: 10 })
  public readonly totalParticipants!: number;

  @ApiProperty({ example: 10 })
  public readonly totalEnabledParticipants!: number;

  @ApiProperty({ example: 184 })
  public readonly totalProcessedMatches!: number;

  @ApiProperty({ type: LeaderboardEntryDto, nullable: true })
  public readonly leader!: LeaderboardEntryDto | null;

  @ApiProperty({ description: 'Legal notice required by Riot Games.' })
  public readonly legalDisclaimer!: string;

  public static from(summary: ChallengeSummary): ChallengeResponseDto {
    const configuration = summary.configuration;

    return {
      challenge: {
        id: configuration.id,
        name: configuration.name,
        seasonLabel: configuration.seasonLabel,
        description: configuration.description,
        startAt: configuration.startAt,
        endAt: configuration.endAt,
        timeZone: configuration.timeZone,
        weekdayMatchLimit: configuration.weekdayMatchLimit,
        queueId: configuration.queueId,
        platform: configuration.defaultPlatform,
        regionalRoute: configuration.defaultRegionalRoute,
        syncIntervalMinutes: configuration.syncIntervalMinutes,
      },
      status: summary.status,
      initialized: summary.initialized,
      initializedAt: summary.initializedAt,
      baselineCoverageStartAt: summary.baselineCoverageStartAt,
      lastSynchronizationAt: summary.lastSynchronizationAt,
      lastSuccessfulSynchronizationAt: summary.lastSuccessfulSynchronizationAt,
      synchronizationInProgress: summary.synchronizationInProgress,
      dataFreshness: summary.dataFreshness,
      totalParticipants: summary.totalParticipants,
      totalEnabledParticipants: summary.totalEnabledParticipants,
      totalProcessedMatches: summary.totalProcessedMatches,
      leader: summary.leader === null ? null : LeaderboardEntryDto.from(summary.leader),
      legalDisclaimer: configuration.legalDisclaimer,
    };
  }
}
