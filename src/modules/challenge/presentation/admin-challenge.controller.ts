import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequiresInternalApiKey } from '../../../common/decorators/requires-internal-api-key.decorator';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { CaptureMissingParticipantBaselinesUseCase } from '../application/capture-missing-participant-baselines.use-case';
import { InitializeChallengeUseCase } from '../application/initialize-challenge.use-case';
import {
  CaptureMissingBaselinesRequestDto,
  CaptureMissingBaselinesResponseDto,
} from './dto/capture-baselines.dto';
import {
  InitializeChallengeRequestDto,
  InitializeChallengeResponseDto,
} from './dto/initialize-challenge.dto';

@ApiTags('Admin · Challenge')
@RequiresInternalApiKey()
@Controller({ path: 'admin/challenge', version: '1' })
export class AdminChallengeController {
  constructor(
    private readonly initializeChallenge: InitializeChallengeUseCase,
    private readonly captureMissingBaselines: CaptureMissingParticipantBaselinesUseCase,
  ) {}

  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize the challenge and capture baselines',
    description:
      'Resolves every enabled Riot ID, captures the baseline rank once and flags the challenge as ' +
      'initialized only when all of them succeed. Idempotent: existing baselines are never ' +
      'replaced and there is no force parameter. Progress is measured from the effective capture ' +
      '(`baselineCoverageStartAt`), never retroactively from `startAt`.',
  })
  @ApiOkResponse({ type: InitializeChallengeResponseDto })
  @ApiConflictResponse({
    description:
      'The challenge is already initialized, or it started beyond the late baseline grace period ' +
      'and the loss of earlier games was not acknowledged.',
    type: ErrorResponseDto,
  })
  public async initialize(
    @Body() request: InitializeChallengeRequestDto,
  ): Promise<InitializeChallengeResponseDto> {
    return InitializeChallengeResponseDto.from(
      await this.initializeChallenge.execute({
        acknowledgeLateBaseline: request.acknowledgeLateBaseline,
      }),
    );
  }

  @Post('baselines/capture-missing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Capture the baselines that are still missing',
    description:
      'Incorporates participants added to participants.config.ts after the challenge was ' +
      'initialized. Only enabled participants without a persisted baseline are captured: an ' +
      'existing baseline is never read back, replaced nor recaptured, and the global ' +
      '`initialized` / `initializedAt` flags are never modified. Idempotent: with nothing ' +
      'pending it answers 200 with `captured: 0` instead of a conflict. Each incorporated ' +
      'participant gets their own `trackingStartedAt`, so matches played before they entered ' +
      'the challenge never count.',
  })
  @ApiOkResponse({ type: CaptureMissingBaselinesResponseDto })
  @ApiConflictResponse({
    description:
      'The challenge is not initialized yet, or the capture is late and the loss of earlier ' +
      'games was not acknowledged.',
    type: ErrorResponseDto,
  })
  public async captureMissing(
    @Body() request: CaptureMissingBaselinesRequestDto,
  ): Promise<CaptureMissingBaselinesResponseDto> {
    return CaptureMissingBaselinesResponseDto.from(
      await this.captureMissingBaselines.execute({
        acknowledgeLateBaseline: request.acknowledgeLateBaseline,
      }),
    );
  }
}
