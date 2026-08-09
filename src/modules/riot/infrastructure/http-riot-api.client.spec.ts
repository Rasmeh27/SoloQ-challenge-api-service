import { RANKED_SOLO_QUEUE_TYPE } from '../../../config/riot.constants';
import { RiotAccountNotFoundError, RiotResourceNotFoundError } from '../domain/riot.errors';
import { HttpRiotApiClient } from './http-riot-api.client';
import type { RiotHttpClient, RiotHttpRequest } from './riot-http.client';
import { RoutingResolver } from './routing.resolver';

const PLATFORM = 'LA1';
const PUUID = 'puuid-player-one';
const REGIONAL_BASE_URL = 'https://americas.api.riotgames.com';
const PLATFORM_BASE_URL = 'https://la1.api.riotgames.com';

/** Records the requests the client builds and replays scripted responses. */
class StubRiotHttpClient {
  public readonly requests: RiotHttpRequest[] = [];
  /** Values are replayed in order; an `Error` is replayed as a rejection. */
  private readonly responses: unknown[] = [];

  public enqueue(...responses: unknown[]): void {
    this.responses.push(...responses);
  }

  public requestJson(request: RiotHttpRequest): Promise<unknown> {
    this.requests.push(request);

    const next = this.responses.shift();

    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  }
}

function buildClient(): { client: HttpRiotApiClient; http: StubRiotHttpClient } {
  const http = new StubRiotHttpClient();

  return {
    http,
    client: new HttpRiotApiClient(http as unknown as RiotHttpClient, new RoutingResolver()),
  };
}

