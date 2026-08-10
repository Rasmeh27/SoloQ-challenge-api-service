import type { SchedulerRegistry } from '@nestjs/schedule';

import { MILLISECONDS_PER_MINUTE } from '../../../common/time/time.constants';
import type { AppEnvironment } from '../../../config/environment.config';
import { aChallengeConfiguration, anAppEnvironment } from '../../../test-support/builders';
import type { SynchronizationOrchestrator } from './synchronization.orchestrator';
import { SynchronizationScheduler } from './synchronization.scheduler';

describe('SynchronizationScheduler', () => {
  const intervalName = 'challenge-synchronization';

  function buildScheduler(synchronizationEnabled = true) {
    const runGlobalSynchronization = jest.fn().mockResolvedValue(undefined);
    const orchestrator = {
      runGlobalSynchronization,
    } as unknown as SynchronizationOrchestrator;
    const schedulerRegistry = {
      addInterval: jest.fn(),
      doesExist: jest.fn().mockReturnValue(true),
      deleteInterval: jest.fn(),
    } as unknown as SchedulerRegistry;
    const environment: AppEnvironment = anAppEnvironment({ synchronizationEnabled });
    const challenge = aChallengeConfiguration({ syncIntervalMinutes: 5 });

    return {
      runGlobalSynchronization,
      schedulerRegistry,
      scheduler: new SynchronizationScheduler(
        orchestrator,
        schedulerRegistry,
        challenge,
        environment,
      ),
    };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs immediately and then at the configured interval', async () => {
    jest.useFakeTimers();
    const { scheduler, schedulerRegistry, runGlobalSynchronization } = buildScheduler();

    scheduler.onApplicationBootstrap();
    await Promise.resolve();

    expect(runGlobalSynchronization).toHaveBeenCalledTimes(1);
    expect(schedulerRegistry.addInterval).toHaveBeenCalledWith(intervalName, expect.anything());

    await jest.advanceTimersByTimeAsync(5 * MILLISECONDS_PER_MINUTE);

    expect(runGlobalSynchronization).toHaveBeenCalledTimes(2);
    scheduler.onApplicationShutdown();
    expect(schedulerRegistry.deleteInterval).toHaveBeenCalledWith(intervalName);
  });

  it('does not schedule work when it is disabled', () => {
    const { scheduler, schedulerRegistry, runGlobalSynchronization } = buildScheduler(false);

    scheduler.onApplicationBootstrap();

    expect(runGlobalSynchronization).not.toHaveBeenCalled();
    expect(schedulerRegistry.addInterval).not.toHaveBeenCalled();
  });
});
