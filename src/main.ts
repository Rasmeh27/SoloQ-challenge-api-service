import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import {
  API_DEFAULT_VERSION,
  API_GLOBAL_PREFIX,
  applyPlatformConfiguration,
  resolveLogLevels,
  setupSwagger,
  SWAGGER_PATH,
} from './bootstrap';
import { type AppEnvironment, environmentConfig } from './config/environment.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Body parsers are registered by `applyPlatformConfiguration` with the configured limit.
    bodyParser: false,
    bufferLogs: true,
  });

  // Read after the module is created so values coming from `.env` are already loaded.
  const environment = app.get<AppEnvironment>(environmentConfig.KEY);
  app.useLogger(resolveLogLevels(environment.logLevel));

  applyPlatformConfiguration(app, environment);

  if (environment.swaggerEnabled) {
    setupSwagger(app);
  }

  await app.listen(environment.port);

  const logger = new Logger('Bootstrap');
  logger.log(
    `SoloQ Challenge API listening on port ${environment.port} ` +
      `(${environment.nodeEnv}) at /${API_GLOBAL_PREFIX}/v${API_DEFAULT_VERSION}`,
  );

  if (environment.swaggerEnabled) {
    logger.log(`Swagger UI available at /${SWAGGER_PATH}`);
  }

  if (environment.riotApiKey === null) {
    logger.warn('RIOT_API_KEY is not configured: synchronization and initialization will fail.');
  }

  if (environment.adminInternalApiKey === null) {
    logger.warn('ADMIN_INTERNAL_API_KEY is not configured: administrative endpoints are disabled.');
  }
}

void bootstrap();
