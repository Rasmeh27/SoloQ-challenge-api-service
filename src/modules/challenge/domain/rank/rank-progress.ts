import type { BaselineRank, RankedPosition } from './ranked-position';
import { visibleRankScore } from './visible-rank-score';

/** Public label for the metric. It is intentionally not called "LP ganados". */
export const PROGRESS_UNITS_LABEL = 'Puntos de progreso';

export const RANK_PROGRESS_STATUSES = [
  /** Both baseline and current position are ranked, so the offset is computable. */
  'CALCULATED',
  /** The participant was UNRANKED when the baseline was captured. */
  'BASELINE_UNRANKED',
  /** The participant currently has no Ranked Solo/Duo entry. */
  'CURRENTLY_UNRANKED',
  /** No baseline exists yet (participant added after initialization). */
  'BASELINE_NOT_INITIALIZED',
] as const;

export type RankProgressStatus = (typeof RANK_PROGRESS_STATUSES)[number];

/**
 * Visible progress during the event.
 *
 * `units` is an approximation of the displacement on the visible ladder. It is not
 * official league points earned, not MMR and not an alternative skill rating.
 * `null` is never replaced with `0`: `status` explains why it is not computable.
 */
export interface RankProgress {
  readonly units: number | null;
  readonly status: RankProgressStatus;
  readonly label: string;
  readonly isApproximation: true;
}

function buildProgress(units: number | null, status: RankProgressStatus): RankProgress {
  return { units, status, label: PROGRESS_UNITS_LABEL, isApproximation: true };
}

/**
 * Computes the visible progress of a participant during the event.
 *
 * Pure and side effect free: it only compares the visible ladder position captured at
 * initialization with the current one. Progress is measured from `baseline.capturedAt`
 * onwards; nothing that happened before that instant can be reconstructed. No MMR, no ELO
 * and no per game league point estimation is derived anywhere in this application.
 */
export function calculateRankProgress(
  baseline: BaselineRank | null,
  currentRank: RankedPosition | null,
): RankProgress {
  if (baseline === null) {
    return buildProgress(null, 'BASELINE_NOT_INITIALIZED');
  }

  if (baseline.rank === null) {
    return buildProgress(null, 'BASELINE_UNRANKED');
  }

  if (currentRank === null) {
    return buildProgress(null, 'CURRENTLY_UNRANKED');
  }

  // May be negative: losing ladder position during the event is a valid outcome.
  return buildProgress(
    visibleRankScore(currentRank) - visibleRankScore(baseline.rank),
    'CALCULATED',
  );
}
