import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { CoreModule } from './common/core.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { MILLISECONDS_PER_SECOND } from './common/time/time.constants';
import { challengeConfig } from './config/challenge.config';
import {
  type AppEnvironment,
  environmentConfig,
  parseEnvironmentVariables,
} from './config/environment.config';
import { participantsConfig } from './config/participants.config';
import { ChallengeModule } from './modules/challenge/challenge.module';
import { HealthModule } from './modules/health/health.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { ParticipantsModule } from './modules/participants/participants.module';
import { SynchronizationModule } from './modules/synchronization/synchronization.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Fails fast with a readable report when the environment is invalid.
      validate: (raw: Record<string, unknown>) => parseEnvironmentVariables(raw),
      load: [environmentConfig, challengeConfig, participantsConfig],
    }),
    ThrottlerModule.forRootAsync({
      inject: [environmentConfig.KEY],
      useFactory: (environment: AppEnvironment) => ({
        throttlers: [
          {
            ttl: environment.rateLimit.ttlSeconds * MILLISECONDS_PER_SECOND,
            limit: environment.rateLimit.limit,
          },
        ],
      }),
    }),
    ScheduleModule.forRoot(),
    CoreModule,
    HealthModule,
    ChallengeModule,
    LeaderboardModule,
    ParticipantsModule,
    SynchronizationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
    },
  ],
})
export class AppModule {}
