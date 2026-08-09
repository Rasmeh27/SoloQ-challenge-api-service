import { Controller, Get, Headers, Inject, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { secureCompare } from '../../../common/utils/secure-compare';
import { environmentConfig, type AppEnvironment } from '../../../config/environment.config';
import { SynchronizationOrchestrator } from '../application/synchronization.orchestrator';
import { GlobalSynchronizationReportDto } from './dto/synchronization-response.dto';

/**
 * Vercel Cron issues a GET request with `Authorization: Bearer <CRON_SECRET>`.
 * This endpoint deliberately has a different credential from the admin API so the
 * browser-facing frontend never needs access to the scheduler secret.
 */
@ApiExcludeController()
@Controller({ path: 'cron/synchronization', version: '1' })
export class VercelCronSynchronizationController {
  constructor(
    private readonly orchestrator: SynchronizationOrchestrator,
    @Inject(environmentConfig.KEY) private readonly environment: AppEnvironment,
  ) {}

  @Get()
  public async run(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<GlobalSynchronizationReportDto> {
    const cronSecret = this.environment.cronSecret;

    if (
      cronSecret === null ||
      authorization === undefined ||
      !secureCompare(authorization, `Bearer ${cronSecret}`)
    ) {
      throw new UnauthorizedException();
    }

    return GlobalSynchronizationReportDto.from(await this.orchestrator.runGlobalSynchronization());
  }
}
