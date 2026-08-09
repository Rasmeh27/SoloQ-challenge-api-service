import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';

import { CurrentRankDto } from '../../../../common/dto/rank.dto';
import {
  RIOT_PLATFORMS,
  RIOT_REGIONAL_ROUTES,
  type RiotPlatform,
} from '../../../../config/routing.config';
import type { ValidatedParticipantAccount } from '../../application/validate-participant-account.use-case';

const MIN_GAME_NAME_LENGTH = 3;
const MAX_GAME_NAME_LENGTH = 16;
const MIN_TAG_LINE_LENGTH = 3;
const MAX_TAG_LINE_LENGTH = 5;

export class ValidateParticipantRequestDto {
  @ApiProperty({ example: 'PlayerOne', minLength: MIN_GAME_NAME_LENGTH })
  @IsString()
  @Length(MIN_GAME_NAME_LENGTH, MAX_GAME_NAME_LENGTH)
  public readonly gameName!: string;

  @ApiProperty({ example: 'LAN', minLength: MIN_TAG_LINE_LENGTH })
  @IsString()
  @Length(MIN_TAG_LINE_LENGTH, MAX_TAG_LINE_LENGTH)
  public readonly tagLine!: string;

  @ApiProperty({ enum: [...RIOT_PLATFORMS], example: 'LA1' })
  @IsIn([...RIOT_PLATFORMS])
  public readonly platform!: RiotPlatform;
}

export class ValidateParticipantResponseDto {
  @ApiProperty({ example: 'PlayerOne#LAN' })
  public readonly riotId!: string;

  @ApiProperty({ example: 'PlayerOne' })
  public readonly gameName!: string;

  @ApiProperty({ example: 'LAN' })
  public readonly tagLine!: string;

  @ApiProperty({ enum: [...RIOT_PLATFORMS], example: 'LA1' })
  public readonly platform!: string;

  @ApiProperty({ enum: [...RIOT_REGIONAL_ROUTES], example: 'AMERICAS' })
  public readonly regionalRoute!: string;

  @ApiProperty({ description: 'Stable technical identifier. Administrative use only.' })
  public readonly puuid!: string;

  @ApiProperty({ example: 350 })
  public readonly summonerLevel!: number;

  @ApiProperty({ example: 1234 })
  public readonly profileIconId!: number;

  @ApiProperty({ type: CurrentRankDto, nullable: true, description: 'Null means UNRANKED.' })
  public readonly currentRank!: CurrentRankDto | null;

  @ApiProperty({
    example: false,
    description: 'Whether this Riot ID is already present in participants.config.ts.',
  })
  public readonly alreadyConfigured!: boolean;

  @ApiProperty({ nullable: true, example: null })
  public readonly configuredParticipantId!: string | null;

  public static from(account: ValidatedParticipantAccount): ValidateParticipantResponseDto {
    return {
      riotId: account.riotId,
      gameName: account.gameName,
      tagLine: account.tagLine,
      platform: account.platform,
      regionalRoute: account.regionalRoute,
      puuid: account.puuid,
      summonerLevel: account.summonerLevel,
      profileIconId: account.profileIconId,
      currentRank: CurrentRankDto.from(account.currentRank),
      alreadyConfigured: account.alreadyConfigured,
      configuredParticipantId: account.configuredParticipantId,
    };
  }
}
