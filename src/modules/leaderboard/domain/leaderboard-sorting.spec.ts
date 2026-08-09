import { aRankedPosition } from '../../../test-support/builders';
import { LEADERBOARD_TIE_BREAKERS, type LeaderboardTieBreaker } from './leaderboard-tie-breaker';
import { type LeaderboardCandidate, sortLeaderboardCandidates } from './leaderboard-sorting';

const ALL_TIE_BREAKERS: readonly LeaderboardTieBreaker[] = LEADERBOARD_TIE_BREAKERS;

function candidate(overrides: Partial<LeaderboardCandidate> = {}): LeaderboardCandidate {
  return {
    riotId: 'PlayerOne#LAN',
    progressUnits: 0,
    currentRank: aRankedPosition(),
    leaguePoints: 0,
    eventWins: 0,
    eventWinRate: 0,
    ...overrides,
  };
}

describe('sortLeaderboardCandidates', () => {
  it('prioritizes the current rank over progress gained during the event', () => {
    const ordered = sortLeaderboardCandidates(
      [
        candidate({
          riotId: 'A#LAN',
          progressUnits: 1_000,
          currentRank: aRankedPosition({ tier: 'GOLD', division: 'I', leaguePoints: 99 }),
        }),
        candidate({
          riotId: 'B#LAN',
          progressUnits: -100,
          currentRank: aRankedPosition({ tier: 'PLATINUM', division: 'IV', leaguePoints: 0 }),
        }),
        candidate({
          riotId: 'C#LAN',
          progressUnits: 10,
          currentRank: aRankedPosition({ tier: 'GOLD', division: 'II', leaguePoints: 20 }),
        }),
      ],
      ALL_TIE_BREAKERS,
    );

    expect(ordered.map((entry) => entry.riotId)).toEqual(['B#LAN', 'A#LAN', 'C#LAN']);
  });

  it('always pushes participants without computable progress to the end', () => {
    const ordered = sortLeaderboardCandidates(
      [
        candidate({ riotId: 'A#LAN', progressUnits: null }),
        candidate({ riotId: 'B#LAN', progressUnits: -400 }),
        candidate({ riotId: 'C#LAN', progressUnits: null }),
        candidate({ riotId: 'D#LAN', progressUnits: 10 }),
      ],
      ALL_TIE_BREAKERS,
    );

    expect(ordered.map((entry) => entry.riotId)).toEqual(['D#LAN', 'B#LAN', 'A#LAN', 'C#LAN']);
  });

  it('orders players in the same division by their current league points', () => {
    const ordered = sortLeaderboardCandidates(
      [
        candidate({
          riotId: 'ElPolaOtp#1203',
          progressUnits: 60,
          currentRank: aRankedPosition({ tier: 'GOLD', division: 'III', leaguePoints: 67 }),
        }),
        candidate({
          riotId: 'lil thorfinn#lowk',
          progressUnits: 0,
          currentRank: aRankedPosition({ tier: 'GOLD', division: 'III', leaguePoints: 75 }),
        }),
      ],
      ALL_TIE_BREAKERS,
    );

    expect(ordered.map((entry) => entry.riotId)).toEqual(['lil thorfinn#lowk', 'ElPolaOtp#1203']);
  });

  it('then uses league points, event wins and event win rate', () => {
    const base = { progressUnits: 100, currentRank: aRankedPosition({ leaguePoints: 20 }) };

    expect(
      sortLeaderboardCandidates(
        [
          candidate({ ...base, riotId: 'A#LAN', leaguePoints: 10 }),
          candidate({ ...base, riotId: 'B#LAN', leaguePoints: 80 }),
        ],
        ALL_TIE_BREAKERS,
      ).map((entry) => entry.riotId),
    ).toEqual(['B#LAN', 'A#LAN']);

    expect(
      sortLeaderboardCandidates(
        [
          candidate({ ...base, riotId: 'A#LAN', eventWins: 2 }),
          candidate({ ...base, riotId: 'B#LAN', eventWins: 7 }),
        ],
        ALL_TIE_BREAKERS,
      ).map((entry) => entry.riotId),
    ).toEqual(['B#LAN', 'A#LAN']);

    expect(
      sortLeaderboardCandidates(
        [
          candidate({ ...base, riotId: 'A#LAN', eventWins: 3, eventWinRate: 40 }),
          candidate({ ...base, riotId: 'B#LAN', eventWins: 3, eventWinRate: 75 }),
        ],
        ALL_TIE_BREAKERS,
      ).map((entry) => entry.riotId),
    ).toEqual(['B#LAN', 'A#LAN']);
  });

  it('falls back to the Riot ID so the order is deterministic', () => {
    const ordered = sortLeaderboardCandidates(
      [candidate({ riotId: 'Zeta#LAN' }), candidate({ riotId: 'Alpha#LAN' })],
      ALL_TIE_BREAKERS,
    );

    expect(ordered.map((entry) => entry.riotId)).toEqual(['Alpha#LAN', 'Zeta#LAN']);
  });

  it('honours the configured tie breaker order', () => {
    const candidates = [
      candidate({ riotId: 'A#LAN', progressUnits: 500, eventWins: 1 }),
      candidate({ riotId: 'B#LAN', progressUnits: 10, eventWins: 9 }),
    ];

    expect(
      sortLeaderboardCandidates(candidates, ['EVENT_WINS', 'PROGRESS_UNITS']).map(
        (entry) => entry.riotId,
      ),
    ).toEqual(['B#LAN', 'A#LAN']);
    expect(
      sortLeaderboardCandidates(candidates, ['PROGRESS_UNITS', 'EVENT_WINS']).map(
        (entry) => entry.riotId,
      ),
    ).toEqual(['A#LAN', 'B#LAN']);
  });

  it('does not mutate the input array', () => {
    const candidates = [
      candidate({ riotId: 'B#LAN', progressUnits: 1 }),
      candidate({ riotId: 'A#LAN', progressUnits: 2 }),
    ];

    sortLeaderboardCandidates(candidates, ALL_TIE_BREAKERS);

    expect(candidates.map((entry) => entry.riotId)).toEqual(['B#LAN', 'A#LAN']);
  });
});
