import { Inject, Injectable, Logger } from '@nestjs/common';

import { toSafeErrorDescriptor } from '../../../common/exceptions/safe-error';
import { CLOCK, type Clock } from '../../../common/time/clock';
import { type IsoDateTime, toIsoDateTime } from '../../../common/time/iso-date-time';
import { type AppEnvironment, environmentConfig } from '../../../config/environment.config';
import {
  CHALLENGE_STATE_REPOSITORY,
  type ChallengeStateRepository,
} from '../../challenge/domain/challenge-state.repository';

export const HEALTH_STATUSES = ['ok', 'degraded'] as const;

export type HealthStatusValue = (typeof HEALTH_STATUSES)[number];

export interface HealthStatus {
  readonly status: HealthStatusValue;
  readonly timestamp: IsoDateTime;
  readonly uptimeSeconds: number;
  readonly environment: string;
  readonly storageWritable: boolean;
  readonly challengeInitialized: boolean;
  readonly riotApiConfigured: boolean;
  readonly adminApiConfigured: boolean;
  readonly scheduledSynchronizationEnabled: boolean;
}

/**
 * Lightweight health probe.
 *
 * It only checks what is local: storage writability and the presence of configuration.
 * The Riot API is never called here, so probes cannot burn the rate limit.
 */
@Injectable()
export class GetHealthStatusUseCase {
  private readonly logger = new Logger(GetHealthStatusUseCase.name);

  constructor(
    @Inject(CHALLENGE_STATE_REPOSITORY) private readonly repository: ChallengeStateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(environmentConfig.KEY) private readonly environment: AppEnvironment,
  ) {}

  public async execute(): Promise<HealthStatus> {
    const storageWritable = await this.repository.isWritable();
    const challengeInitialized = await this.readChallengeInitialized();

    return {
      status: storageWritable ? 'ok' : 'degraded',
      timestamp: toIsoDateTime(this.clock.now()),
      uptimeSeconds: Math.round(process.uptime()),
      environment: this.environment.nodeEnv,
      storageWritable,
      challengeInitialized,
      riotApiConfigured: this.environment.riotApiKey !== null,
      adminApiConfigured: this.environment.adminInternalApiKey !== null,
      scheduledSynchronizationEnabled: this.environment.synchronizationEnabled,
    };
  }

  /** A corrupted or unreadable state must not turn the probe into a 500. */
  private async readChallengeInitialized(): Promise<boolean> {
    try {
      return (await this.repository.loadChallengeState()).initialized;
    } catch (error) {
      this.logger.warn(
        `Could not read the challenge state during the health check: ${toSafeErrorDescriptor(error).code}`,
      );

      return false;
    }
  }
}
