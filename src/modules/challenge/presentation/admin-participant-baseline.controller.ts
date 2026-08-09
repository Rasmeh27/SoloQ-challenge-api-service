import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
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
import { CaptureMissingParticipantBaselinesUseCase } from '../application/capture-missing-participant-baselines.use-case';
import {
  CaptureMissingBaselinesRequestDto,
  CaptureMissingBaselinesResponseDto,
} from './dto/capture-baselines.dto';

/**
 * Single participant incorporation.
 *
 * Lives in the challenge module, next to the bulk endpoint, because both delegate to the
 * exact same use case: the business rules are not duplicated, only the scope changes.
 * It shares the `admin/participants` prefix with the participants module controller
 * without colliding, since the routes are different.
 */
@ApiTags('Admin · Participants')
@RequiresInternalApiKey()
@Controller({ path: 'admin/participants', version: '1' })
export class AdminParticipantBaselineController {
  constructor(
    private readonly captureMissingBaselines: CaptureMissingParticipantBaselinesUseCase,
  ) {}

  @Post(':participantId/baseline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Capture the baseline of a single participant',
    description:
      'Scoped variant of `POST /admin/challenge/baselines/capture-missing`. Captures the ' +
      'baseline of one enabled participant that does not have one yet. If they already have ' +
      'a baseline it is reported as skipped and left untouched, never recaptured.',
  })
  @ApiParam({ name: 'participantId', example: 'me-voy-alas1030-0088' })
  @ApiOkResponse({ type: CaptureMissingBaselinesResponseDto })
  @ApiNotFoundResponse({
    description: 'The participant is not an enabled participant of the challenge.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'The challenge is not initialized yet, or the capture is late and the loss of earlier ' +
      'games was not acknowledged.',
    type: ErrorResponseDto,
  })
  public async captureBaseline(
    @Param('participantId') participantId: string,
    @Body() request: CaptureMissingBaselinesRequestDto,
  ): Promise<CaptureMissingBaselinesResponseDto> {
    return CaptureMissingBaselinesResponseDto.from(
      await this.captureMissingBaselines.execute({
        acknowledgeLateBaseline: request.acknowledgeLateBaseline,
        participantId,
      }),
    );
  }
}
