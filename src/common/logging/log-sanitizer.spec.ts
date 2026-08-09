import { isSensitiveKey, REDACTED, sanitizeText, sanitizeUrl } from './log-sanitizer';

const RIOT_KEY = 'RGAPI-11111111-2222-3333-4444-555555555555';

describe('sanitizeText', () => {
  it('redacts anything that looks like a Riot API key', () => {
    expect(sanitizeText(`request failed with key ${RIOT_KEY}`)).toBe(
      `request failed with key ${REDACTED}`,
    );
  });

  it('redacts every occurrence', () => {
    expect(sanitizeText(`${RIOT_KEY} and ${RIOT_KEY}`)).toBe(`${REDACTED} and ${REDACTED}`);
  });

  it('leaves harmless text untouched', () => {
    expect(sanitizeText('GET /api/v1/leaderboard -> 200')).toBe('GET /api/v1/leaderboard -> 200');
  });
});

describe('isSensitiveKey', () => {
  it.each([
    'x-riot-token',
    'X-Internal-Api-Key',
    'authorization',
    'RIOT_API_KEY',
    'password',
    'cookie',
    'refreshToken',
    'client_secret',
    'credential',
  ])('flags %s', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(['participantId', 'limit', 'championName'])('does not flag %s', (key) => {
    expect(isSensitiveKey(key)).toBe(false);
  });
});

describe('sanitizeUrl', () => {
  it('keeps a plain path untouched', () => {
    expect(sanitizeUrl('/api/v1/participants/player-one')).toBe('/api/v1/participants/player-one');
  });

  it('keeps harmless query parameters readable', () => {
    expect(sanitizeUrl('/api/v1/leaderboard?limit=10&offset=0')).toBe(
      '/api/v1/leaderboard?limit=10&offset=0',
    );
  });

  it('redacts the value of sensitive query parameters by name', () => {
    expect(sanitizeUrl('/api/v1/leaderboard?api_key=abc123&limit=10')).toBe(
      `/api/v1/leaderboard?api_key=${encodeURIComponent(REDACTED)}&limit=10`,
    );
    expect(sanitizeUrl('/api/v1/thing?token=abc')).toContain(encodeURIComponent(REDACTED));
  });

  it('redacts a Riot API key that leaked into any parameter', () => {
    expect(sanitizeUrl(`/api/v1/leaderboard?note=${RIOT_KEY}`)).toBe(
      `/api/v1/leaderboard?note=${REDACTED}`,
    );
  });

  it('handles an empty query string', () => {
    expect(sanitizeUrl('/api/v1/leaderboard?')).toBe('/api/v1/leaderboard');
  });
});
