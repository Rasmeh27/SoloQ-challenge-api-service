import { Logger } from '@nestjs/common';

import { sanitizeText } from '../common/logging/log-sanitizer';
import { toIsoDateTime } from '../common/time/iso-date-time';
import { SystemSleeper } from '../common/utils/sleeper';
import { loadAppEnvironment } from '../config/environment.config';
import { isRiotPlatform, type RiotPlatform } from '../config/routing.config';
import { formatRankDisplayName } from '../modules/challenge/domain/rank/ranked-position';
import { RiotRequestMeter } from '../modules/riot/domain/riot-request.meter';
import { HttpRiotApiClient } from '../modules/riot/infrastructure/http-riot-api.client';
import {
  type FetchFunction,
  RiotHttpClient,
} from '../modules/riot/infrastructure/riot-http.client';
import { RoutingResolver } from '../modules/riot/infrastructure/routing.resolver';

const MAX_MATCH_IDS = 5;
const MAX_DOWNLOADED_MATCHES = 1;
const PUUID_PREFIX_LENGTH = 8;
const EXIT_FAILURE = 1;
const JSON_INDENTATION = 2;

const logger = new Logger('RiotSmokeTest');

interface SmokeTestInput {
  readonly gameName: string;
  readonly tagLine: string;
  readonly platform: RiotPlatform;
}

/** Only a prefix is printed: the PUUID is a stable account identifier, not a display value. */
function maskPuuid(puuid: string): string {
  return `${puuid.slice(0, PUUID_PREFIX_LENGTH)}…(${puuid.length} chars)`;
}

function readInput(): SmokeTestInput {
  const gameName = process.env.RIOT_GAME_NAME?.trim() ?? '';
  const tagLine = process.env.RIOT_TAG_LINE?.trim() ?? '';
  const platform = process.env.RIOT_PLATFORM?.trim().toUpperCase() ?? '';

  const missing = [
    gameName.length === 0 ? 'RIOT_GAME_NAME' : null,
    tagLine.length === 0 ? 'RIOT_TAG_LINE' : null,
    platform.length === 0 ? 'RIOT_PLATFORM' : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    throw new Error(`Missing required variables: ${missing.join(', ')}`);
  }

  if (!isRiotPlatform(platform)) {
    throw new Error(`RIOT_PLATFORM "${platform}" is not a supported platform.`);
  }

  return { gameName, tagLine, platform };
}

function buildClient(): HttpRiotApiClient {
  const environment = loadAppEnvironment();

  if (environment.riotApiKey === null) {
    throw new Error('RIOT_API_KEY is required to run the Riot smoke test.');
  }

  const fetchFunction: FetchFunction = (url, init) => fetch(url, init);
  const meter = new RiotRequestMeter();
  const http = new RiotHttpClient(environment, new SystemSleeper(), fetchFunction, meter);

  return new HttpRiotApiClient(http, new RoutingResolver());
}

/**
 * Controlled, read only check against the real Riot API.
 *
 * It exercises the real endpoints, DTO validation and mappers with a tight budget: one
 * account lookup, one profile, one ranked query, at most five match ids and at most one
 * match detail. It never touches the challenge state, never captures a baseline and never
 * prints or stores the API key.
 */
async function main(): Promise<void> {
  const input = readInput();
  const riot = buildClient();
  const routing = new RoutingResolver();

  logger.log(
    `Resolving ${input.gameName}#${input.tagLine} on ${input.platform} ` +
      `(regional route ${routing.regionalRoute(input.platform)})`,
  );

  const account = await riot.resolveAccountByRiotId(input.gameName, input.tagLine, input.platform);
  const profile = await riot.fetchSummonerProfile(account.puuid, input.platform);
  const rankedPosition = await riot.fetchRankedSoloPosition(account.puuid, input.platform);

  const matchIds = (
    await riot.fetchMatchIds({
      puuid: account.puuid,
      platform: input.platform,
      queueId: 420,
      startTimeSeconds: null,
      endTimeSeconds: null,
    })
  ).slice(0, MAX_MATCH_IDS);

  const downloadedMatches = [];

  for (const matchId of matchIds.slice(0, MAX_DOWNLOADED_MATCHES)) {
    const match = await riot.fetchProcessedMatch(matchId, account.puuid, input.platform);

    if (match !== null) {
      downloadedMatches.push(match);
    }
  }

  const summary = {
    checkedAt: toIsoDateTime(new Date()),
    riotId: `${account.gameName}#${account.tagLine}`,
    platform: input.platform,
    regionalRoute: routing.regionalRoute(input.platform),
    puuid: maskPuuid(account.puuid),
    summonerLevel: profile.summonerLevel,
    profileIconId: profile.profileIconId,
    summonerIdReturnedByRiot: profile.summonerId !== null,
    rankedSolo:
      rankedPosition === null
        ? 'UNRANKED'
        : {
            displayName: formatRankDisplayName(rankedPosition),
            tier: rankedPosition.tier,
            division: rankedPosition.division,
            leaguePoints: rankedPosition.leaguePoints,
            lifetimeWins: rankedPosition.wins,
            lifetimeLosses: rankedPosition.losses,
          },
    rankedSoloMatchIdsFound: matchIds.length,
    matchesDownloaded: downloadedMatches.length,
    sampleMatch:
      downloadedMatches[0] === undefined
        ? null
        : {
            matchId: downloadedMatches[0].matchId,
            queueId: downloadedMatches[0].queueId,
            playedAt: toIsoDateTime(new Date(downloadedMatches[0].gameStartTimestamp)),
            durationSeconds: downloadedMatches[0].gameDuration,
            champion: downloadedMatches[0].championName,
            win: downloadedMatches[0].win,
            kda: `${downloadedMatches[0].kills}/${downloadedMatches[0].deaths}/${downloadedMatches[0].assists}`,
            totalCs: downloadedMatches[0].totalCs,
          },
  };

  // Sanitized on the way out as a last barrier: no Riot key can reach stdout.
  console.log(sanitizeText(JSON.stringify(summary, null, JSON_INDENTATION)));
  logger.log('Riot smoke test completed successfully. The challenge state was not modified.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected failure';

  logger.error(`Riot smoke test failed: ${sanitizeText(message)}`);
  process.exitCode = EXIT_FAILURE;
});
