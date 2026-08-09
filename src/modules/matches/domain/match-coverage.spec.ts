import { MILLISECONDS_PER_MINUTE } from '../../../common/time/time.constants';
import { resolveMatchWindow } from './match-coverage';

const CHALLENGE_START = '2026-08-01T00:00:00.000Z';
const CHALLENGE_START_MS = Date.parse(CHALLENGE_START);
const OVERLAP_MS = 30 * MILLISECONDS_PER_MINUTE;

function windowFor(overrides: {
  earliestMatchCoverageAt?: string | null;
  newestProcessedMatchMs?: number | null;
}) {
  return resolveMatchWindow({
    challengeStartAtMs: CHALLENGE_START_MS,
    earliestMatchCoverageAt: overrides.earliestMatchCoverageAt ?? null,
    newestProcessedMatchMs: overrides.newestProcessedMatchMs ?? null,
    overlapMs: OVERLAP_MS,
  });
}

describe('resolveMatchWindow', () => {
  it('backfills from the challenge start when the history was never swept', () => {
    expect(windowFor({ earliestMatchCoverageAt: null })).toEqual({
      startAtMs: CHALLENGE_START_MS,
      isBackfill: true,
    });
  });

  it('backfills even when matches are already stored, if coverage does not reach the start', () => {
    // The real case: a participant incorporated late was synchronized with a narrower
    // window, so they have recent matches but never the ones before their baseline.
    const window = windowFor({
      earliestMatchCoverageAt: '2026-08-09T01:13:11.406Z',
      newestProcessedMatchMs: Date.parse('2026-08-09T12:00:00.000Z'),
    });

    expect(window).toEqual({ startAtMs: CHALLENGE_START_MS, isBackfill: true });
  });

  it('stops backfilling once the coverage reaches the challenge start', () => {
    const newest = Date.parse('2026-08-09T12:00:00.000Z');
    const window = windowFor({
      earliestMatchCoverageAt: CHALLENGE_START,
      newestProcessedMatchMs: newest,
    });

    expect(window).toEqual({ startAtMs: newest - OVERLAP_MS, isBackfill: false });
  });

  it('treats coverage reaching further back than the start as complete', () => {
    expect(
      windowFor({
        earliestMatchCoverageAt: '2026-07-01T00:00:00.000Z',
        newestProcessedMatchMs: Date.parse('2026-08-09T12:00:00.000Z'),
      }).isBackfill,
    ).toBe(false);
  });

  it('never asks for anything before the challenge started', () => {
    const window = windowFor({
      earliestMatchCoverageAt: CHALLENGE_START,
      newestProcessedMatchMs: CHALLENGE_START_MS + 5 * MILLISECONDS_PER_MINUTE,
    });

    expect(window.startAtMs).toBe(CHALLENGE_START_MS);
  });

  it('starts at the challenge start when coverage is complete but nothing is stored', () => {
    expect(windowFor({ earliestMatchCoverageAt: CHALLENGE_START })).toEqual({
      startAtMs: CHALLENGE_START_MS,
      isBackfill: false,
    });
  });
});
