import { Module } from '@nestjs/common';

import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { MatchesModule } from '../matches/matches.module';
import { ParticipantsModule } from '../participants/participants.module';
import { RiotModule } from '../riot/riot.module';
import { StorageModule } from '../storage/storage.module';
import { CaptureMissingParticipantBaselinesUseCase } from './application/capture-missing-participant-baselines.use-case';
import { GetChallengeSummaryUseCase } from './application/get-challenge-summary.use-case';
import { InitializeChallengeUseCase } from './application/initialize-challenge.use-case';
import { ParticipantBaselineCapturer } from './application/participant-baseline.capturer';
import { ChallengeDomainModule } from './challenge-domain.module';
import { AdminChallengeController } from './presentation/admin-challenge.controller';
import { AdminParticipantBaselineController } from './presentation/admin-participant-baseline.controller';
import { ChallengeController } from './presentation/challenge.controller';

@Module({
  imports: [
    StorageModule,
    RiotModule,
    MatchesModule,
    ChallengeDomainModule,
    ParticipantsModule,
    LeaderboardModule,
  ],
  controllers: [ChallengeController, AdminChallengeController, AdminParticipantBaselineController],
  providers: [
    GetChallengeSummaryUseCase,
    ParticipantBaselineCapturer,
    InitializeChallengeUseCase,
    CaptureMissingParticipantBaselinesUseCase,
  ],
})
export class ChallengeModule {}
