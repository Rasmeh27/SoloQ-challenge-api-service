import { ConfigurationValidationError } from '../common/exceptions/configuration-validation.error';
import { parseEnvironmentVariables, toAppEnvironment } from './environment.config';

function environmentOf(
  overrides: Record<string, string> = {},
): ReturnType<typeof toAppEnvironment> {
  return toAppEnvironment(parseEnvironmentVariables({ NODE_ENV: 'test', ...overrides }));
}

describe('environment configuration', () => {
  it('applies safe defaults', () => {
    const environment = environmentOf();

    expect(environment).toEqual(
      expect.objectContaining({
        nodeEnv: 'test',
        isProduction: false,
        port: 3_001,
        storageDriver: 'filesystem',
        challengeDataDir: './data',
        publicCacheTtlSeconds: 30,
        logLevel: 'log',
        synchronizationEnabled: true,
        swaggerEnabled: true,
        requestBodyLimit: '64kb',
      }),
    );
    expect(environment.riot).toEqual({
      requestTimeoutMs: 8_000,
      maxConcurrency: 4,
      maxRetries: 3,
    });
  });

  it('reports missing secrets as null instead of empty strings', () => {
    const environment = environmentOf();

    expect(environment.riotApiKey).toBeNull();
    expect(environment.adminInternalApiKey).toBeNull();
    expect(environment.blobReadWriteToken).toBeNull();
    expect(environment.cronSecret).toBeNull();
  });

  it('coerces numeric variables', () => {
    const environment = environmentOf({ PORT: '8080', RIOT_MAX_CONCURRENCY: '9' });

    expect(environment.port).toBe(8_080);
    expect(environment.riot.maxConcurrency).toBe(9);
  });

  it('parses the CORS origin list', () => {
    expect(environmentOf({ CORS_ORIGINS: 'https://a.dev, https://b.dev' }).corsOrigins).toEqual([
      'https://a.dev',
      'https://b.dev',
    ]);
    expect(environmentOf({ CORS_ORIGINS: '' }).corsOrigins).toEqual([]);
  });

  it('detects the wildcard origin separately', () => {
    const environment = environmentOf({ CORS_ORIGINS: '*' });

    expect(environment.allowAnyCorsOrigin).toBe(true);
    expect(environment.corsOrigins).toEqual([]);
  });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('parses SYNC_ENABLED=%s', (value, expected) => {
    expect(environmentOf({ SYNC_ENABLED: value }).synchronizationEnabled).toBe(expected);
  });

  it.each([
    ['PORT', '0'],
    ['PORT', 'not-a-number'],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'trace'],
    ['RIOT_REQUEST_TIMEOUT_MS', '10'],
    ['RIOT_MAX_CONCURRENCY', '0'],
    ['SYNC_ENABLED', 'maybe'],
    ['ADMIN_INTERNAL_API_KEY', 'too-short'],
    ['CRON_SECRET', 'too-short'],
  ])('rejects an invalid %s', (variable, value) => {
    expect(() => environmentOf({ [variable]: value })).toThrow(ConfigurationValidationError);
  });

  it('names the offending variable in the error message', () => {
    expect(() => environmentOf({ PORT: '-1' })).toThrow(/PORT/);
  });

  it('requires an administrative key in production', () => {
    expect(() => parseEnvironmentVariables({ NODE_ENV: 'production' })).toThrow(
      /ADMIN_INTERNAL_API_KEY/,
    );
    expect(() =>
      parseEnvironmentVariables({
        NODE_ENV: 'production',
        ADMIN_INTERNAL_API_KEY: 'a-production-key-long-enough-value',
      }),
    ).not.toThrow();
  });

  it('requires a Blob token when Vercel Blob persistence is selected', () => {
    expect(() => environmentOf({ STORAGE_DRIVER: 'vercel-blob' })).toThrow(/BLOB_READ_WRITE_TOKEN/);
    expect(() =>
      environmentOf({
        STORAGE_DRIVER: 'vercel-blob',
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_a_real_token',
      }),
    ).not.toThrow();
  });

  it('ignores unrelated environment variables', () => {
    expect(() => environmentOf({ SOME_OTHER_TOOL: 'whatever' })).not.toThrow();
  });
});
