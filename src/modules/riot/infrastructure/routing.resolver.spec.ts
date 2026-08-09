import { UnsupportedPlatformError } from '../domain/riot.errors';
import { RoutingResolver } from './routing.resolver';

describe('RoutingResolver', () => {
  const resolver = new RoutingResolver();

  it('maps the Latin American and North American platforms to AMERICAS', () => {
    expect(resolver.regionalRoute('LA1')).toBe('AMERICAS');
    expect(resolver.regionalRoute('LA2')).toBe('AMERICAS');
    expect(resolver.regionalRoute('NA1')).toBe('AMERICAS');
  });

  it('builds platform base URLs for Summoner-V4 and League-V4', () => {
    expect(resolver.platformBaseUrl('LA1')).toBe('https://la1.api.riotgames.com');
    expect(resolver.platformBaseUrl('NA1')).toBe('https://na1.api.riotgames.com');
  });

  it('builds regional base URLs for Account-V1 and Match-V5', () => {
    expect(resolver.regionalBaseUrl('LA1')).toBe('https://americas.api.riotgames.com');
    expect(resolver.regionalBaseUrl('LA2')).toBe('https://americas.api.riotgames.com');
  });

  it('supports platforms outside the Americas', () => {
    expect(resolver.regionalRoute('EUW1')).toBe('EUROPE');
    expect(resolver.regionalRoute('KR')).toBe('ASIA');
    expect(resolver.regionalRoute('OC1')).toBe('SEA');
    expect(resolver.regionalBaseUrl('KR')).toBe('https://asia.api.riotgames.com');
  });

  it('exposes the full routing of a platform', () => {
    expect(resolver.routingFor('LA1')).toEqual({
      platform: 'LA1',
      platformHost: 'la1.api.riotgames.com',
      regionalRoute: 'AMERICAS',
      regionalHost: 'americas.api.riotgames.com',
    });
  });

  it('rejects unknown platforms with an explicit domain error', () => {
    expect(() => resolver.routingFor('LAN')).toThrow(UnsupportedPlatformError);
    expect(() => resolver.routingFor('')).toThrow(UnsupportedPlatformError);
  });
});
