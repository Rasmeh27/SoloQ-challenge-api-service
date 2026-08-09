import { aChallengeConfiguration, aProcessedMatch } from '../../../test-support/builders';
import { MatchEligibilityPolicy } from './match-eligibility.policy';

const CHALLENGE = aChallengeConfiguration({
  startAt: '2026-08-01T00:00:00.000Z',
  endAt: '2026-10-31T23:59:59.999Z',
  queueId: 420,
  minimumMatchDurationSeconds: null,
});

describe('MatchEligibilityPolicy', () => {
  const policy = new MatchEligibilityPolicy(CHALLENGE);

  it('exposes the challenge period in epoch milliseconds', () => {
    expect(policy.period).toEqual({
      startAtMs: Date.parse('2026-08-01T00:00:00.000Z'),
      endAtMs: Date.parse('2026-10-31T23:59:59.999Z'),
    });
  });

  it('accepts Ranked Solo/Duo matches inside the period, bounds included', () => {
    expect(
      policy.belongsToChallenge(
        aProcessedMatch({ gameStartTimestamp: Date.parse('2026-08-01T00:00:00.000Z') }),
      ),
    ).toBe(true);
    expect(
      policy.belongsToChallenge(
        aProcessedMatch({ gameStartTimestamp: Date.parse('2026-10-31T23:59:59.999Z') }),
      ),
    ).toBe(true);
  });

  it('rejects matches started before the challenge', () => {
    expect(
      policy.belongsToChallenge(
        aProcessedMatch({ gameStartTimestamp: Date.parse('2026-07-31T23:59:59.999Z') }),
      ),
    ).toBe(false);
  });

  it('rejects matches started after the challenge ended', () => {
    expect(
      policy.belongsToChallenge(
        aProcessedMatch({ gameStartTimestamp: Date.parse('2026-11-01T00:00:00.000Z') }),
      ),
    ).toBe(false);
  });

  it('rejects other queues', () => {
    expect(policy.belongsToChallenge(aProcessedMatch({ queueId: 440 }))).toBe(false);
    expect(policy.belongsToChallenge(aProcessedMatch({ queueId: 400 }))).toBe(false);
  });

  it('keeps remakes and surrenders by default', () => {
    const remake = aProcessedMatch({
      gameDuration: 180,
      gameEndedInEarlySurrender: true,
    });

    expect(policy.countsForStatistics(remake)).toBe(true);
  });

  it('applies the configured minimum duration only for statistics', () => {
    const strictPolicy = new MatchEligibilityPolicy(
      aChallengeConfiguration({ ...CHALLENGE, minimumMatchDurationSeconds: 300 }),
    );
    const remake = aProcessedMatch({ gameDuration: 180 });

    expect(strictPolicy.belongsToChallenge(remake)).toBe(true);
    expect(strictPolicy.countsForStatistics(remake)).toBe(false);
    expect(strictPolicy.countsForStatistics(aProcessedMatch({ gameDuration: 300 }))).toBe(true);
  });

  it('filters collections without mutating them', () => {
    const matches = [
      aProcessedMatch({ matchId: 'in', gameStartTimestamp: Date.parse('2026-08-02T00:00:00Z') }),
      aProcessedMatch({ matchId: 'out', gameStartTimestamp: Date.parse('2026-07-01T00:00:00Z') }),
    ];

    expect(policy.filterBelongingToChallenge(matches).map((match) => match.matchId)).toEqual([
      'in',
    ]);
    expect(policy.filterForStatistics(matches).map((match) => match.matchId)).toEqual(['in']);
    expect(matches).toHaveLength(2);
  });

  it('applies the same coverage to everybody, whenever they joined', () => {
    // A match played before a late participant was even added to the roster still belongs
    // to the challenge: coverage is the configured period, not the baseline capture.
    const playedBeforeJoining = aProcessedMatch({
      gameStartTimestamp: Date.parse('2026-08-02T00:00:00.000Z'),
    });

    expect(policy.belongsToChallenge(playedBeforeJoining)).toBe(true);
    expect(policy.countsForStatistics(playedBeforeJoining)).toBe(true);
  });
});
