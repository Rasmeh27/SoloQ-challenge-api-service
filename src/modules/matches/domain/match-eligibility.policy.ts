import { Inject, Injectable } from '@nestjs/common';

import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';
import { epochMillisecondsOf } from '../../../common/time/iso-date-time';
import type { ProcessedMatch } from './processed-match';

export interface ChallengePeriod {
  readonly startAtMs: number;
  readonly endAtMs: number;
}

/**
 * Single place deciding which matches belong to the challenge.
 *
 * Coverage is the same for every participant: the configured period, from
 * `challenge.startAt` to `challenge.endAt`. When someone was added to the roster, and when
 * their baseline was captured, are irrelevant here. Match-V5 can serve the history, so a
 * participant incorporated late still counts every Ranked Solo/Duo game they played since
 * the challenge started.
 *
 * The baseline capture only bounds **rank progress**, which cannot be reconstructed
 * backwards. That rule lives in `calculateRankProgress`, deliberately apart from this one.
 *
 * Remakes and surrenders are kept unless `minimumMatchDurationSeconds` is configured,
 * so their flags stay available and the rules can evolve without re-downloading history.
 */
@Injectable()
export class MatchEligibilityPolicy {
  constructor(@Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration) {}

  public get period(): ChallengePeriod {
    return {
      startAtMs: epochMillisecondsOf(this.challenge.startAt),
      endAtMs: epochMillisecondsOf(this.challenge.endAt),
    };
  }

  /** Ranked Solo/Duo match whose start falls inside the challenge period. */
  public belongsToChallenge(match: ProcessedMatch): boolean {
    const { startAtMs, endAtMs } = this.period;

    return (
      match.queueId === this.challenge.queueId &&
      match.gameStartTimestamp >= startAtMs &&
      match.gameStartTimestamp <= endAtMs
    );
  }

  /** Additional configurable filter applied only when computing statistics. */
  public countsForStatistics(match: ProcessedMatch): boolean {
    if (!this.belongsToChallenge(match)) {
      return false;
    }

    const minimumDuration = this.challenge.minimumMatchDurationSeconds;

    return minimumDuration === null || match.gameDuration >= minimumDuration;
  }

  public filterForStatistics(matches: readonly ProcessedMatch[]): ProcessedMatch[] {
    return matches.filter((match) => this.countsForStatistics(match));
  }

  public filterBelongingToChallenge(matches: readonly ProcessedMatch[]): ProcessedMatch[] {
    return matches.filter((match) => this.belongsToChallenge(match));
  }
}
