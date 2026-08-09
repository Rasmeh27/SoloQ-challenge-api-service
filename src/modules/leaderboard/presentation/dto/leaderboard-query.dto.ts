import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_LEADERBOARD_LIMIT = 50;
export const MAX_LEADERBOARD_LIMIT = 100;
const MIN_LEADERBOARD_LIMIT = 1;
const MIN_OFFSET = 0;

export class LeaderboardQueryDto {
  @ApiPropertyOptional({
    minimum: MIN_LEADERBOARD_LIMIT,
    maximum: MAX_LEADERBOARD_LIMIT,
    default: DEFAULT_LEADERBOARD_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LEADERBOARD_LIMIT)
  @Max(MAX_LEADERBOARD_LIMIT)
  public readonly limit: number = DEFAULT_LEADERBOARD_LIMIT;

  @ApiPropertyOptional({ minimum: MIN_OFFSET, default: MIN_OFFSET })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_OFFSET)
  public readonly offset: number = MIN_OFFSET;
}
