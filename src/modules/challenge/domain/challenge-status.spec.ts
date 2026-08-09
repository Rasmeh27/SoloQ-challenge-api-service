import { aChallengeConfiguration, FixedClock } from '../../../test-support/builders';
import { ChallengeStatusResolver } from './challenge-status';

const CHALLENGE = aChallengeConfiguration({
  startAt: '2026-08-01T00:00:00.000Z',
  endAt: '2026-10-31T23:59:59.999Z',
});

function resolverAt(instant: string): ChallengeStatusResolver {
  return new ChallengeStatusResolver(CHALLENGE, new FixedClock(new Date(instant)));
}

describe('ChallengeStatusResolver', () => {
  it('is DRAFT while the challenge is not initialized, whatever the date', () => {
    expect(resolverAt('2026-09-15T00:00:00.000Z').resolve(false)).toBe('DRAFT');
    expect(resolverAt('2027-01-01T00:00:00.000Z').resolve(false)).toBe('DRAFT');
  });

  it('is SCHEDULED once initialized but before the start date', () => {
    expect(resolverAt('2026-07-31T23:59:59.999Z').resolve(true)).toBe('SCHEDULED');
  });

  it('is ACTIVE between the start and end dates, inclusive', () => {
    expect(resolverAt('2026-08-01T00:00:00.000Z').resolve(true)).toBe('ACTIVE');
    expect(resolverAt('2026-09-15T12:00:00.000Z').resolve(true)).toBe('ACTIVE');
    expect(resolverAt('2026-10-31T23:59:59.999Z').resolve(true)).toBe('ACTIVE');
  });

  it('is FINISHED after the end date', () => {
    expect(resolverAt('2026-11-01T00:00:00.000Z').resolve(true)).toBe('FINISHED');
  });

  it('reports whether the period is over independently of initialization', () => {
    expect(resolverAt('2026-09-15T12:00:00.000Z').hasFinished()).toBe(false);
    expect(resolverAt('2026-11-01T00:00:00.000Z').hasFinished()).toBe(true);
  });
});
