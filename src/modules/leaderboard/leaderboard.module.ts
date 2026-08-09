import { Module } from '@nestjs/common';

import { ParticipantsModule } from '../participants/participants.module';
import { StorageModule } from '../storage/storage.module';
import { LeaderboardService } from './application/leaderboard.service';
import { LeaderboardController } from './presentation/leaderboard.controller';

@Module({
  imports: [StorageModule, ParticipantsModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
