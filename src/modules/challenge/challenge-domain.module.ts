import { Module } from '@nestjs/common';

import { BaselineTimelinessPolicy } from './domain/baseline-timeliness.policy';
import { ChallengeStatusResolver } from './domain/challenge-status';

/**
 * Challenge domain services that need injected dependencies (configuration and clock).
 * Kept apart from `ChallengeModule` so participants, leaderboard and synchronization can
 * depend on the domain without creating circular module references.
 *
 * Dependency free domain rules (rank progress, statistics, snapshot policy, tracking
 * window) are plain exported functions and need no provider at all.
 */
@Module({
  providers: [ChallengeStatusResolver, BaselineTimelinessPolicy],
  exports: [ChallengeStatusResolver, BaselineTimelinessPolicy],
})
export class ChallengeDomainModule {}
