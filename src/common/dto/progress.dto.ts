import { ApiProperty } from '@nestjs/swagger';

import {
  PROGRESS_UNITS_LABEL,
  RANK_PROGRESS_STATUSES,
  type RankProgress,
} from '../../modules/challenge/domain/rank/rank-progress';

/**
 * Visible progress during the event.
 *
 * `units` is an approximation of the displacement on the visible ladder
 * (tier + division + league points). It is **not** official league points earned, not MMR
 * and not an alternative skill rating. `null` is never replaced with `0`: read `status`.
 */
export class ProgressDto {
  @ApiProperty({
    nullable: true,
    example: 252,
    description:
      'Approximate visible ladder displacement. May be negative. Null when not computable.',
  })
  public readonly units!: number | null;

  @ApiProperty({ enum: [...RANK_PROGRESS_STATUSES], example: 'CALCULATED' })
  public readonly status!: string;

  @ApiProperty({ example: PROGRESS_UNITS_LABEL })
  public readonly label!: string;

  @ApiProperty({
    example: true,
    description: 'Always true: the metric is an approximation of visible progress.',
  })
  public readonly isApproximation!: boolean;

  public static from(progress: RankProgress): ProgressDto {
    return {
      units: progress.units,
      status: progress.status,
      label: progress.label,
      isApproximation: progress.isApproximation,
    };
  }
}
