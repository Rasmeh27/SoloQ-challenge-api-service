import { aProcessedMatch } from '../../../test-support/builders';
import {
  collectMatchIds,
  mergeProcessedMatches,
  newestMatchStartTimestamp,
  sortMatchesByRecency,
} from './match-collection';

describe('mergeProcessedMatches', () => {
  it('deduplicates by matchId so the overlap window cannot create duplicates', () => {
    const stored = [aProcessedMatch({ matchId: 'LA1_1', gameStartTimestamp: 100 })];
    const incoming = [
      aProcessedMatch({ matchId: 'LA1_1', gameStartTimestamp: 100 }),
      aProcessedMatch({ matchId: 'LA1_2', gameStartTimestamp: 200 }),
    ];

    const merged = mergeProcessedMatches(stored, incoming);

    expect(merged).toHaveLength(2);
    expect(merged.map((match) => match.matchId)).toEqual(['LA1_2', 'LA1_1']);
  });

  it('lets the freshly downloaded version win', () => {
    const stored = [aProcessedMatch({ matchId: 'LA1_1', win: false, kills: 0 })];
    const incoming = [aProcessedMatch({ matchId: 'LA1_1', win: true, kills: 9 })];

    const merged = mergeProcessedMatches(stored, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].win).toBe(true);
    expect(merged[0].kills).toBe(9);
  });

  it('returns matches from newest to oldest', () => {
    const merged = mergeProcessedMatches(
      [
        aProcessedMatch({ matchId: 'LA1_1', gameStartTimestamp: 100 }),
        aProcessedMatch({ matchId: 'LA1_3', gameStartTimestamp: 300 }),
      ],
      [aProcessedMatch({ matchId: 'LA1_2', gameStartTimestamp: 200 })],
    );

    expect(merged.map((match) => match.gameStartTimestamp)).toEqual([300, 200, 100]);
  });

  it('is deterministic for matches sharing a timestamp', () => {
    const first = sortMatchesByRecency([
      aProcessedMatch({ matchId: 'LA1_a', gameStartTimestamp: 100 }),
      aProcessedMatch({ matchId: 'LA1_b', gameStartTimestamp: 100 }),
    ]);
    const second = sortMatchesByRecency([
      aProcessedMatch({ matchId: 'LA1_b', gameStartTimestamp: 100 }),
      aProcessedMatch({ matchId: 'LA1_a', gameStartTimestamp: 100 }),
    ]);

    expect(first.map((match) => match.matchId)).toEqual(second.map((match) => match.matchId));
  });

  it('does not mutate its inputs', () => {
    const stored = [aProcessedMatch({ matchId: 'LA1_1' })];

    mergeProcessedMatches(stored, [aProcessedMatch({ matchId: 'LA1_2' })]);

    expect(stored).toHaveLength(1);
  });
});

describe('newestMatchStartTimestamp', () => {
  it('returns null without matches', () => {
    expect(newestMatchStartTimestamp([])).toBeNull();
  });

  it('returns the newest start timestamp regardless of order', () => {
    expect(
      newestMatchStartTimestamp([
        aProcessedMatch({ matchId: 'LA1_1', gameStartTimestamp: 100 }),
        aProcessedMatch({ matchId: 'LA1_3', gameStartTimestamp: 300 }),
        aProcessedMatch({ matchId: 'LA1_2', gameStartTimestamp: 200 }),
      ]),
    ).toBe(300);
  });
});

describe('collectMatchIds', () => {
  it('collects the processed ids', () => {
    const ids = collectMatchIds([
      aProcessedMatch({ matchId: 'LA1_1' }),
      aProcessedMatch({ matchId: 'LA1_2' }),
    ]);

    expect(ids.has('LA1_1')).toBe(true);
    expect(ids.has('LA1_9')).toBe(false);
    expect(ids.size).toBe(2);
  });
});
