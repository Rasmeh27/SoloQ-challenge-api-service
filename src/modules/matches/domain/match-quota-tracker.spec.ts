import { aChallengeConfiguration, aProcessedMatch } from '../../../test-support/builders';

import { calculateMatchQuotaTracker } from './match-quota-tracker';

const CHALLENGE = aChallengeConfiguration({
  startAt: '2026-08-10T04:00:00.000Z',
  endAt: '2026-08-31T03:59:59.999Z',
  timeZone: 'America/La_Paz',
  weekdayMatchLimit: 5,
});

function match(matchId: string, playedAt: string) {
  return aProcessedMatch({ matchId, gameStartTimestamp: Date.parse(playedAt) });
}

describe('calculateMatchQuotaTracker', () => {
  it('shows unlimited matches on Saturday without consuming weekday credits', () => {
    const tracker = calculateMatchQuotaTracker(
      [
        match('LA1_1', '2026-08-10T14:00:00.000Z'),
        match('LA1_2', '2026-08-15T14:00:00.000Z'),
        match('LA1_3', '2026-08-15T16:00:00.000Z'),
      ],
      CHALLENGE,
      new Date('2026-08-15T18:00:00.000Z'),
    );

    expect(tracker).toMatchObject({
      mode: 'UNLIMITED',
      date: '2026-08-15',
      remainingMatches: null,
      matchesPlayedToday: 2,
      weekdayCreditsEarned: 25,
      weekdayMatchesPlayed: 1,
      exceededBy: 0,
    });
  });

  it('carries Monday unused credits into Tuesday', () => {
    const tracker = calculateMatchQuotaTracker(
      [match('LA1_1', '2026-08-10T14:00:00.000Z'), match('LA1_2', '2026-08-10T16:00:00.000Z')],
      CHALLENGE,
      new Date('2026-08-11T15:00:00.000Z'),
    );

    expect(tracker).toMatchObject({
      mode: 'LIMITED',
      date: '2026-08-11',
      carriedOverMatches: 3,
      remainingMatches: 8,
      matchesPlayedToday: 0,
      weekdayCreditsEarned: 10,
      weekdayMatchesPlayed: 2,
      exceededBy: 0,
    });
  });

  it('counts remakes and flags weekday matches beyond the accumulated balance', () => {
    const matches = Array.from({ length: 6 }, (_, index) =>
      aProcessedMatch({
        matchId: `LA1_${index}`,
        gameStartTimestamp: Date.parse(
          `2026-08-10T${(10 + index).toString().padStart(2, '0')}:00:00.000Z`,
        ),
        gameEndedInEarlySurrender: index === 5,
        gameDuration: index === 5 ? 120 : 1_800,
      }),
    );

    const tracker = calculateMatchQuotaTracker(
      matches,
      CHALLENGE,
      new Date('2026-08-10T22:00:00.000Z'),
    );

    expect(tracker).toMatchObject({
      mode: 'LIMITED',
      remainingMatches: 0,
      matchesPlayedToday: 6,
      weekdayMatchesPlayed: 6,
      exceededBy: 1,
    });
  });
});
