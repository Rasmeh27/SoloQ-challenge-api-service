import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { InitializeChallengeUseCase } from '../modules/challenge/application/initialize-challenge.use-case';
import { resolveLogLevels } from '../bootstrap';
import { type AppEnvironment, environmentConfig } from '../config/environment.config';

const JSON_INDENTATION = 2;
const EXIT_FAILURE = 1;

/**
 * Captures the baselines from the command line, without exposing the HTTP server.
 * Equivalent to `POST /api/v1/admin/challenge/initialize`.
 */
async function main(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  const environment = context.get<AppEnvironment>(environmentConfig.KEY);
  context.useLogger(resolveLogLevels(environment.logLevel));

  try {
    // Late baseline capture must be acknowledged explicitly, exactly like over HTTP.
    const acknowledgeLateBaseline = process.env.ACKNOWLEDGE_LATE_BASELINE === 'true';
    const report = await context
      .get(InitializeChallengeUseCase)
      .execute({ acknowledgeLateBaseline });

    console.log(JSON.stringify(report, null, JSON_INDENTATION));

    if (!report.initialized) {
      process.exitCode = EXIT_FAILURE;
    }
  } finally {
    await context.close();
  }
}

void main();
