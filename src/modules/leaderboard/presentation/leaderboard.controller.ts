import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { LeaderboardService } from '../application/leaderboard.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { LeaderboardResponseDto } from './dto/leaderboard-response.dto';

@ApiTags('Leaderboard')
@Controller({ path: 'leaderboard', version: '1' })
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Public leaderboard',
    description:
      'Ordered by visible progress units and the configured tie breakers. Served from the ' +
      'locally synchronized state; the Riot API is never called during this request.',
  })
  @ApiOkResponse({ type: LeaderboardResponseDto })
  public async getLeaderboard(
    @Query() query: LeaderboardQueryDto,
  ): Promise<LeaderboardResponseDto> {
    return LeaderboardResponseDto.from(
      await this.leaderboardService.getPage(query.limit, query.offset),
    );
  }
}
