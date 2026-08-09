import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';

import {
  ChallengeNotInitializedError,
  SynchronizationAlreadyRunningError,
} from '../../../common/exceptions/application.exceptions';
import { toSafeErrorDescriptor } from '../../../common/exceptions/safe-error';
import { MILLISECONDS_PER_MINUTE } from '../../../common/time/time.constants';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';
import { type AppEnvironment, environmentConfig } from '../../../config/environment.config';
import { SynchronizationOrchestrator } from './synchronization.orchestrator';

const SYNCHRONIZATION_INTERVAL_NAME = 'challenge-synchronization';
const INTERVAL_KIND = 'interval';

/**
 * Registers the periodic synchronization using the configured interval.
 * Disabled with `SYNC_ENABLED=false`, which is what tests and read-only deployments use.
 */
@Injectable()
export class SynchronizationScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SynchronizationScheduler.name);

  constructor(
    private readonly orchestrator: SynchronizationOrchestrator,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration,
    @Inject(environmentConfig.KEY) private readonly environment: AppEnvironment,
  ) {}

  public onApplicationBootstrap(): void {
    if (!this.environment.synchronizationEnabled) {
      this.logger.log('Scheduled synchronization is disabled (SYNC_ENABLED=false).');
      return;
    }

    const intervalMs = this.challenge.syncIntervalMinutes * MILLISECONDS_PER_MINUTE;
    const interval = setInterval(() => {
      void this.tick();
    }, intervalMs);

    this.schedulerRegistry.addInterval(SYNCHRONIZATION_INTERVAL_NAME, interval);
    this.logger.log(
      `Scheduled synchronization every ${this.challenge.syncIntervalMinutes} minute(s).`,
    );
  }

  public onApplicationShutdown(): void {
    if (this.schedulerRegistry.doesExist(INTERVAL_KIND, SYNCHRONIZATION_INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(SYNCHRONIZATION_INTERVAL_NAME);
    }
  }

  private async tick(): Promise<void> {
    try {
      await this.orchestrator.runGlobalSynchronization();
    } catch (error) {
      if (error instanceof SynchronizationAlreadyRunningError) {
        this.logger.debug('Skipping scheduled synchronization: another run is in progress.');
        return;
      }

      if (error instanceof ChallengeNotInitializedError) {
        this.logger.debug('Skipping scheduled synchronization: the challenge is not initialized.');
        return;
      }

      this.logger.error(
        `Scheduled synchronization failed: ${toSafeErrorDescriptor(error).code}. ` +
          'The last valid state is preserved.',
      );
    }
  }
}
