import { Module } from '@nestjs/common';

import { challengeConfig, type ChallengeConfiguration } from '../../config/challenge.config';
import { type AppEnvironment, environmentConfig } from '../../config/environment.config';
import { CHALLENGE_STATE_REPOSITORY } from '../challenge/domain/challenge-state.repository';
import { JsonChallengeStateRepository } from './infrastructure/json-challenge-state.repository';
import { VercelBlobChallengeStateRepository } from './infrastructure/vercel-blob-challenge-state.repository';

/**
 * Binds the persistence port to local JSON during development and to private Vercel Blob
 * storage in a serverless deployment. Business code only depends on the port.
 */
@Module({
  providers: [
    {
      provide: CHALLENGE_STATE_REPOSITORY,
      useFactory: (environment: AppEnvironment, challenge: ChallengeConfiguration) => {
        if (environment.storageDriver === 'vercel-blob') {
          return new VercelBlobChallengeStateRepository(
            challenge.id,
            environment.blobReadWriteToken as string,
          );
        }

        return new JsonChallengeStateRepository(environment.challengeDataDir, challenge.id);
      },
      inject: [environmentConfig.KEY, challengeConfig.KEY],
    },
  ],
  exports: [CHALLENGE_STATE_REPOSITORY],
})
export class StorageModule {}
