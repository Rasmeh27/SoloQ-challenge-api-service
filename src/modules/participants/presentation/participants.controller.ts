import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { ParticipantsQueryService } from '../application/participants-query.service';
import { ParticipantMatchesQueryDto } from './dto/participant-query.dto';
import {
  ParticipantMatchesResponseDto,
  ParticipantProfileDto,
  ParticipantProgressionResponseDto,
  ParticipantsListResponseDto,
} from './dto/participant-response.dto';

@ApiTags('Participants')
@ApiParam({ name: 'participantId', required: false, example: 'player-one' })
@Controller({ path: 'participants', version: '1' })
export class ParticipantsController {
  constructor(private readonly participantsQuery: ParticipantsQueryService) {}

  @Get()
  @ApiOperation({
    summary: 'Enabled participants',
    description: 'Summary of every enabled participant. Disabled ones keep their stored history.',
  })
  @ApiOkResponse({ type: ParticipantsListResponseDto })
  public async list(): Promise<ParticipantsListResponseDto> {
    return ParticipantsListResponseDto.from(await this.participantsQuery.listEnabled());
  }

  @Get(':participantId')
  @ApiOperation({
    summary: 'Participant profile',
    description:
      'Current rank, baseline, highest observed rank, visible progress, event statistics and ' +
      'the most recent matches.',
  })
  @ApiOkResponse({ type: ParticipantProfileDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  public async getProfile(
    @Param('participantId') participantId: string,
  ): Promise<ParticipantProfileDto> {
    return ParticipantProfileDto.fromProfile(
      await this.participantsQuery.getProfile(participantId),
    );
  }

  @Get(':participantId/matches')
  @ApiOperation({
    summary: 'Participant match history',
    description: 'Ranked Solo/Duo matches of the challenge period, newest first.',
  })
  @ApiOkResponse({ type: ParticipantMatchesResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  public async getMatches(
    @Param('participantId') participantId: string,
    @Query() query: ParticipantMatchesQueryDto,
  ): Promise<ParticipantMatchesResponseDto> {
    return ParticipantMatchesResponseDto.from(
      await this.participantsQuery.getMatches(participantId, query),
    );
  }

  @Get(':participantId/progression')
  @ApiOperation({
    summary: 'Participant progression',
    description:
      'Rank snapshots in chronological order, ready to be plotted. Snapshots come from real ' +
      'observations; historic ranks are never reconstructed from match history.',
  })
  @ApiOkResponse({ type: ParticipantProgressionResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  public async getProgression(
    @Param('participantId') participantId: string,
  ): Promise<ParticipantProgressionResponseDto> {
    return ParticipantProgressionResponseDto.from(
      await this.participantsQuery.getProgression(participantId),
    );
  }
}
