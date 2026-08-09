import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

import {
  MATCH_RESULTS,
  type MatchResultFilter,
} from '../../application/participants-query.service';

export const DEFAULT_MATCHES_PAGE_SIZE = 20;
export const MAX_MATCHES_PAGE_SIZE = 100;
const FIRST_PAGE = 1;
const MAX_CHAMPION_NAME_LENGTH = 40;

export class ParticipantMatchesQueryDto {
  @ApiPropertyOptional({ minimum: FIRST_PAGE, default: FIRST_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(FIRST_PAGE)
  public readonly page: number = FIRST_PAGE;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_MATCHES_PAGE_SIZE,
    default: DEFAULT_MATCHES_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MATCHES_PAGE_SIZE)
  public readonly pageSize: number = DEFAULT_MATCHES_PAGE_SIZE;

  @ApiPropertyOptional({
    example: 'Lee Sin',
    description: 'Exact champion name, case insensitive.',
  })
  @IsOptional()
  @IsString()
  @Length(1, MAX_CHAMPION_NAME_LENGTH)
  public readonly championName?: string;

  @ApiPropertyOptional({ enum: [...MATCH_RESULTS] })
  @IsOptional()
  @IsIn([...MATCH_RESULTS])
  public readonly result?: MatchResultFilter;
}
