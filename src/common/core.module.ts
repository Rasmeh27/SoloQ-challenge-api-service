import { Global, Module } from '@nestjs/common';

import { InMemoryCacheService } from './cache/in-memory-cache.service';
import { CLOCK, SystemClock } from './time/clock';
import { SLEEPER, SystemSleeper } from './utils/sleeper';

/**
 * Cross cutting infrastructure shared by every feature module.
 * Clock and sleeper are ports on purpose: tests replace them to stay deterministic.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: SLEEPER, useClass: SystemSleeper },
    InMemoryCacheService,
  ],
  exports: [CLOCK, SLEEPER, InMemoryCacheService],
})
export class CoreModule {}
