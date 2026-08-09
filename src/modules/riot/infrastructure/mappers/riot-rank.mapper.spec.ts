import { RANKED_SOLO_QUEUE_TYPE } from '../../../../config/riot.constants';
import { RiotUnexpectedResponseError } from '../../domain/riot.errors';
import type { RiotLeagueEntryResponse } from '../dto/riot-responses';
import { toRankedPosition } from './riot-rank.mapper';

const OPERATION = 'league-v4:entries-by-puuid';

function entry(overrides: Partial<RiotLeagueEntryResponse> = {}): RiotLeagueEntryResponse {
  return {
    queueType: RANKED_SOLO_QUEUE_TYPE,
    tier: 'EMERALD',
    rank: 'II',
    leaguePoints: 45,
    wins: 40,
    losses: 32,
    veteran: false,
    inactive: false,
    freshBlood: true,
    hotStreak: true,
    ...overrides,
  };
}

describe('toRankedPosition', () => {
  it('maps a standard entry', () => {
    expect(toRankedPosition(entry(), OPERATION)).toEqual({
      queueType: RANKED_SOLO_QUEUE_TYPE,
      tier: 'EMERALD',
      division: 'II',
      leaguePoints: 45,
      wins: 40,
      losses: 32,
      veteran: false,
      inactive: false,
      freshBlood: true,
      hotStreak: true,
    });
  });

  it('drops the division for apex tiers, where Riot still reports "I"', () => {
    expect(toRankedPosition(entry({ tier: 'MASTER', rank: 'I' }), OPERATION).division).toBeNull();
    expect(
      toRankedPosition(entry({ tier: 'GRANDMASTER', rank: 'I' }), OPERATION).division,
    ).toBeNull();
    expect(
      toRankedPosition(entry({ tier: 'CHALLENGER', rank: 'I' }), OPERATION).division,
    ).toBeNull();
  });

  it('normalises the casing reported by Riot', () => {
    const position = toRankedPosition(entry({ tier: 'diamond', rank: 'iv' }), OPERATION);

    expect(position.tier).toBe('DIAMOND');
    expect(position.division).toBe('IV');
  });

  it('turns the flags Riot may stop returning into null instead of undefined', () => {
    const position = toRankedPosition(
      {
        queueType: RANKED_SOLO_QUEUE_TYPE,
        tier: 'GOLD',
        rank: 'I',
        leaguePoints: 10,
        wins: 1,
        losses: 2,
      },
      OPERATION,
    );

    expect(position).toEqual(
      expect.objectContaining({
        veteran: null,
        inactive: null,
        freshBlood: null,
        hotStreak: null,
      }),
    );
  });

  it('accepts a missing division without inventing one', () => {
    expect(toRankedPosition(entry({ rank: undefined }), OPERATION).division).toBeNull();
    expect(toRankedPosition(entry({ rank: 'V' }), OPERATION).division).toBeNull();
  });

  it('fails explicitly on an unknown tier instead of storing garbage', () => {
    expect(() => toRankedPosition(entry({ tier: 'MYTHIC' }), OPERATION)).toThrow(
      RiotUnexpectedResponseError,
    );
  });
});
