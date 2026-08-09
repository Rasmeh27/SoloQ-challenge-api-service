import { Inject, Injectable, Logger } from '@nestjs/common';

import { LateBaselineCaptureError } from '../../../common/exceptions/application.exceptions';
import { epochMillisecondsOf, toIsoDateTime } from '../../../common/time/iso-date-time';
import { MILLISECONDS_PER_HOUR } from '../../../common/time/time.constants';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';

/**
 * Refuses to capture a baseline long after the challenge started unless it is explicitly
 * acknowledged, because the gap between `startAt` and the capture is permanently lost.
 *
 * Shared by the initial initialization and by the later incorporation of participants, so
 * both demand the same acknowledgement and the administrator always confirms the same
 * thing: progress is measured from this capture onwards.
 */
@Injectable()
export class BaselineTimelinessPolicy {
  private readonly logger = new Logger(BaselineTimelinessPolicy.name);

  constructor(@Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration) {}

  public assertCaptureIsTimely(attemptedAt: Date, acknowledged: boolean): void {
    const elapsedMs = attemptedAt.getTime() - epochMillisecondsOf(this.challenge.startAt);
    const graceMs = this.challenge.lateBaselineGraceHours * MILLISECONDS_PER_HOUR;

    if (elapsedMs <= graceMs) {
      return;
    }

    const elapsedHours = Math.floor(elapsedMs / MILLISECONDS_PER_HOUR);

    if (!acknowledged) {
      throw new LateBaselineCaptureError({
        challengeStartAt: this.challenge.startAt,
        attemptedAt: toIsoDateTime(attemptedAt),
        elapsedHours,
        graceHours: this.challenge.lateBaselineGraceHours,
      });
    }

    this.logger.warn(
      `Capturing baselines ${elapsedHours}h after startAt with an explicit acknowledgement. ` +
        'Progress is measured from this capture onwards; earlier games are not measurable.',
    );
  }
}
