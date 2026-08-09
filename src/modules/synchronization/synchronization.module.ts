import { Module } from '@nestjs/common';

import { ChallengeDomainModule } from '../challenge/challenge-domain.module';
import { MatchesModule } from '../matches/matches.module';
import { ParticipantsModule } from '../participants/participants.module';
import { RiotModule } from '../riot/riot.module';
import { StorageModule } from '../storage/storage.module';
import { ParticipantSynchronizer } from './application/participant-synchronizer';
import { SynchronizationOrchestrator } from './application/synchronization.orchestrator';
import { SynchronizationScheduler } from './application/synchronization.scheduler';
import { AdminSynchronizationController } from './presentation/admin-synchronization.controller';
import { VercelCronSynchronizationController } from './presentation/vercel-cron-synchronization.controller';

@Module({
  imports: [StorageModule, RiotModule, MatchesModule, ChallengeDomainModule, ParticipantsModule],
  controllers: [AdminSynchronizationController, VercelCronSynchronizationController],
  providers: [ParticipantSynchronizer, SynchronizationOrchestrator, SynchronizationScheduler],
  exports: [SynchronizationOrchestrator],
})
export class SynchronizationModule {}
