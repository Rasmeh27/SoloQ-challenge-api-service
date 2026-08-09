import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_HOUR } from '../../../common/time/time.constants';
import { aRankedPosition } from '../../../test-support/builders';
import { toRankSnapshot } from '../../challenge/domain/rank/rank-snapshot';
import {
  appendSnapshotIfNeeded,
  latestSnapshot,
  shouldCaptureSnapshot,
} from './rank-snapshot.policy';

const NOW = new Date('2026-08-06T12:00:00.000Z');

describe('rank snapshot policy', () => {
  it('captures the first snapshot', () => {
    expect(shouldCaptureSnapshot(null, aRankedPosition(), NOW)).toBe(true);
  });

  it.each([
    ['tier', { tier: 'DIAMOND' as const }],
    ['division', { division: 'II' as const }],
    ['league points', { leaguePoints: 55 }],
    ['wins', { wins: 41 }],
    ['losses', { losses: 33 }],
  ])('captures a snapshot when %s changes', (_label, change) => {
    const latest = toRankSnapshot(aRankedPosition(), '2026-08-06T11:59:00.000Z');

    expect(shouldCaptureSnapshot(latest, aRankedPosition(change), NOW)).toBe(true);
  });

  it('skips snapshots that would duplicate the previous state', () => {
    const latest = toRankSnapshot(aRankedPosition(), '2026-08-06T11:59:00.000Z');

    expect(shouldCaptureSnapshot(latest, aRankedPosition(), NOW)).toBe(false);
  });

  it('captures a daily heartbeat even when nothing changed', () => {
    const oneDayAgo = new Date(NOW.getTime() - MILLISECONDS_PER_DAY).toISOString();
    const someHoursAgo = new Date(NOW.getTime() - MILLISECONDS_PER_HOUR * 5).toISOString();

    expect(
      shouldCaptureSnapshot(toRankSnapshot(aRankedPosition(), oneDayAgo), aRankedPosition(), NOW),
    ).toBe(true);
    expect(
      shouldCaptureSnapshot(
        toRankSnapshot(aRankedPosition(), someHoursAgo),
        aRankedPosition(),
        NOW,
      ),
    ).toBe(false);
  });

  it('treats a transition to unranked as a change', () => {
    const latest = toRankSnapshot(aRankedPosition(), '2026-08-06T11:59:00.000Z');

    expect(shouldCaptureSnapshot(latest, null, NOW)).toBe(true);
  });

  it('appends only when needed and keeps the array reference otherwise', () => {
    const snapshots = [toRankSnapshot(aRankedPosition(), '2026-08-06T11:59:00.000Z')];

    expect(appendSnapshotIfNeeded(snapshots, aRankedPosition(), NOW)).toBe(snapshots);

    const appended = appendSnapshotIfNeeded(snapshots, aRankedPosition({ leaguePoints: 99 }), NOW);

    expect(appended).toHaveLength(2);
    expect(appended[1]).toEqual(
      expect.objectContaining({ leaguePoints: 99, capturedAt: NOW.toISOString() }),
    );
  });

  it('finds the latest snapshot regardless of storage order', () => {
    const older = toRankSnapshot(aRankedPosition(), '2026-08-01T00:00:00.000Z');
    const newer = toRankSnapshot(aRankedPosition({ leaguePoints: 99 }), '2026-08-05T00:00:00.000Z');

    expect(latestSnapshot([newer, older])).toBe(newer);
    expect(latestSnapshot([])).toBeNull();
  });
});
