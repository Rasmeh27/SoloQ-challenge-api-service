import { ApiProperty } from '@nestjs/swagger';

import {
  type BaselineRank,
  formatRankDisplayName,
  type HighestObservedRank,
  type RankedPosition,
} from '../../modules/challenge/domain/rank/ranked-position';
import { RANK_DIVISIONS, RANK_TIERS } from '../../modules/challenge/domain/rank/rank-tier';
import { visibleRankScore } from '../../modules/challenge/domain/rank/visible-rank-score';
import { RANKED_SOLO_QUEUE_TYPE } from '../../config/riot.constants';

/**
 * Official current position reported by Riot for Ranked Solo/Duo.
 * `wins`/`losses` are lifetime queue totals from League-V4 and must not be confused with
 * the event statistics computed from Match-V5.
 */
export class CurrentRankDto {
  @ApiProperty({ example: RANKED_SOLO_QUEUE_TYPE })
  public readonly queueType!: string;

  @ApiProperty({ enum: [...RANK_TIERS], example: 'EMERALD' })
  public readonly tier!: string;

  @ApiProperty({
    enum: [...RANK_DIVISIONS],
    nullable: true,
    example: 'I',
    description: 'Null for Master, Grandmaster and Challenger, which have no division.',
  })
  public readonly division!: string | null;

  @ApiProperty({ example: 72, description: 'Visible league points. Not MMR.' })
  public readonly leaguePoints!: number;

  @ApiProperty({ example: 40, description: 'Lifetime wins of the queue, reported by Riot.' })
  public readonly wins!: number;

  @ApiProperty({ example: 32, description: 'Lifetime losses of the queue, reported by Riot.' })
  public readonly losses!: number;

  @ApiProperty({ example: 'Emerald I · 72 LP' })
  public readonly displayName!: string;

  @ApiProperty({
    example: 2372,
    description: 'Score of the visible ladder position used to order the leaderboard.',
  })
  public readonly visibleRankScore!: number;

  @ApiProperty({ nullable: true, example: false })
  public readonly veteran!: boolean | null;

  @ApiProperty({ nullable: true, example: false })
  public readonly inactive!: boolean | null;

  @ApiProperty({ nullable: true, example: false })
  public readonly freshBlood!: boolean | null;

  @ApiProperty({ nullable: true, example: true })
  public readonly hotStreak!: boolean | null;

  /** `null` means UNRANKED, which is a valid state. */
  public static from(position: RankedPosition | null): CurrentRankDto | null {
    if (position === null) {
      return null;
    }

    return {
      queueType: position.queueType,
      tier: position.tier,
      division: position.division,
      leaguePoints: position.leaguePoints,
      wins: position.wins,
      losses: position.losses,
      displayName: formatRankDisplayName(position),
      visibleRankScore: visibleRankScore(position),
      veteran: position.veteran,
      inactive: position.inactive,
      freshBlood: position.freshBlood,
      hotStreak: position.hotStreak,
    };
  }
}

/** Position captured when the challenge was initialized. Never replaced afterwards. */
export class BaselineRankDto {
  @ApiProperty({ enum: [...RANK_TIERS], nullable: true, example: 'EMERALD' })
  public readonly tier!: string | null;

  @ApiProperty({ enum: [...RANK_DIVISIONS], nullable: true, example: 'III' })
  public readonly division!: string | null;

  @ApiProperty({ nullable: true, example: 20 })
  public readonly leaguePoints!: number | null;

  @ApiProperty({
    nullable: true,
    example: 2100,
    description: 'Null when the participant was UNRANKED at capture time.',
  })
  public readonly visibleRankScore!: number | null;

  @ApiProperty({ example: '2026-08-01T00:05:00.000Z' })
  public readonly capturedAt!: string;

  @ApiProperty({ example: 'Emerald III · 20 LP', nullable: true })
  public readonly displayName!: string | null;

  public static from(baseline: BaselineRank | null): BaselineRankDto | null {
    if (baseline === null) {
      return null;
    }

    if (baseline.rank === null) {
      return {
        tier: null,
        division: null,
        leaguePoints: null,
        visibleRankScore: null,
        capturedAt: baseline.capturedAt,
        displayName: null,
      };
    }

    return {
      tier: baseline.rank.tier,
      division: baseline.rank.division,
      leaguePoints: baseline.rank.leaguePoints,
      visibleRankScore: visibleRankScore(baseline.rank),
      capturedAt: baseline.capturedAt,
      displayName: formatRankDisplayName(baseline.rank),
    };
  }
}

/** Best visible position observed during the event. */
export class HighestObservedRankDto {
  @ApiProperty({ enum: [...RANK_TIERS], example: 'EMERALD' })
  public readonly tier!: string;

  @ApiProperty({ enum: [...RANK_DIVISIONS], nullable: true, example: 'I' })
  public readonly division!: string | null;

  @ApiProperty({ example: 72 })
  public readonly leaguePoints!: number;

  @ApiProperty({ example: 2372 })
  public readonly visibleRankScore!: number;

  @ApiProperty({ example: '2026-08-20T10:15:00.000Z' })
  public readonly observedAt!: string;

  @ApiProperty({ example: 'Emerald I · 72 LP' })
  public readonly displayName!: string;

  public static from(highest: HighestObservedRank | null): HighestObservedRankDto | null {
    if (highest === null) {
      return null;
    }

    return {
      tier: highest.rank.tier,
      division: highest.rank.division,
      leaguePoints: highest.rank.leaguePoints,
      visibleRankScore: visibleRankScore(highest.rank),
      observedAt: highest.observedAt,
      displayName: formatRankDisplayName(highest.rank),
    };
  }
}
