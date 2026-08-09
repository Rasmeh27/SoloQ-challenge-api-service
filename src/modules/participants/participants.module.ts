import { Module } from '@nestjs/common';

import { ChallengeDomainModule } from '../challenge/challenge-domain.module';
import { MatchesModule } from '../matches/matches.module';
import { RiotModule } from '../riot/riot.module';
import { StorageModule } from '../storage/storage.module';
import { ParticipantViewFactory } from './application/participant-view.factory';
import { ParticipantsQueryService } from './application/participants-query.service';
import { ValidateParticipantAccountUseCase } from './application/validate-participant-account.use-case';
import { ParticipantRegistry } from './domain/participant.registry';
import { AdminParticipantsController } from './presentation/admin-participants.controller';
import { ParticipantsController } from './presentation/participants.controller';

@Module({
  imports: [StorageModule, MatchesModule, ChallengeDomainModule, RiotModule],
  controllers: [ParticipantsController, AdminParticipantsController],
  providers: [
    ParticipantRegistry,
    ParticipantViewFactory,
    ParticipantsQueryService,
    ValidateParticipantAccountUseCase,
  ],
  exports: [ParticipantRegistry, ParticipantViewFactory],
})
export class ParticipantsModule {}
