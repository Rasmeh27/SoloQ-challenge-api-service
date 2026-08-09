import { z } from 'zod';

import { formatZodIssues } from '../../../../common/validation/format-zod-issues';
import { RiotUnexpectedResponseError } from '../../domain/riot.errors';

/**
 * External Riot payloads, kept separate from the domain models on purpose.
 *
 * Only the fields the challenge needs are declared; anything else is dropped while
 * parsing, which is also how the other nine participants of a match stop existing before
 * anything is stored. Optional fields are the ones Riot may stop returning.
 */

export const riotAccountResponseSchema = z.object({
  puuid: z.string().min(1),
  gameName: z.string().optional(),
  tagLine: z.string().optional(),
});

export const riotSummonerResponseSchema = z.object({
  id: z.string().optional(),
  puuid: z.string().min(1),
  profileIconId: z.number().int(),
  summonerLevel: z.number().int(),
});

export const riotLeagueEntryResponseSchema = z.object({
  queueType: z.string(),
  tier: z.string(),
  rank: z.string().optional(),
  leaguePoints: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  veteran: z.boolean().optional(),
  inactive: z.boolean().optional(),
  freshBlood: z.boolean().optional(),
  hotStreak: z.boolean().optional(),
});

export const riotLeagueEntriesResponseSchema = z.array(riotLeagueEntryResponseSchema);

export const riotMatchIdsResponseSchema = z.array(z.string());

export const riotMatchParticipantResponseSchema = z.object({
  puuid: z.string(),
  win: z.boolean(),
  championId: z.number().int(),
  championName: z.string().optional(),
  teamPosition: z.string().optional(),
  individualPosition: z.string().optional(),
  kills: z.number().int(),
  deaths: z.number().int(),
  assists: z.number().int(),
  totalMinionsKilled: z.number().int().optional(),
  neutralMinionsKilled: z.number().int().optional(),
  visionScore: z.number().optional(),
  goldEarned: z.number().optional(),
  totalDamageDealtToChampions: z.number().optional(),
  gameEndedInEarlySurrender: z.boolean().optional(),
  gameEndedInSurrender: z.boolean().optional(),
});

export const riotMatchInfoResponseSchema = z.object({
  gameCreation: z.number(),
  gameStartTimestamp: z.number().optional(),
  gameEndTimestamp: z.number().optional(),
  gameDuration: z.number(),
  gameVersion: z.string().optional(),
  queueId: z.number().int(),
  participants: z.array(riotMatchParticipantResponseSchema),
});

export const riotMatchResponseSchema = z.object({
  metadata: z.object({ matchId: z.string().min(1) }),
  info: riotMatchInfoResponseSchema,
});

export type RiotLeagueEntryResponse = z.infer<typeof riotLeagueEntryResponseSchema>;
export type RiotMatchResponse = z.infer<typeof riotMatchResponseSchema>;
export type RiotMatchInfoResponse = z.infer<typeof riotMatchInfoResponseSchema>;

/** Validates a Riot payload. A mismatch is an explicit integration error, never `any`. */
export function parseRiotResponse<TSchema extends z.ZodType>(
  schema: TSchema,
  raw: unknown,
  operation: string,
): z.infer<TSchema> {
  const result = schema.safeParse(raw);

  if (!result.success) {
    throw new RiotUnexpectedResponseError(operation, formatZodIssues(result.error));
  }

  return result.data;
}
