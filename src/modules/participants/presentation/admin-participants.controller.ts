import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequiresInternalApiKey } from '../../../common/decorators/requires-internal-api-key.decorator';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { ValidateParticipantAccountUseCase } from '../application/validate-participant-account.use-case';
import {
  ValidateParticipantRequestDto,
  ValidateParticipantResponseDto,
} from './dto/validate-participant.dto';

@ApiTags('Admin · Participants')
@RequiresInternalApiKey()
@Controller({ path: 'admin/participants', version: '1' })
export class AdminParticipantsController {
  constructor(private readonly validateParticipantAccount: ValidateParticipantAccountUseCase) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate and resolve a Riot ID',
    description:
      'Read only helper used before editing participants.config.ts. It does not modify the ' +
      'configuration and does not register participants.',
  })
  @ApiOkResponse({ type: ValidateParticipantResponseDto })
  @ApiNotFoundResponse({ description: 'The Riot ID does not exist.', type: ErrorResponseDto })
  public async validate(
    @Body() request: ValidateParticipantRequestDto,
  ): Promise<ValidateParticipantResponseDto> {
    return ValidateParticipantResponseDto.from(
      await this.validateParticipantAccount.execute({
        gameName: request.gameName,
        tagLine: request.tagLine,
        platform: request.platform,
      }),
    );
  }
}
