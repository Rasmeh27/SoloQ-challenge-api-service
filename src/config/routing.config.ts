/**
 * Riot Games routing configuration.
 *
 * Riot exposes two different routing families and using the wrong one returns 404:
 *  - Platform routing (la1, na1, ...) for Summoner-V4 and League-V4.
 *  - Regional routing (americas, europe, ...) for Account-V1 and Match-V5.
 *
 * Every URL used by the application is derived from this single map so hosts are
 * never hardcoded across services.
 */

export const RIOT_PLATFORMS = [
  'BR1',
  'EUN1',
  'EUW1',
  'JP1',
  'KR',
  'LA1',
  'LA2',
  'ME1',
  'NA1',
  'OC1',
  'RU',
  'SG2',
  'TR1',
  'TW2',
  'VN2',
] as const;

export type RiotPlatform = (typeof RIOT_PLATFORMS)[number];

export const RIOT_REGIONAL_ROUTES = ['AMERICAS', 'ASIA', 'EUROPE', 'SEA'] as const;

export type RiotRegionalRoute = (typeof RIOT_REGIONAL_ROUTES)[number];

export interface PlatformRouting {
  readonly platform: RiotPlatform;
  readonly platformHost: string;
  readonly regionalRoute: RiotRegionalRoute;
  readonly regionalHost: string;
}

const RIOT_API_HOST_SUFFIX = 'api.riotgames.com';
const HTTPS_SCHEME = 'https://';

const PLATFORM_REGIONAL_ROUTE: Readonly<Record<RiotPlatform, RiotRegionalRoute>> = {
  BR1: 'AMERICAS',
  LA1: 'AMERICAS',
  LA2: 'AMERICAS',
  NA1: 'AMERICAS',
  EUN1: 'EUROPE',
  EUW1: 'EUROPE',
  ME1: 'EUROPE',
  RU: 'EUROPE',
  TR1: 'EUROPE',
  JP1: 'ASIA',
  KR: 'ASIA',
  OC1: 'SEA',
  SG2: 'SEA',
  TW2: 'SEA',
  VN2: 'SEA',
};

function toHost(routeSegment: string): string {
  return `${routeSegment.toLowerCase()}.${RIOT_API_HOST_SUFFIX}`;
}

function buildPlatformRouting(platform: RiotPlatform): PlatformRouting {
  const regionalRoute = PLATFORM_REGIONAL_ROUTE[platform];
  return {
    platform,
    platformHost: toHost(platform),
    regionalRoute,
    regionalHost: toHost(regionalRoute),
  };
}

export const PLATFORM_ROUTING: Readonly<Record<RiotPlatform, PlatformRouting>> = Object.freeze(
  Object.fromEntries(
    RIOT_PLATFORMS.map((platform) => [platform, buildPlatformRouting(platform)]),
  ) as Record<RiotPlatform, PlatformRouting>,
);

export function isRiotPlatform(value: string): value is RiotPlatform {
  return (RIOT_PLATFORMS as readonly string[]).includes(value);
}

export function toBaseUrl(host: string): string {
  return `${HTTPS_SCHEME}${host}`;
}
