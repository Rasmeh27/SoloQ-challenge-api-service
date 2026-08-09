import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { resolveLogLevels } from '../bootstrap';
import { type AppEnvironment, environmentConfig } from '../config/environment.config';
import { SynchronizationOrchestrator } from '../modules/synchronization/application/synchronization.orchestrator';

const JSON_INDENTATION = 2;
const EXIT_FAILURE = 1;

/**
 * Runs one global synchronization from the command line.
 * Equivalent to `POST /api/v1/admin/synchronization/run`.
 */
async function main(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  const environment = context.get<AppEnvironment>(environmentConfig.KEY);
  context.useLogger(resolveLogLevels(environment.logLevel));

  try {
    const report = await context.get(SynchronizationOrchestrator).runGlobalSynchronization();

    console.log(JSON.stringify(report, null, JSON_INDENTATION));

    if (report.failedParticipants > 0) {
      process.exitCode = EXIT_FAILURE;
    }
  } finally {
    await context.close();
  }
}

void main();
