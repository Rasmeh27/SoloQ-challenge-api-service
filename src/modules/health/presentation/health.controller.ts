import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { GetHealthStatusUseCase } from '../application/get-health-status.use-case';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@SkipThrottle()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly getHealthStatus: GetHealthStatusUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness and configuration probe',
    description: 'Local checks only: the Riot API is never called during a health check.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  public async getHealth(): Promise<HealthResponseDto> {
    return HealthResponseDto.from(await this.getHealthStatus.execute());
  }
}
