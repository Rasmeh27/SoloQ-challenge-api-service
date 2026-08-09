import { z } from 'zod';

import { formatZodIssues } from '../../../common/validation/format-zod-issues';
import { RANKED_SOLO_QUEUE_TYPE } from '../../../config/riot.constants';
import { RIOT_PLATFORMS } from '../../../config/routing.config';
import { PERSISTED_SYNC_STATUSES } from '../../challenge/domain/sync-status';
import { RANK_DIVISIONS, RANK_TIERS } from '../../challenge/domain/rank/rank-tier';
import { CorruptedStorageError } from '../domain/storage.errors';

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be a valid ISO 8601 instant');

const finiteNumber = z.number().finite();
const nonNegativeInteger = z.number().int().min(0);

const rankedPositionSchema = z.object({
  queueType: z.literal(RANKED_SOLO_QUEUE_TYPE),
  tier: z.enum(RANK_TIERS),
  division: z.enum(RANK_DIVISIONS).nullable(),
  leaguePoints: nonNegativeInteger,
  wins: nonNegativeInteger,
  losses: nonNegativeInteger,
  veteran: z.boolean().nullable(),
  inactive: z.boolean().nullable(),
  freshBlood: z.boolean().nullable(),
  hotStreak: z.boolean().nullable(),
});

const baselineRankSchema = z.object({
  rank: rankedPositionSchema.nullable(),
  capturedAt: isoDateTime,
});

const highestObservedRankSchema = z.object({
  rank: rankedPositionSchema,
  observedAt: isoDateTime,
});

const rankSnapshotSchema = z.object({
  capturedAt: isoDateTime,
  tier: z.enum(RANK_TIERS).nullable(),
  division: z.enum(RANK_DIVISIONS).nullable(),
  leaguePoints: nonNegativeInteger.nullable(),
  wins: nonNegativeInteger.nullable(),
  losses: nonNegativeInteger.nullable(),
  visibleRankScore: finiteNumber.nullable(),
});

const processedMatchSchema = z.object({
  matchId: z.string().min(1),
  gameCreation: finiteNumber,
  gameStartTimestamp: finiteNumber,
  gameEndTimestamp: finiteNumber,
  gameDuration: finiteNumber,
  queueId: z.number().int(),
  gameVersion: z.string(),
  win: z.boolean(),
  championId: z.number().int(),
  championName: z.string(),
  teamPosition: z.string(),
  individualPosition: z.string(),
  kills: nonNegativeInteger,
  deaths: nonNegativeInteger,
  assists: nonNegativeInteger,
  kda: finiteNumber,
  totalMinionsKilled: nonNegativeInteger,
  neutralMinionsKilled: nonNegativeInteger,
  totalCs: nonNegativeInteger,
  visionScore: finiteNumber,
  goldEarned: finiteNumber,
  totalDamageDealtToChampions: finiteNumber,
  gameEndedInEarlySurrender: z.boolean(),
  gameEndedInSurrender: z.boolean(),
});

const matchStatisticsSchema = z.object({
  gamesPlayed: nonNegativeInteger,
  wins: nonNegativeInteger,
  losses: nonNegativeInteger,
  winRate: finiteNumber,
  totalKills: nonNegativeInteger,
  totalDeaths: nonNegativeInteger,
  totalAssists: nonNegativeInteger,
  averageKills: finiteNumber,
  averageDeaths: finiteNumber,
  averageAssists: finiteNumber,
  averageKda: finiteNumber,
  totalCs: nonNegativeInteger,
  averageCs: finiteNumber,
  averageCsPerMinute: finiteNumber,
  averageVisionScore: finiteNumber,
  averageDamageToChampions: finiteNumber,
  uniqueChampionsPlayed: nonNegativeInteger,
  mostPlayedChampion: z
    .object({
      championId: z.number().int(),
      championName: z.string(),
      games: nonNegativeInteger,
    })
    .nullable(),
  currentWinStreak: nonNegativeInteger,
  longestWinStreak: nonNegativeInteger,
  earlySurrenderGames: nonNegativeInteger,
  surrenderGames: nonNegativeInteger,
});

export const challengeStateDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  challengeId: z.string().min(1),
  initialized: z.boolean(),
  initializedAt: isoDateTime.nullable(),
  lastGlobalSyncAt: isoDateTime.nullable(),
  lastSuccessfulGlobalSyncAt: isoDateTime.nullable(),
  synchronizationInProgress: z.boolean(),
  participants: z.array(
    z.object({
      participantId: z.string().min(1),
      puuid: z.string().min(1),
      initializedAt: isoDateTime,
    }),
  ),
});

/** Participant document: snapshots live in their own file to keep this one focused. */
export const participantStateDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  participantId: z.string().min(1),
  resolvedAccount: z.object({
    puuid: z.string().min(1),
    gameName: z.string().min(1),
    tagLine: z.string().min(1),
    platform: z.enum(RIOT_PLATFORMS),
    resolvedAt: isoDateTime,
  }),
  puuid: z.string().min(1),
  summonerId: z.string().nullable(),
  profileIconId: z.number().int().nullable(),
  summonerLevel: z.number().int().nullable(),
  // Added in schema version 2; documents written by version 1 simply have no value yet.
  profileRefreshedAt: isoDateTime.nullable().default(null),
  baselineRank: baselineRankSchema.nullable(),
  // Added in schema version 4, replacing the v3 `trackingStartedAt`. Unknown keys are
  // dropped when reading, so a v3 document loads cleanly and simply gets `null` here,
  // which makes the next synchronization backfill from the challenge start.
  earliestMatchCoverageAt: isoDateTime.nullable().default(null),
  currentRank: rankedPositionSchema.nullable(),
  highestObservedRank: highestObservedRankSchema.nullable(),
  processedMatches: z.array(processedMatchSchema),
  matchStatistics: matchStatisticsSchema,
  lastSyncAt: isoDateTime.nullable(),
  lastSuccessfulSyncAt: isoDateTime.nullable(),
  syncStatus: z.enum(PERSISTED_SYNC_STATUSES),
  lastError: z
    .object({
      code: z.string(),
      message: z.string(),
      occurredAt: isoDateTime,
    })
    .nullable(),
});

export const rankSnapshotsDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  participantId: z.string().min(1),
  snapshots: z.array(rankSnapshotSchema),
});

export type ChallengeStateDocument = z.infer<typeof challengeStateDocumentSchema>;
export type ParticipantStateDocument = z.infer<typeof participantStateDocumentSchema>;
export type RankSnapshotsDocument = z.infer<typeof rankSnapshotsDocumentSchema>;

/**
 * Validates a document read from disk.
 * A schema mismatch is an explicit error: the file is reported and left untouched.
 */
export function parseStoredDocument<TSchema extends z.ZodType>(
  schema: TSchema,
  raw: unknown,
  documentName: string,
): z.infer<TSchema> {
  const result = schema.safeParse(raw);

  if (!result.success) {
    throw new CorruptedStorageError(documentName, formatZodIssues(result.error));
  }

  return result.data;
}
