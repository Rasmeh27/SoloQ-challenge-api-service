import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { RequiresInternalApiKey } from '../../../common/decorators/requires-internal-api-key.decorator';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { SynchronizationOrchestrator } from '../application/synchronization.orchestrator';
import {
  GlobalSynchronizationReportDto,
  ParticipantSynchronizationResponseDto,
  SynchronizationStatusDto,
} from './dto/synchronization-response.dto';

@ApiTags('Admin · Synchronization')
@RequiresInternalApiKey()
@Controller({ path: 'admin/synchronization', version: '1' })
export class AdminSynchronizationController {
  constructor(private readonly orchestrator: SynchronizationOrchestrator) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run a global synchronization',
    description:
      'Updates current rank and downloads new Ranked Solo/Duo matches of the challenge period for ' +
      'every enabled participant. A single participant failure never aborts the others. The ' +
      'response includes the Riot request budget consumed by the run, per endpoint.',
  })
  @ApiOkResponse({ type: GlobalSynchronizationReportDto })
  @ApiConflictResponse({
    description: 'Another synchronization is running, or the challenge is not initialized.',
    type: ErrorResponseDto,
  })
  public async run(): Promise<GlobalSynchronizationReportDto> {
    return GlobalSynchronizationReportDto.from(await this.orchestrator.runGlobalSynchronization());
  }

  @Post('participants/:participantId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'participantId', example: 'player-one' })
  @ApiOperation({
    summary: 'Synchronize a single participant',
    description: 'Reports the Riot requests consumed, which are attributable to this run alone.',
  })
  @ApiOkResponse({ type: ParticipantSynchronizationResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown participant.', type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Another synchronization is running, or the challenge is not initialized.',
    type: ErrorResponseDto,
  })
  public async runForParticipant(
    @Param('participantId') participantId: string,
  ): Promise<ParticipantSynchronizationResponseDto> {
    return ParticipantSynchronizationResponseDto.from(
      await this.orchestrator.runParticipantSynchronization(participantId),
    );
  }

  @Get('status')
  @ApiOperation({ summary: 'Synchronization status and last report' })
  @ApiOkResponse({ type: SynchronizationStatusDto })
  public async status(): Promise<SynchronizationStatusDto> {
    return SynchronizationStatusDto.from(await this.orchestrator.status());
  }
}
