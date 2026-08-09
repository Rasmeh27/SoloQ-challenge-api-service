import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import type { BaselineCaptureReport } from '../../application/challenge-initialization.report';
import { ParticipantInitializationDto } from './initialize-challenge.dto';

export class CaptureMissingBaselinesRequestDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Acknowledges that the progress of the incorporated participants starts at this capture ' +
      'and that their earlier games are not measurable. Required under the same rule as the ' +
      'initial initialization. It never replaces an existing baseline.',
  })
  @IsOptional()
  @IsBoolean()
  public readonly acknowledgeLateBaseline: boolean = false;
}

/**
 * Result of incorporating participants added after the initialization.
 *
 * Idempotent by contract: with nothing pending it answers `200` and `captured: 0`, never
 * `CHALLENGE_ALREADY_INITIALIZED`.
 */
export class CaptureMissingBaselinesResponseDto {
  @ApiProperty({ example: 'soloq-challenge-2026' })
  public readonly challengeId!: string;

  @ApiProperty({ example: '2026-08-09T02:10:00.000Z' })
  public readonly startedAt!: string;

  @ApiProperty({ example: '2026-08-09T02:10:03.128Z' })
  public readonly finishedAt!: string;

  @ApiProperty({ example: 3_128 })
  public readonly durationMs!: number;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z', description: 'Configured challenge start.' })
  public readonly challengeStartAt!: string;

  @ApiProperty({
    nullable: true,
    example: '2026-08-09T00:41:13.996Z',
    description:
      'Global coverage of the challenge, unchanged by this operation. Each participant keeps ' +
      'their own effective coverage in `trackingStartedAt`.',
  })
  public readonly baselineCoverageStartAt!: string | null;

  @ApiProperty({ example: 2, description: 'Baselines captured by this run.' })
  public readonly captured!: number;

  @ApiProperty({ example: 1, description: 'Participants left untouched: they already had one.' })
  public readonly skipped!: number;

  @ApiProperty({ example: 0 })
  public readonly failed!: number;

  @ApiProperty({ type: [ParticipantInitializationDto] })
  public readonly participants!: ParticipantInitializationDto[];

  public static from(report: BaselineCaptureReport): CaptureMissingBaselinesResponseDto {
    return {
      challengeId: report.challengeId,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      durationMs: report.durationMs,
      challengeStartAt: report.challengeStartAt,
      baselineCoverageStartAt: report.baselineCoverageStartAt,
      captured: report.captured,
      skipped: report.skipped,
      failed: report.failed,
      participants: report.participants.map((outcome) =>
        ParticipantInitializationDto.from(outcome),
      ),
    };
  }
}