describe('HttpRiotApiClient', () => {
  describe('account resolution', () => {
    it('uses Account-V1 with regional routing and URL encoded segments', async () => {
      const { client, http } = buildClient();
      http.enqueue({ puuid: PUUID, gameName: 'Player One', tagLine: 'LAN' });

      const account = await client.resolveAccountByRiotId('Player One', 'LAN', PLATFORM);

      expect(account).toEqual({ puuid: PUUID, gameName: 'Player One', tagLine: 'LAN' });
      expect(http.requests[0]).toEqual(
        expect.objectContaining({
          baseUrl: REGIONAL_BASE_URL,
          path: '/riot/account/v1/accounts/by-riot-id/Player%20One/LAN',
        }),
      );
    });

    it('translates a 404 into an explicit account not found error', async () => {
      const { client, http } = buildClient();
      http.enqueue(new RiotResourceNotFoundError('account-v1:by-riot-id'));

      await expect(client.resolveAccountByRiotId('Ghost', 'LAN', PLATFORM)).rejects.toThrow(
        RiotAccountNotFoundError,
      );
    });

    it('falls back to the requested Riot ID when Riot omits it', async () => {
      const { client, http } = buildClient();
      http.enqueue({ puuid: PUUID });

      await expect(client.resolveAccountByRiotId('PlayerOne', 'LAN', PLATFORM)).resolves.toEqual({
        puuid: PUUID,
        gameName: 'PlayerOne',
        tagLine: 'LAN',
      });
    });

    it('refreshes the Riot ID from the PUUID', async () => {
      const { client, http } = buildClient();
      http.enqueue({ puuid: PUUID, gameName: 'Renamed', tagLine: 'LAS' });

      const account = await client.resolveAccountByPuuid(PUUID, PLATFORM);

      expect(account.gameName).toBe('Renamed');
      expect(http.requests[0].path).toBe(`/riot/account/v1/accounts/by-puuid/${PUUID}`);
      expect(http.requests[0].baseUrl).toBe(REGIONAL_BASE_URL);
    });
  });

  describe('summoner profile', () => {
    it('uses Summoner-V4 with platform routing', async () => {
      const { client, http } = buildClient();
      http.enqueue({ id: 'summoner-1', puuid: PUUID, profileIconId: 1_234, summonerLevel: 350 });

      const profile = await client.fetchSummonerProfile(PUUID, PLATFORM);

      expect(profile).toEqual({
        puuid: PUUID,
        summonerId: 'summoner-1',
        profileIconId: 1_234,
        summonerLevel: 350,
      });
      expect(http.requests[0]).toEqual(
        expect.objectContaining({
          baseUrl: PLATFORM_BASE_URL,
          path: `/lol/summoner/v4/summoners/by-puuid/${PUUID}`,
        }),
      );
    });

    it('accepts a response without the encrypted summoner id', async () => {
      const { client, http } = buildClient();
      http.enqueue({ puuid: PUUID, profileIconId: 1, summonerLevel: 2 });

      await expect(client.fetchSummonerProfile(PUUID, PLATFORM)).resolves.toEqual(
        expect.objectContaining({ summonerId: null }),
      );
    });
  });

  describe('ranked position', () => {
    it('selects only the Ranked Solo/Duo entry', async () => {
      const { client, http } = buildClient();
      http.enqueue([
        {
          queueType: 'RANKED_FLEX_SR',
          tier: 'DIAMOND',
          rank: 'I',
          leaguePoints: 99,
          wins: 9,
          losses: 1,
        },
        {
          queueType: RANKED_SOLO_QUEUE_TYPE,
          tier: 'EMERALD',
          rank: 'III',
          leaguePoints: 20,
          wins: 40,
          losses: 32,
        },
      ]);

      const position = await client.fetchRankedSoloPosition(PUUID, PLATFORM);

      expect(position).toEqual(
        expect.objectContaining({ tier: 'EMERALD', division: 'III', leaguePoints: 20 }),
      );
      expect(http.requests[0]).toEqual(
        expect.objectContaining({
          baseUrl: PLATFORM_BASE_URL,
          path: `/lol/league/v4/entries/by-puuid/${PUUID}`,
        }),
      );
    });

    it('reports UNRANKED when there is no Ranked Solo/Duo entry', async () => {
      const { client, http } = buildClient();
      http.enqueue([]);

      await expect(client.fetchRankedSoloPosition(PUUID, PLATFORM)).resolves.toBeNull();
    });

    it('treats a 404 as UNRANKED instead of a failure', async () => {
      const { client, http } = buildClient();
      http.enqueue(new RiotResourceNotFoundError('league-v4:entries-by-puuid'));

      await expect(client.fetchRankedSoloPosition(PUUID, PLATFORM)).resolves.toBeNull();
    });
  });

  describe('match ids', () => {
    it('requests the queue and the time window with regional routing', async () => {
      const { client, http } = buildClient();
      http.enqueue(['LA1_1', 'LA1_2']);

      const ids = await client.fetchMatchIds({
        puuid: PUUID,
        platform: PLATFORM,
        queueId: 420,
        startTimeSeconds: 1_000,
        endTimeSeconds: 2_000,
      });

      expect(ids).toEqual(['LA1_1', 'LA1_2']);
      expect(http.requests[0]).toEqual(
        expect.objectContaining({
          baseUrl: REGIONAL_BASE_URL,
          path: `/lol/match/v5/matches/by-puuid/${PUUID}/ids`,
          query: { queue: 420, startTime: 1_000, endTime: 2_000, start: 0, count: 100 },
        }),
      );
    });

    it('omits the bounds that were not requested', async () => {
      const { client, http } = buildClient();
      http.enqueue([]);

      await client.fetchMatchIds({
        puuid: PUUID,
        platform: PLATFORM,
        queueId: 420,
        startTimeSeconds: null,
        endTimeSeconds: null,
      });

      expect(http.requests[0].query).toEqual(
        expect.objectContaining({ startTime: undefined, endTime: undefined }),
      );
    });

    it('paginates until Riot returns a partial page', async () => {
      const { client, http } = buildClient();
      const fullPage = Array.from({ length: 100 }, (_value, index) => `LA1_${index}`);
      http.enqueue(fullPage, ['LA1_100', 'LA1_101']);

      const ids = await client.fetchMatchIds({
        puuid: PUUID,
        platform: PLATFORM,
        queueId: 420,
        startTimeSeconds: null,
        endTimeSeconds: null,
      });

      expect(ids).toHaveLength(102);
      expect(http.requests).toHaveLength(2);
      expect(http.requests[1].query).toEqual(expect.objectContaining({ start: 100, count: 100 }));
    });
  });

  describe('match detail', () => {
    it('maps the match to the requested participant', async () => {
      const { client, http } = buildClient();
      http.enqueue({
        metadata: { matchId: 'LA1_1' },
        info: {
          gameCreation: 1_000,
          gameStartTimestamp: 2_000,
          gameEndTimestamp: 1_802_000,
          gameDuration: 1_800,
          gameVersion: '16.15.1',
          queueId: 420,
          participants: [
            { puuid: PUUID, win: true, championId: 64, kills: 1, deaths: 1, assists: 1 },
          ],
        },
      });

      const match = await client.fetchProcessedMatch('LA1_1', PUUID, PLATFORM);

      expect(match?.matchId).toBe('LA1_1');
      expect(http.requests[0]).toEqual(
        expect.objectContaining({
          baseUrl: REGIONAL_BASE_URL,
          path: '/lol/match/v5/matches/LA1_1',
        }),
      );
    });

    it('skips a match that Riot no longer serves', async () => {
      const { client, http } = buildClient();
      http.enqueue(new RiotResourceNotFoundError('match-v5:by-id'));

      await expect(client.fetchProcessedMatch('LA1_404', PUUID, PLATFORM)).resolves.toBeNull();
    });
  });
});
