import { epochMillisecondsOf, toIsoDateTime } from '../../../common/time/iso-date-time';
import { MILLISECONDS_PER_DAY } from '../../../common/time/time.constants';
import {
  describesSameRankState,
  type RankSnapshot,
  toRankSnapshot,
} from '../../challenge/domain/rank/rank-snapshot';
import type { RankedPosition } from '../../challenge/domain/rank/ranked-position';

/**
 * Rules deciding when a rank snapshot is worth storing.
 *
 * A snapshot is captured when tier, division, league points, wins or losses changed, or
 * when a full day passed without changes so the chart keeps a heartbeat. Snapshots that
 * would duplicate the previous state are skipped.
 */
export function latestSnapshot(snapshots: readonly RankSnapshot[]): RankSnapshot | null {
  return snapshots.reduce<RankSnapshot | null>((latest, snapshot) => {
    if (latest === null) {
      return snapshot;
    }

    return epochMillisecondsOf(snapshot.capturedAt) >= epochMillisecondsOf(latest.capturedAt)
      ? snapshot
      : latest;
  }, null);
}

export function shouldCaptureSnapshot(
  latest: RankSnapshot | null,
  currentRank: RankedPosition | null,
  now: Date,
): boolean {
  if (latest === null) {
    return true;
  }

  if (!describesSameRankState(latest, currentRank)) {
    return true;
  }

  return now.getTime() - epochMillisecondsOf(latest.capturedAt) >= MILLISECONDS_PER_DAY;
}

/** Returns the same array reference when no snapshot is needed. */
export function appendSnapshotIfNeeded(
  snapshots: readonly RankSnapshot[],
  currentRank: RankedPosition | null,
  now: Date,
): readonly RankSnapshot[] {
  if (!shouldCaptureSnapshot(latestSnapshot(snapshots), currentRank, now)) {
    return snapshots;
  }

  return [...snapshots, toRankSnapshot(currentRank, toIsoDateTime(now))];
}
