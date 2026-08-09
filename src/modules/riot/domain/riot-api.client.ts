import type { RiotPlatform } from '../../../config/routing.config';
import type { RankedPosition } from '../../challenge/domain/rank/ranked-position';
import type { ProcessedMatch } from '../../matches/domain/processed-match';

/** Riot account. The PUUID is the stable technical identifier. */
export interface RiotAccount {
  readonly puuid: string;
  readonly gameName: string;
  readonly tagLine: string;
}

export interface RiotSummonerProfile {
  readonly puuid: string;
  /** `null` when Riot no longer returns the encrypted summoner id. */
  readonly summonerId: string | null;
  readonly profileIconId: number;
  readonly summonerLevel: number;
}

export interface RiotMatchIdsQuery {
  readonly puuid: string;
  readonly platform: RiotPlatform;
  readonly queueId: number;
  /** Epoch seconds, as expected by Match-V5. `null` omits the bound. */
  readonly startTimeSeconds: number | null;
  readonly endTimeSeconds: number | null;
}

export const RIOT_API_CLIENT = Symbol('RiotApiClient');

/**
 * Port for everything the application needs from Riot Games.
 *
 * Implementations own routing, retries, rate limits and the translation of Riot payloads
 * into domain models. Tests inject a fake, so no test ever reaches the real API.
 */
export interface RiotApiClient {
  /** Account-V1 by Riot ID (regional routing). Throws `RiotAccountNotFoundError` on 404. */
  resolveAccountByRiotId(
    gameName: string,
    tagLine: string,
    platform: RiotPlatform,
  ): Promise<RiotAccount>;

  /** Account-V1 by PUUID, used to keep `gameName`/`tagLine` up to date. */
  resolveAccountByPuuid(puuid: string, platform: RiotPlatform): Promise<RiotAccount>;

  /** Summoner-V4 by PUUID (platform routing). */
  fetchSummonerProfile(puuid: string, platform: RiotPlatform): Promise<RiotSummonerProfile>;

  /**
   * League-V4 by PUUID (platform routing), restricted to RANKED_SOLO_5x5.
   * `null` means UNRANKED, which is a valid state and not a synchronization failure.
   */
  fetchRankedSoloPosition(puuid: string, platform: RiotPlatform): Promise<RankedPosition | null>;

  /** Match-V5 ids (regional routing), fully paginated for the requested window. */
  fetchMatchIds(query: RiotMatchIdsQuery): Promise<string[]>;

  /** Match-V5 detail (regional routing) reduced to the requested participant. */
  fetchProcessedMatch(
    matchId: string,
    puuid: string,
    platform: RiotPlatform,
  ): Promise<ProcessedMatch | null>;
}
