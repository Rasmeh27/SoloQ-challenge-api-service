import { epochMillisecondsOf, type IsoDateTime } from '../../../common/time/iso-date-time';

export interface MatchWindowInput {
  readonly challengeStartAtMs: number;
  /** How far back Match-V5 was already swept. `null` means never. */
  readonly earliestMatchCoverageAt: IsoDateTime | null;
  /** Start of the newest match already stored, or `null` when there is no history yet. */
  readonly newestProcessedMatchMs: number | null;
  readonly overlapMs: number;
}

export interface MatchWindow {
  readonly startAtMs: number;
  /**
   * `true` when the whole period is being swept to recover history that the incremental
   * window could never reach.
   */
  readonly isBackfill: boolean;
}

/**
 * Decides the window used to ask Riot for match ids.
 *
 * The incremental window is anchored on the newest stored match, which is cheap but can
 * only ever move forward: a participant incorporated after the challenge started would
 * never recover the games they played before being added. Whenever the recorded coverage
 * does not reach `challenge.startAt`, the whole period is swept once instead.
 *
 * The lower bound is always `challenge.startAt` for everybody. The baseline capture never
 * takes part in this decision: it only bounds rank progress.
 */
export function resolveMatchWindow(input: MatchWindowInput): MatchWindow {
  const { challengeStartAtMs, earliestMatchCoverageAt, newestProcessedMatchMs, overlapMs } = input;

  const coversChallengeStart =
    earliestMatchCoverageAt !== null &&
    epochMillisecondsOf(earliestMatchCoverageAt) <= challengeStartAtMs;

  if (!coversChallengeStart) {
    return { startAtMs: challengeStartAtMs, isBackfill: true };
  }

  if (newestProcessedMatchMs === null) {
    return { startAtMs: challengeStartAtMs, isBackfill: false };
  }

  // Small overlap so nothing is lost to clock skew between Riot and this service.
  return {
    startAtMs: Math.max(challengeStartAtMs, newestProcessedMatchMs - overlapMs),
    isBackfill: false,
  };
}
