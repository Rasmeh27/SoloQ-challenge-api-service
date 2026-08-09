import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../common/time/clock';
import { epochMillisecondsOf } from '../../../common/time/iso-date-time';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';

export const CHALLENGE_STATUSES = [
  /** Not initialized yet: no baselines captured. */
  'DRAFT',
  /** Initialized but the start date has not been reached. */
  'SCHEDULED',
  /** Between `startAt` and `endAt`. */
  'ACTIVE',
  /** After `endAt`. */
  'FINISHED',
] as const;

export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

/**
 * Derives the challenge status from the configured dates plus the initialization flag.
 * Nothing is persisted, so a stored status can never contradict the real dates.
 */
@Injectable()
export class ChallengeStatusResolver {
  constructor(
    @Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  public resolve(initialized: boolean): ChallengeStatus {
    if (!initialized) {
      return 'DRAFT';
    }

    const nowMs = this.clock.now().getTime();

    if (nowMs < epochMillisecondsOf(this.challenge.startAt)) {
      return 'SCHEDULED';
    }

    if (nowMs <= epochMillisecondsOf(this.challenge.endAt)) {
      return 'ACTIVE';
    }

    return 'FINISHED';
  }

  public hasFinished(): boolean {
    return this.clock.now().getTime() > epochMillisecondsOf(this.challenge.endAt);
  }
}
