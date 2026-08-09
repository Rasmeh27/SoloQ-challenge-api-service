import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { GetChallengeSummaryUseCase } from '../application/get-challenge-summary.use-case';
import { ChallengeResponseDto } from './dto/challenge-response.dto';

@ApiTags('Challenge')
@Controller({ path: 'challenge', version: '1' })
export class ChallengeController {
  constructor(private readonly getChallengeSummary: GetChallengeSummaryUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Public challenge summary',
    description:
      'Configuration, derived status, synchronization information, current leader and the legal ' +
      'notice required by Riot Games.',
  })
  @ApiOkResponse({ type: ChallengeResponseDto })
  public async getChallenge(): Promise<ChallengeResponseDto> {
    return ChallengeResponseDto.from(await this.getChallengeSummary.execute());
  }
}
