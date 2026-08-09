import type { INestApplication, LogLevel } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import {
  INTERNAL_API_KEY_HEADER,
  INTERNAL_API_KEY_SECURITY_SCHEME,
} from './common/guards/internal-api-key.guard';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './common/http/request-context';
import type { AppEnvironment } from './config/environment.config';
import type { LogLevelName } from './config/environment.schema';

export const API_GLOBAL_PREFIX = 'api';
export const API_DEFAULT_VERSION = '1';
export const SWAGGER_PATH = 'docs';

const CORS_MAX_AGE_SECONDS = 600;
const LOG_LEVEL_HIERARCHY: readonly LogLevelName[] = ['error', 'warn', 'log', 'debug', 'verbose'];

/** Nest log levels enabled for the configured verbosity. `fatal` is always on. */
export function resolveLogLevels(level: LogLevelName): LogLevel[] {
  const lastIndex = LOG_LEVEL_HIERARCHY.indexOf(level);

  return ['fatal', ...LOG_LEVEL_HIERARCHY.slice(0, lastIndex + 1)];
}

/**
 * Platform level configuration shared by `main.ts` and the e2e tests, so both run against
 * exactly the same middleware, prefix, versioning and security setup.
 */
export function applyPlatformConfiguration(
  app: NestExpressApplication,
  environment: AppEnvironment,
): void {
  // `unsafe-inline` is required by Swagger UI; this service only serves JSON otherwise.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(requestIdMiddleware);

  app.enableCors({
    origin: environment.allowAnyCorsOrigin ? true : [...environment.corsOrigins],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', INTERNAL_API_KEY_HEADER, REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER],
    credentials: false,
    maxAge: CORS_MAX_AGE_SECONDS,
  });

  app.useBodyParser('json', { limit: environment.requestBodyLimit });
  app.useBodyParser('urlencoded', { limit: environment.requestBodyLimit, extended: true });

  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_DEFAULT_VERSION });
  app.enableShutdownHooks();
}

export function setupSwagger(app: INestApplication): void {
  const document = new DocumentBuilder()
    .setTitle('SoloQ Challenge API')
    .setDescription(
      [
        'Backend of the SoloQ Challenge: a League of Legends Ranked Solo/Duo (queue 420) climbing event.',
        '',
        '**Progress metric.** `progress.units` ("Puntos de progreso") is an approximation of the',
        'displacement on the *visible* ladder (tier + division + visible league points) between the',
        'baseline captured at initialization and the current position. It is **not** official league',
        'points earned, **not** MMR and **not** an alternative skill rating. It can be negative and it',
        'is `null` when it cannot be computed (see `progress.status`).',
        '',
        '**Official vs computed statistics.** `currentRank.wins` / `currentRank.losses` are the lifetime',
        'queue totals reported by Riot (League-V4). Everything under `statistics` / `eventStatistics` is',
        'computed by this service from Match-V5 restricted to the challenge period. The two must not be mixed.',
        '',
        '**Freshness.** Public endpoints always answer from the locally synchronized state. When',
        'synchronization falls behind, `dataFreshness` becomes `STALE` instead of failing.',
        '',
        '**Administrative endpoints** require the `' +
          INTERNAL_API_KEY_HEADER +
          '` header. No secret is',
        'ever part of this documentation or of any response.',
      ].join('\n'),
    )
    .setVersion(API_DEFAULT_VERSION)
    .addApiKey(
      {
        type: 'apiKey',
        name: INTERNAL_API_KEY_HEADER,
        in: 'header',
        description: 'Administrative API key (ADMIN_INTERNAL_API_KEY).',
      },
      INTERNAL_API_KEY_SECURITY_SCHEME,
    )
    .build();

  SwaggerModule.setup(SWAGGER_PATH, app, SwaggerModule.createDocument(app, document), {
    swaggerOptions: { persistAuthorization: true },
  });
}
