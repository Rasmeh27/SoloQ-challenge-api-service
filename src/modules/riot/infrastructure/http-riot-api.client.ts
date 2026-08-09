import { Injectable, Logger } from '@nestjs/common';

import {
  RANKED_SOLO_QUEUE_TYPE,
  RIOT_MATCH_IDS_MAX_PAGE_SIZE,
} from '../../../config/riot.constants';
import type { RiotPlatform } from '../../../config/routing.config';
import type { RankedPosition } from '../../challenge/domain/rank/ranked-position';
import { formatRiotId } from '../../challenge/domain/participant-state';
import type { ProcessedMatch } from '../../matches/domain/processed-match';
import type {
  RiotAccount,
  RiotApiClient,
  RiotMatchIdsQuery,
  RiotSummonerProfile,
} from '../domain/riot-api.client';
import { RiotAccountNotFoundError, RiotResourceNotFoundError } from '../domain/riot.errors';
import {
  parseRiotResponse,
  riotAccountResponseSchema,
  riotLeagueEntriesResponseSchema,
  riotMatchIdsResponseSchema,
  riotMatchResponseSchema,
  riotSummonerResponseSchema,
} from './dto/riot-responses';
import { toProcessedMatch } from './mappers/riot-match.mapper';
import { toRankedPosition } from './mappers/riot-rank.mapper';
import { RIOT_ENDPOINTS } from './riot-endpoints';
import { RiotHttpClient } from './riot-http.client';
import { RoutingResolver } from './routing.resolver';

/** Safety bound so a misconfigured window cannot page forever. */
const MAX_MATCH_ID_PAGES = 20;

const OPERATIONS = {
  accountByRiotId: 'account-v1:by-riot-id',
  accountByPuuid: 'account-v1:by-puuid',
  summonerByPuuid: 'summoner-v4:by-puuid',
  leagueEntriesByPuuid: 'league-v4:entries-by-puuid',
  matchIds: 'match-v5:ids',
  matchById: 'match-v5:by-id',
} as const;

/** HTTP implementation of the Riot port: routing, parsing and mapping to domain models. */
@Injectable()
export class HttpRiotApiClient implements RiotApiClient {
  private readonly logger = new Logger(HttpRiotApiClient.name);

  constructor(
    private readonly http: RiotHttpClient,
    private readonly routing: RoutingResolver,
  ) {}

  public async resolveAccountByRiotId(
    gameName: string,
    tagLine: string,
    platform: RiotPlatform,
  ): Promise<RiotAccount> {
    try {
      const raw = await this.http.requestJson({
        baseUrl: this.routing.regionalBaseUrl(platform),
        path: RIOT_ENDPOINTS.accountByRiotId(gameName, tagLine),
        operation: OPERATIONS.accountByRiotId,
      });

      const account = parseRiotResponse(riotAccountResponseSchema, raw, OPERATIONS.accountByRiotId);

      return {
        puuid: account.puuid,
        gameName: account.gameName ?? gameName,
        tagLine: account.tagLine ?? tagLine,
      };
    } catch (error) {
      if (error instanceof RiotResourceNotFoundError) {
        throw new RiotAccountNotFoundError(formatRiotId(gameName, tagLine));
      }

      throw error;
    }
  }

  public async resolveAccountByPuuid(puuid: string, platform: RiotPlatform): Promise<RiotAccount> {
    const raw = await this.http.requestJson({
      baseUrl: this.routing.regionalBaseUrl(platform),
      path: RIOT_ENDPOINTS.accountByPuuid(puuid),
      operation: OPERATIONS.accountByPuuid,
    });

    const account = parseRiotResponse(riotAccountResponseSchema, raw, OPERATIONS.accountByPuuid);

    return {
      puuid: account.puuid,
      gameName: account.gameName ?? '',
      tagLine: account.tagLine ?? '',
    };
  }

  public async fetchSummonerProfile(
    puuid: string,
    platform: RiotPlatform,
  ): Promise<RiotSummonerProfile> {
    const raw = await this.http.requestJson({
      baseUrl: this.routing.platformBaseUrl(platform),
      path: RIOT_ENDPOINTS.summonerByPuuid(puuid),
      operation: OPERATIONS.summonerByPuuid,
    });

    const summoner = parseRiotResponse(riotSummonerResponseSchema, raw, OPERATIONS.summonerByPuuid);

    return {
      puuid: summoner.puuid,
      summonerId: summoner.id ?? null,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
    };
  }

  public async fetchRankedSoloPosition(
    puuid: string,
    platform: RiotPlatform,
  ): Promise<RankedPosition | null> {
    let raw: unknown;

    try {
      raw = await this.http.requestJson({
        baseUrl: this.routing.platformBaseUrl(platform),
        path: RIOT_ENDPOINTS.leagueEntriesByPuuid(puuid),
        operation: OPERATIONS.leagueEntriesByPuuid,
      });
    } catch (error) {
      // No league entries is UNRANKED, not a failure.
      if (error instanceof RiotResourceNotFoundError) {
        return null;
      }

      throw error;
    }

    const entries = parseRiotResponse(
      riotLeagueEntriesResponseSchema,
      raw,
      OPERATIONS.leagueEntriesByPuuid,
    );
    const soloEntry = entries.find((entry) => entry.queueType === RANKED_SOLO_QUEUE_TYPE);

    return soloEntry === undefined
      ? null
      : toRankedPosition(soloEntry, OPERATIONS.leagueEntriesByPuuid);
  }

  public async fetchMatchIds(query: RiotMatchIdsQuery): Promise<string[]> {
    const baseUrl = this.routing.regionalBaseUrl(query.platform);
    const path = RIOT_ENDPOINTS.matchIdsByPuuid(query.puuid);
    const matchIds: string[] = [];

    for (let page = 0; page < MAX_MATCH_ID_PAGES; page += 1) {
      const raw = await this.http.requestJson({
        baseUrl,
        path,
        operation: OPERATIONS.matchIds,
        query: {
          queue: query.queueId,
          startTime: query.startTimeSeconds ?? undefined,
          endTime: query.endTimeSeconds ?? undefined,
          start: page * RIOT_MATCH_IDS_MAX_PAGE_SIZE,
          count: RIOT_MATCH_IDS_MAX_PAGE_SIZE,
        },
      });

      const pageIds = parseRiotResponse(riotMatchIdsResponseSchema, raw, OPERATIONS.matchIds);
      matchIds.push(...pageIds);

      if (pageIds.length < RIOT_MATCH_IDS_MAX_PAGE_SIZE) {
        return matchIds;
      }
    }

    this.logger.warn(
      `Reached the match id page cap (${MAX_MATCH_ID_PAGES} pages of ${RIOT_MATCH_IDS_MAX_PAGE_SIZE}). ` +
        'Older matches of this window were not requested.',
    );

    return matchIds;
  }

  public async fetchProcessedMatch(
    matchId: string,
    puuid: string,
    platform: RiotPlatform,
  ): Promise<ProcessedMatch | null> {
    let raw: unknown;

    try {
      raw = await this.http.requestJson({
        baseUrl: this.routing.regionalBaseUrl(platform),
        path: RIOT_ENDPOINTS.matchById(matchId),
        operation: OPERATIONS.matchById,
      });
    } catch (error) {
      if (error instanceof RiotResourceNotFoundError) {
        this.logger.warn(`Match ${matchId} is no longer available on Riot; skipping it.`);
        return null;
      }

      throw error;
    }

    const match = parseRiotResponse(riotMatchResponseSchema, raw, OPERATIONS.matchById);

    return toProcessedMatch(match, puuid);
  }
}
