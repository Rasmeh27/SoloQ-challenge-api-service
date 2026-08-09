function segment(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Riot endpoint paths. `gameName` and `tagLine` are encoded as URL segments, which is
 * mandatory: Riot IDs may contain spaces and other reserved characters.
 *
 * Search by summoner name is deliberately absent: it is deprecated and not used.
 */
export const RIOT_ENDPOINTS = {
  /** Regional routing. */
  accountByRiotId: (gameName: string, tagLine: string): string =>
    `/riot/account/v1/accounts/by-riot-id/${segment(gameName)}/${segment(tagLine)}`,

  /** Regional routing. */
  accountByPuuid: (puuid: string): string => `/riot/account/v1/accounts/by-puuid/${segment(puuid)}`,

  /** Platform routing. */
  summonerByPuuid: (puuid: string): string =>
    `/lol/summoner/v4/summoners/by-puuid/${segment(puuid)}`,

  /** Platform routing. Current official endpoint for ranked entries by PUUID. */
  leagueEntriesByPuuid: (puuid: string): string =>
    `/lol/league/v4/entries/by-puuid/${segment(puuid)}`,

  /** Regional routing. */
  matchIdsByPuuid: (puuid: string): string =>
    `/lol/match/v5/matches/by-puuid/${segment(puuid)}/ids`,

  /** Regional routing. */
  matchById: (matchId: string): string => `/lol/match/v5/matches/${segment(matchId)}`,
} as const;
