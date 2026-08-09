import type { Clock } from '../common/time/clock';
import type { Sleeper } from '../common/utils/sleeper';
import { CHALLENGE, type ChallengeConfiguration } from '../config/challenge.config';
import {
  type AppEnvironment,
  toAppEnvironment,
  parseEnvironmentVariables,
} from '../config/environment.config';
import type { ParticipantDefinition } from '../config/participants.config';
import { RANKED_SOLO_QUEUE_TYPE } from '../config/riot.constants';
import type { ChallengeState } from '../modules/challenge/domain/challenge-state';
import { createEmptyChallengeState } from '../modules/challenge/domain/challenge-state';
import type { ParticipantState } from '../modules/challenge/domain/participant-state';
import type {
  BaselineRank,
  RankedPosition,
} from '../modules/challenge/domain/rank/ranked-position';
import { EMPTY_MATCH_STATISTICS } from '../modules/matches/domain/match-statistics';
import { computeKda, type ProcessedMatch } from '../modules/matches/domain/processed-match';

/** Deterministic clock: tests never depend on the wall clock. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  public now(): Date {
    return new Date(this.current.getTime());
  }

  public set(instant: Date | string): void {
    this.current = new Date(instant);
  }

  public advanceMilliseconds(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

/** Records requested delays without actually waiting. */
export class RecordingSleeper implements Sleeper {
  public readonly delays: number[] = [];

  public sleep(milliseconds: number): Promise<void> {
    this.delays.push(milliseconds);
    return Promise.resolve();
  }
}

export function aRankedPosition(overrides: Partial<RankedPosition> = {}): RankedPosition {
  return {
    queueType: RANKED_SOLO_QUEUE_TYPE,
    tier: 'EMERALD',
    division: 'III',
    leaguePoints: 20,
    wins: 40,
    losses: 32,
    veteran: false,
    inactive: false,
    freshBlood: false,
    hotStreak: false,
    ...overrides,
  };
}

export function aBaselineRank(overrides: Partial<BaselineRank> = {}): BaselineRank {
  return {
    rank: aRankedPosition(),
    capturedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

export function aProcessedMatch(overrides: Partial<ProcessedMatch> = {}): ProcessedMatch {
  const kills = overrides.kills ?? 8;
  const deaths = overrides.deaths ?? 4;
  const assists = overrides.assists ?? 10;
  const totalMinionsKilled = overrides.totalMinionsKilled ?? 150;
  const neutralMinionsKilled = overrides.neutralMinionsKilled ?? 30;

  return {
    matchId: 'LA1_1000',
    gameCreation: Date.parse('2026-08-02T18:00:00.000Z'),
    gameStartTimestamp: Date.parse('2026-08-02T18:01:00.000Z'),
    gameEndTimestamp: Date.parse('2026-08-02T18:31:00.000Z'),
    gameDuration: 1_800,
    queueId: 420,
    gameVersion: '16.15.1',
    win: true,
    championId: 64,
    championName: 'LeeSin',
    teamPosition: 'JUNGLE',
    individualPosition: 'JUNGLE',
    kills,
    deaths,
    assists,
    kda: computeKda(kills, deaths, assists),
    totalMinionsKilled,
    neutralMinionsKilled,
    totalCs: totalMinionsKilled + neutralMinionsKilled,
    visionScore: 25,
    goldEarned: 12_500,
    totalDamageDealtToChampions: 20_000,
    gameEndedInEarlySurrender: false,
    gameEndedInSurrender: false,
    ...overrides,
  };
}

export function aParticipantDefinition(
  overrides: Partial<ParticipantDefinition> = {},
): ParticipantDefinition {
  return {
    id: 'player-one',
    gameName: 'PlayerOne',
    tagLine: 'LAN',
    platform: 'LA1',
    enabled: true,
    ...overrides,
  };
}

export function aParticipantState(overrides: Partial<ParticipantState> = {}): ParticipantState {
  const participantId = overrides.participantId ?? 'player-one';

  return {
    participantId,
    resolvedAccount: {
      puuid: `puuid-${participantId}`,
      gameName: 'PlayerOne',
      tagLine: 'LAN',
      platform: 'LA1',
      resolvedAt: '2026-08-01T00:00:00.000Z',
    },
    puuid: `puuid-${participantId}`,
    summonerId: 'summoner-id',
    profileIconId: 1_234,
    summonerLevel: 350,
    profileRefreshedAt: '2026-08-06T12:00:00.000Z',
    baselineRank: aBaselineRank(),
    earliestMatchCoverageAt: null,
    currentRank: aRankedPosition(),
    highestObservedRank: { rank: aRankedPosition(), observedAt: '2026-08-01T00:00:00.000Z' },
    rankSnapshots: [],
    processedMatches: [],
    matchStatistics: EMPTY_MATCH_STATISTICS,
    lastSyncAt: '2026-08-06T12:00:00.000Z',
    lastSuccessfulSyncAt: '2026-08-06T12:00:00.000Z',
    syncStatus: 'SUCCESS',
    lastError: null,
    ...overrides,
  };
}

export function aChallengeConfiguration(
  overrides: Partial<ChallengeConfiguration> = {},
): ChallengeConfiguration {
  return { ...CHALLENGE, ...overrides };
}

export function anAppEnvironment(overrides: Partial<AppEnvironment> = {}): AppEnvironment {
  const base = toAppEnvironment(
    parseEnvironmentVariables({
      NODE_ENV: 'test',
      RIOT_API_KEY: 'RGAPI-00000000-0000-0000-0000-000000000000',
      ADMIN_INTERNAL_API_KEY: 'test-admin-key-with-enough-length',
      PUBLIC_CACHE_TTL_SECONDS: '0',
      SYNC_ENABLED: 'false',
    }),
  );

  return { ...base, ...overrides };
}

export function aChallengeState(overrides: Partial<ChallengeState> = {}): ChallengeState {
  return { ...createEmptyChallengeState('test-challenge'), ...overrides };
}
