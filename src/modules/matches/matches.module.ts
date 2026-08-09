import { Module } from '@nestjs/common';

import { MatchEligibilityPolicy } from './domain/match-eligibility.policy';

/**
 * Match rules that depend on the challenge configuration.
 * Statistics and collection helpers are pure functions and need no provider.
 */
@Module({
  providers: [MatchEligibilityPolicy],
  exports: [MatchEligibilityPolicy],
})
export class MatchesModule {}
