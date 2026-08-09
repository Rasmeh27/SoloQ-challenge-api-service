import { aBaselineRank, aRankedPosition } from '../../../../test-support/builders';
import { calculateRankProgress, PROGRESS_UNITS_LABEL } from './rank-progress';
import { visibleRankScore } from './visible-rank-score';

describe('RankProgressCalculator', () => {
  it('reports BASELINE_NOT_INITIALIZED when no baseline was ever captured', () => {
    const progress = calculateRankProgress(null, aRankedPosition());

    expect(progress).toEqual({
      units: null,
      status: 'BASELINE_NOT_INITIALIZED',
      label: PROGRESS_UNITS_LABEL,
      isApproximation: true,
    });
  });

  it('reports BASELINE_UNRANKED when the participant was unranked at capture time', () => {
    const progress = calculateRankProgress(aBaselineRank({ rank: null }), aRankedPosition());

    expect(progress.status).toBe('BASELINE_UNRANKED');
    expect(progress.units).toBeNull();
  });

  it('reports CURRENTLY_UNRANKED when the ranked entry disappeared', () => {
    const progress = calculateRankProgress(aBaselineRank(), null);

    expect(progress.status).toBe('CURRENTLY_UNRANKED');
    expect(progress.units).toBeNull();
  });

  it('never replaces a non computable progress with zero', () => {
    expect(calculateRankProgress(null, null).units).toBeNull();
    expect(calculateRankProgress(aBaselineRank({ rank: null }), null).units).toBeNull();
  });

  it('computes the visible displacement between baseline and current position', () => {
    const baseline = aBaselineRank({
      rank: aRankedPosition({ tier: 'EMERALD', division: 'III', leaguePoints: 20 }),
    });
    const current = aRankedPosition({ tier: 'EMERALD', division: 'I', leaguePoints: 72 });

    const progress = calculateRankProgress(baseline, current);

    // (2000 + 300 + 72) - (2000 + 100 + 20)
    expect(progress).toEqual({
      units: 252,
      status: 'CALCULATED',
      label: PROGRESS_UNITS_LABEL,
      isApproximation: true,
    });
  });

  it('supports negative progress when the participant loses ladder position', () => {
    const baseline = aBaselineRank({
      rank: aRankedPosition({ tier: 'GOLD', division: 'II', leaguePoints: 50 }),
    });
    const current = aRankedPosition({ tier: 'GOLD', division: 'IV', leaguePoints: 10 });

    // (1200 + 0 + 10) - (1200 + 200 + 50)
    expect(calculateRankProgress(baseline, current).units).toBe(-240);
  });

  it('crosses tiers using the tier bases', () => {
    const baseline = aBaselineRank({
      rank: aRankedPosition({ tier: 'SILVER', division: 'I', leaguePoints: 90 }),
    });
    const current = aRankedPosition({ tier: 'GOLD', division: 'IV', leaguePoints: 10 });

    // (1200 + 0 + 10) - (800 + 300 + 90)
    expect(calculateRankProgress(baseline, current).units).toBe(20);
  });

  describe('apex tiers', () => {
    it('does not introduce artificial jumps between Master, Grandmaster and Challenger', () => {
      const master = aRankedPosition({ tier: 'MASTER', division: null, leaguePoints: 500 });
      const grandmaster = aRankedPosition({
        tier: 'GRANDMASTER',
        division: null,
        leaguePoints: 500,
      });
      const challenger = aRankedPosition({
        tier: 'CHALLENGER',
        division: null,
        leaguePoints: 500,
      });

      expect(visibleRankScore(master)).toBe(3_300);
      expect(visibleRankScore(grandmaster)).toBe(3_300);
      expect(visibleRankScore(challenger)).toBe(3_300);
    });

    it('measures progress inside the apex category with league points only', () => {
      const baseline = aBaselineRank({
        rank: aRankedPosition({ tier: 'MASTER', division: null, leaguePoints: 0 }),
      });
      const current = aRankedPosition({
        tier: 'GRANDMASTER',
        division: null,
        leaguePoints: 420,
      });

      expect(calculateRankProgress(baseline, current).units).toBe(420);
    });

    it('connects Diamond I with Master through the apex base', () => {
      const baseline = aBaselineRank({
        rank: aRankedPosition({ tier: 'DIAMOND', division: 'I', leaguePoints: 100 }),
      });
      const current = aRankedPosition({ tier: 'MASTER', division: null, leaguePoints: 0 });

      // Diamond I 100 LP -> 2800, Master 0 LP -> 2800.
      expect(calculateRankProgress(baseline, current).units).toBe(0);
    });
  });
});
