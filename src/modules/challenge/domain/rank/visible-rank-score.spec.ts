import { aRankedPosition } from '../../../../test-support/builders';
import { formatRankDisplayName, hasSameVisiblePosition } from './ranked-position';
import { compareVisibleRank, isHigherVisibleRank, visibleRankScore } from './visible-rank-score';

describe('visibleRankScore', () => {
  it('adds tier base, division offset and league points', () => {
    expect(
      visibleRankScore(aRankedPosition({ tier: 'IRON', division: 'IV', leaguePoints: 0 })),
    ).toBe(0);
    expect(
      visibleRankScore(aRankedPosition({ tier: 'BRONZE', division: 'III', leaguePoints: 25 })),
    ).toBe(525);
    expect(
      visibleRankScore(aRankedPosition({ tier: 'PLATINUM', division: 'II', leaguePoints: 50 })),
    ).toBe(1_850);
    expect(
      visibleRankScore(aRankedPosition({ tier: 'DIAMOND', division: 'I', leaguePoints: 99 })),
    ).toBe(2_799);
  });

  it('uses a single base for every apex tier', () => {
    expect(
      visibleRankScore(aRankedPosition({ tier: 'MASTER', division: null, leaguePoints: 0 })),
    ).toBe(2_800);
    expect(
      visibleRankScore(aRankedPosition({ tier: 'CHALLENGER', division: null, leaguePoints: 0 })),
    ).toBe(2_800);
  });
});

describe('compareVisibleRank', () => {
  it('orders by tier, division and league points', () => {
    const lower = aRankedPosition({ tier: 'GOLD', division: 'IV', leaguePoints: 0 });
    const higher = aRankedPosition({ tier: 'GOLD', division: 'III', leaguePoints: 0 });

    expect(compareVisibleRank(lower, higher)).toBeLessThan(0);
    expect(compareVisibleRank(higher, lower)).toBeGreaterThan(0);
  });

  it('breaks ties between apex tiers with the ladder index', () => {
    const master = aRankedPosition({ tier: 'MASTER', division: null, leaguePoints: 700 });
    const challenger = aRankedPosition({ tier: 'CHALLENGER', division: null, leaguePoints: 700 });

    expect(compareVisibleRank(challenger, master)).toBeGreaterThan(0);
    expect(compareVisibleRank(master, master)).toBe(0);
  });

  it('keeps an apex tier above lower apex tiers regardless of league points', () => {
    const master = aRankedPosition({ tier: 'MASTER', division: null, leaguePoints: 500 });
    const grandmaster = aRankedPosition({
      tier: 'GRANDMASTER',
      division: null,
      leaguePoints: 1,
    });

    expect(compareVisibleRank(grandmaster, master)).toBeGreaterThan(0);
  });
});

describe('isHigherVisibleRank', () => {
  it('treats any position as higher than a missing reference', () => {
    expect(isHigherVisibleRank(aRankedPosition(), null)).toBe(true);
  });

  it('rejects equal or lower positions', () => {
    const reference = aRankedPosition({ tier: 'EMERALD', division: 'II', leaguePoints: 40 });

    expect(isHigherVisibleRank(reference, reference)).toBe(false);
    expect(
      isHigherVisibleRank(
        aRankedPosition({ tier: 'EMERALD', division: 'III', leaguePoints: 99 }),
        reference,
      ),
    ).toBe(false);
    expect(
      isHigherVisibleRank(
        aRankedPosition({ tier: 'EMERALD', division: 'II', leaguePoints: 41 }),
        reference,
      ),
    ).toBe(true);
  });
});

describe('hasSameVisiblePosition', () => {
  it('ignores decorative Riot flags', () => {
    const left = aRankedPosition({ hotStreak: true, veteran: null });
    const right = aRankedPosition({ hotStreak: false, veteran: true });

    expect(hasSameVisiblePosition(left, right)).toBe(true);
  });

  it('detects league point, win and loss changes', () => {
    expect(
      hasSameVisiblePosition(
        aRankedPosition({ leaguePoints: 20 }),
        aRankedPosition({ leaguePoints: 40 }),
      ),
    ).toBe(false);
    expect(hasSameVisiblePosition(aRankedPosition({ wins: 1 }), aRankedPosition({ wins: 2 }))).toBe(
      false,
    );
  });

  it('treats unranked as equal only to unranked', () => {
    expect(hasSameVisiblePosition(null, null)).toBe(true);
    expect(hasSameVisiblePosition(null, aRankedPosition())).toBe(false);
  });
});

describe('formatRankDisplayName', () => {
  it('renders tier, division and league points', () => {
    expect(
      formatRankDisplayName(aRankedPosition({ tier: 'EMERALD', division: 'I', leaguePoints: 72 })),
    ).toBe('Emerald I · 72 LP');
  });

  it('omits the division for apex tiers', () => {
    expect(
      formatRankDisplayName(
        aRankedPosition({ tier: 'GRANDMASTER', division: null, leaguePoints: 645 }),
      ),
    ).toBe('Grandmaster · 645 LP');
  });
});
