import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { BaselineRankDto } from '../../../../common/dto/rank.dto';
import type {
  ChallengeInitializationReport,
  ParticipantInitializationOutcome,
} from '../../application/challenge-initialization.report';
import { PARTICIPANT_INITIALIZATION_RESULTS } from '../../application/challenge-initialization.report';

export class InitializeChallengeRequestDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Required when the challenge started longer ago than the configured grace period. It ' +
      'acknowledges that progress is measured from this capture onwards and that earlier games ' +
      'cannot be reconstructed. It never overwrites an existing baseline.',
  })
  @IsOptional()
  @IsBoolean()
  public readonly acknowledgeLateBaseline: boolean = false;
}

export class InitializationErrorDto {
  @ApiProperty({ example: 'RIOT_ACCOUNT_NOT_FOUND' })
  public readonly code!: string;

  @ApiProperty({ example: 'Riot ID "Unknown#LAN" does not exist on the requested routing.' })
  public readonly message!: string;
}

export class ParticipantInitializationDto {
  @ApiProperty({ example: 'player-one' })
  public readonly participantId!: string;

  @ApiProperty({ example: 'PlayerOne#LAN' })
  public readonly riotId!: string;

  @ApiProperty({ enum: [...PARTICIPANT_INITIALIZATION_RESULTS], example: 'INITIALIZED' })
  public readonly result!: string;

  @ApiProperty({
    type: BaselineRankDto,
    nullable: true,
    description:
      'Captured baseline. Null tier means the participant was UNRANKED, which is valid. ' +
      '`capturedAt` is the instant from which this participant progress is measured.',
  })
  public readonly baselineRank!: BaselineRankDto | null;

  @ApiProperty({
    nullable: true,
    example: '2026-08-09T02:10:03.128Z',
    description:
      'Instant from which the rank progress of this participant is measurable: their baseline ' +
      'capture. Matches always count from the challenge start, whenever they joined.',
  })
  public readonly rankProgressStartedAt!: string | null;

  @ApiProperty({ type: InitializationErrorDto, nullable: true })
  public readonly error!: InitializationErrorDto | null;

  public static from(outcome: ParticipantInitializationOutcome): ParticipantInitializationDto {
    return {
      participantId: outcome.participantId,
      riotId: outcome.riotId,
      result: outcome.result,
      baselineRank: BaselineRankDto.from(outcome.baselineRank),
      rankProgressStartedAt: outcome.rankProgressStartedAt,
      error: outcome.error,
    };
  }
}

export class InitializeChallengeResponseDto {
  @ApiProperty({ example: 'soloq-challenge-2026' })
  public readonly challengeId!: string;

  @ApiProperty({
    example: true,
    description:
      'True only when every enabled participant captured a baseline. A partial run reports the ' +
      'failures and leaves the challenge uninitialized so it can be retried.',
  })
  public readonly initialized!: boolean;

  @ApiProperty({ example: '2026-08-01T00:05:00.000Z' })
  public readonly startedAt!: string;

  @ApiProperty({ example: '2026-08-01T00:05:03.128Z' })
  public readonly finishedAt!: string;

  @ApiProperty({ example: 3_128 })
  public readonly durationMs!: number;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z', description: 'Configured challenge start.' })
  public readonly challengeStartAt!: string;

  @ApiProperty({
    nullable: true,
    example: '2026-08-01T00:05:03.128Z',
    description:
      'Instant from which visible progress is measured. Progress is NOT computed retroactively ' +
      'from challengeStartAt: anything played before this instant is not measurable.',
  })
  public readonly baselineCoverageStartAt!: string | null;

  @ApiProperty({ example: 10 })
  public readonly totalParticipants!: number;

  @ApiProperty({ example: 10 })
  public readonly successfulParticipants!: number;

  @ApiProperty({ example: 0 })
  public readonly failedParticipants!: number;

  @ApiProperty({ type: [ParticipantInitializationDto] })
  public readonly participants!: ParticipantInitializationDto[];

  public static from(report: ChallengeInitializationReport): InitializeChallengeResponseDto {
    return {
      challengeId: report.challengeId,
      initialized: report.initialized,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      durationMs: report.durationMs,
      challengeStartAt: report.challengeStartAt,
      baselineCoverageStartAt: report.baselineCoverageStartAt,
      totalParticipants: report.totalParticipants,
      successfulParticipants: report.successfulParticipants,
      failedParticipants: report.failedParticipants,
      participants: report.participants.map((outcome) =>
        ParticipantInitializationDto.from(outcome),
      ),
    };
  }
}
