import type { RiotPlatform } from '../config/routing.config';
import { formatRiotId } from '../modules/challenge/domain/participant-state';
import type { RankedPosition } from '../modules/challenge/domain/rank/ranked-position';
import type { ProcessedMatch } from '../modules/matches/domain/processed-match';
import type {
  RiotAccount,
  RiotApiClient,
  RiotMatchIdsQuery,
  RiotSummonerProfile,
} from '../modules/riot/domain/riot-api.client';
import { RiotAccountNotFoundError } from '../modules/riot/domain/riot.errors';

interface RegisteredParticipant {
  readonly gameName: string;
  readonly tagLine: string;
  readonly puuid: string;
  readonly profile: RiotSummonerProfile;
  readonly rank: RankedPosition | null;
  readonly matches: readonly ProcessedMatch[];
}

const DEFAULT_PROFILE_ICON_ID = 1_234;
const DEFAULT_SUMMONER_LEVEL = 350;

/**
 * Scripted Riot client. Tests inject it through the `RIOT_API_CLIENT` port so no test ever
 * reaches the real Riot API and no real key is needed.
 */
export class FakeRiotApiClient implements RiotApiClient {
  public readonly matchDetailRequests: string[] = [];
  public readonly matchIdsRequests: RiotMatchIdsQuery[] = [];
  public readonly accountByPuuidRequests: string[] = [];
  public readonly summonerProfileRequests: string[] = [];
  public readonly rankedPositionRequests: string[] = [];

  private readonly byRiotId = new Map<string, RegisteredParticipant>();
  private readonly byPuuid = new Map<string, RegisteredParticipant>();
  private readonly accountResolutionErrors = new Map<string, Error>();
  private readonly matchDetailErrors = new Map<string, Error>();
  private readonly rankErrors = new Map<string, Error>();

  public register(participant: {
    gameName: string;
    tagLine: string;
    puuid?: string;
    profile?: Partial<RiotSummonerProfile>;
    rank?: RankedPosition | null;
    matches?: readonly ProcessedMatch[];
  }): void {
    const puuid = participant.puuid ?? `puuid-${participant.gameName.toLowerCase()}`;
    const registered: RegisteredParticipant = {
      gameName: participant.gameName,
      tagLine: participant.tagLine,
      puuid,
      profile: {
        puuid,
        summonerId: `summoner-${puuid}`,
        profileIconId: DEFAULT_PROFILE_ICON_ID,
        summonerLevel: DEFAULT_SUMMONER_LEVEL,
        ...participant.profile,
      },
      rank: participant.rank ?? null,
      matches: participant.matches ?? [],
    };

    this.byRiotId.set(this.riotIdKey(participant.gameName, participant.tagLine), registered);
    this.byPuuid.set(puuid, registered);
  }

  public failAccountResolution(gameName: string, tagLine: string, error: Error): void {
    this.accountResolutionErrors.set(this.riotIdKey(gameName, tagLine), error);
  }

  public clearAccountResolutionFailure(gameName: string, tagLine: string): void {
    this.accountResolutionErrors.delete(this.riotIdKey(gameName, tagLine));
  }

  public failRankLookup(puuid: string, error: Error): void {
    this.rankErrors.set(puuid, error);
  }

  public failMatchDetail(matchId: string, error: Error): void {
    this.matchDetailErrors.set(matchId, error);
  }

  public resolveAccountByRiotId(
    gameName: string,
    tagLine: string,
    _platform: RiotPlatform,
  ): Promise<RiotAccount> {
    const key = this.riotIdKey(gameName, tagLine);
    const failure = this.accountResolutionErrors.get(key);

    if (failure) {
      return Promise.reject(failure);
    }

    const registered = this.byRiotId.get(key);

    if (registered === undefined) {
      return Promise.reject(new RiotAccountNotFoundError(formatRiotId(gameName, tagLine)));
    }

    return Promise.resolve({
      puuid: registered.puuid,
      gameName: registered.gameName,
      tagLine: registered.tagLine,
    });
  }

  public resolveAccountByPuuid(puuid: string, _platform: RiotPlatform): Promise<RiotAccount> {
    this.accountByPuuidRequests.push(puuid);
    const registered = this.requirePuuid(puuid);

    return Promise.resolve({
      puuid: registered.puuid,
      gameName: registered.gameName,
      tagLine: registered.tagLine,
    });
  }

  public fetchSummonerProfile(
    puuid: string,
    _platform: RiotPlatform,
  ): Promise<RiotSummonerProfile> {
    this.summonerProfileRequests.push(puuid);

    return Promise.resolve(this.requirePuuid(puuid).profile);
  }

  public fetchRankedSoloPosition(
    puuid: string,
    _platform: RiotPlatform,
  ): Promise<RankedPosition | null> {
    this.rankedPositionRequests.push(puuid);
    const failure = this.rankErrors.get(puuid);

    if (failure) {
      return Promise.reject(failure);
    }

    return Promise.resolve(this.requirePuuid(puuid).rank);
  }

  public fetchMatchIds(query: RiotMatchIdsQuery): Promise<string[]> {
    this.matchIdsRequests.push(query);

    const registered = this.requirePuuid(query.puuid);
    const startMs = query.startTimeSeconds === null ? null : query.startTimeSeconds * 1_000;
    const endMs = query.endTimeSeconds === null ? null : query.endTimeSeconds * 1_000;

    return Promise.resolve(
      registered.matches
        .filter((match) => match.queueId === query.queueId)
        .filter((match) => startMs === null || match.gameStartTimestamp >= startMs)
        .filter((match) => endMs === null || match.gameStartTimestamp <= endMs)
        .map((match) => match.matchId),
    );
  }

  public fetchProcessedMatch(
    matchId: string,
    puuid: string,
    _platform: RiotPlatform,
  ): Promise<ProcessedMatch | null> {
    this.matchDetailRequests.push(matchId);

    const failure = this.matchDetailErrors.get(matchId);

    if (failure) {
      return Promise.reject(failure);
    }

    const match = this.requirePuuid(puuid).matches.find((entry) => entry.matchId === matchId);

    return Promise.resolve(match ?? null);
  }

  private requirePuuid(puuid: string): RegisteredParticipant {
    const registered = this.byPuuid.get(puuid);

    if (registered === undefined) {
      throw new RiotAccountNotFoundError(puuid);
    }

    return registered;
  }

  private riotIdKey(gameName: string, tagLine: string): string {
    return formatRiotId(gameName, tagLine).toLowerCase();
  }
}
