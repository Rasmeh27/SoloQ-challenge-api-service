import type { SafeErrorDescriptor } from '../../../common/exceptions/safe-error';
import type { IsoDateTime } from '../../../common/time/iso-date-time';
import type { BaselineRank } from '../domain/rank/ranked-position';

export const PARTICIPANT_INITIALIZATION_RESULTS = [
  'INITIALIZED',
  /** Kept as is: baselines are captured once and never replaced. */
  'ALREADY_INITIALIZED',
  'FAILED',
] as const;

export type ParticipantInitializationResult = (typeof PARTICIPANT_INITIALIZATION_RESULTS)[number];

export interface ParticipantInitializationOutcome {
  readonly participantId: string;
  readonly riotId: string;
  readonly result: ParticipantInitializationResult;
  readonly puuid: string | null;
  readonly baselineRank: BaselineRank | null;
  /**
   * Instant from which the **rank progress** of this participant is measurable: their
   * baseline capture. It never bounds which matches count, which always start at
   * `challenge.startAt` for everybody.
   */
  readonly rankProgressStartedAt: IsoDateTime | null;
  readonly error: SafeErrorDescriptor | null;
}

/**
 * Per participant report of the initialization. Failures are reported explicitly and the
 * challenge is only flagged as initialized when every enabled participant succeeded.
 */
export interface ChallengeInitializationReport {
  readonly challengeId: string;
  readonly initialized: boolean;
  readonly startedAt: IsoDateTime;
  readonly finishedAt: IsoDateTime;
  readonly durationMs: number;
  readonly challengeStartAt: IsoDateTime;
  /**
   * Instant from which visible progress is measured. It is the effective baseline capture,
   * not `challengeStartAt`: games played before it cannot be reconstructed.
   */
  readonly baselineCoverageStartAt: IsoDateTime | null;
  readonly totalParticipants: number;
  readonly successfulParticipants: number;
  readonly failedParticipants: number;
  readonly participants: readonly ParticipantInitializationOutcome[];
}

/**
 * Report of the incorporation of participants added after the initialization.
 *
 * Distinct from `ChallengeInitializationReport` on purpose: this operation never flags the
 * challenge as initialized and never rewrites its global coverage. It is idempotent, so
 * running it with nothing pending is a success with `captured: 0`.
 */
export interface BaselineCaptureReport {
  readonly challengeId: string;
  readonly startedAt: IsoDateTime;
  readonly finishedAt: IsoDateTime;
  readonly durationMs: number;
  readonly challengeStartAt: IsoDateTime;
  /** Global coverage of the challenge. A late incorporation never modifies it. */
  readonly baselineCoverageStartAt: IsoDateTime | null;
  /** Baselines captured by this run. */
  readonly captured: number;
  /** Participants left untouched because they already had a baseline. */
  readonly skipped: number;
  readonly failed: number;
  readonly participants: readonly ParticipantInitializationOutcome[];
}
