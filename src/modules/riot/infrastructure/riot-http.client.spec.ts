import { RIOT_API_KEY_HEADER } from '../../../config/riot.constants';
import { RiotRequestMeter } from '../domain/riot-request.meter';
import { anAppEnvironment, RecordingSleeper } from '../../../test-support/builders';
import {
  RiotApiNotConfiguredError,
  RiotAuthenticationError,
  RiotRateLimitError,
  RiotRequestTimeoutError,
  RiotResourceNotFoundError,
  RiotUnavailableError,
  RiotUnexpectedResponseError,
} from '../domain/riot.errors';
import {
  type FetchFunction,
  type HttpRequestInit,
  type HttpResponseLike,
  RiotHttpClient,
} from './riot-http.client';

const API_KEY = 'RGAPI-11111111-2222-3333-4444-555555555555';
const BASE_URL = 'https://americas.api.riotgames.com';
const REQUEST = { baseUrl: BASE_URL, path: '/riot/account/v1/accounts', operation: 'test-op' };

function responseOf(options: {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  bodyText?: string;
}): HttpResponseLike {
  const status = options.status ?? 200;

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => options.headers?.[name.toLowerCase()] ?? null },
    json: () =>
      options.body === undefined
        ? Promise.reject(new Error('no body'))
        : Promise.resolve(options.body),
    text: () => Promise.resolve(options.bodyText ?? JSON.stringify(options.body ?? {})),
  };
}

interface RecordedRequest {
  readonly url: string;
  readonly init: HttpRequestInit;
}

function clientWith(
  responses: readonly (HttpResponseLike | Error)[],
  environmentOverrides: Parameters<typeof anAppEnvironment>[0] = {},
): {
  client: RiotHttpClient;
  requests: RecordedRequest[];
  sleeper: RecordingSleeper;
  meter: RiotRequestMeter;
} {
  const queue = [...responses];
  const requests: RecordedRequest[] = [];
  const fetchFunction: FetchFunction = (url, init) => {
    requests.push({ url, init });
    const next = queue.shift();

    if (next === undefined) {
      return Promise.reject(new Error('unexpected extra request'));
    }

    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };

  const sleeper = new RecordingSleeper();
  const environment = anAppEnvironment({ riotApiKey: API_KEY, ...environmentOverrides });
  const meter = new RiotRequestMeter();

  return {
    client: new RiotHttpClient(environment, sleeper, fetchFunction, meter),
    requests,
    sleeper,
    meter,
  };
}

function abortError(name: 'TimeoutError' | 'AbortError'): Error {
  const error = new Error('aborted');
  error.name = name;

  return error;
}

describe('RiotHttpClient', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the API key in the Riot header and never in the URL', async () => {
    const { client, requests } = clientWith([responseOf({ body: { puuid: 'p' } })]);

    await client.requestJson({ ...REQUEST, query: { queue: 420, start: 0 } });

    expect(requests).toHaveLength(1);
    expect(requests[0].init.headers[RIOT_API_KEY_HEADER]).toBe(API_KEY);
    expect(requests[0].url).toBe(`${BASE_URL}/riot/account/v1/accounts?queue=420&start=0`);
    expect(requests[0].url).not.toContain(API_KEY);
    expect(requests[0].url).not.toContain('api_key');
  });

  it('omits undefined query parameters', async () => {
    const { client, requests } = clientWith([responseOf({ body: [] })]);

    await client.requestJson({ ...REQUEST, query: { queue: 420, startTime: undefined } });

    expect(requests[0].url).toBe(`${BASE_URL}/riot/account/v1/accounts?queue=420`);
  });

  it('returns the parsed JSON body', async () => {
    const { client } = clientWith([responseOf({ body: { puuid: 'abc' } })]);

    await expect(client.requestJson(REQUEST)).resolves.toEqual({ puuid: 'abc' });
  });

  it('fails without calling Riot when the API key is not configured', async () => {
    const { client, requests } = clientWith([], { riotApiKey: null });

    await expect(client.requestJson(REQUEST)).rejects.toThrow(RiotApiNotConfiguredError);
    expect(requests).toHaveLength(0);
  });

  describe('rate limiting', () => {
    it('retries honouring Retry-After and then succeeds', async () => {
      const { client, sleeper, requests } = clientWith([
        responseOf({ status: 429, headers: { 'retry-after': '2' } }),
        responseOf({ body: { ok: true } }),
      ]);

      await expect(client.requestJson(REQUEST)).resolves.toEqual({ ok: true });
      expect(requests).toHaveLength(2);
      expect(sleeper.delays).toEqual([2_000]);
    });

    it('falls back to exponential backoff with jitter when Retry-After is missing', async () => {
      const { client, sleeper } = clientWith([
        responseOf({ status: 429 }),
        responseOf({ status: 429 }),
        responseOf({ body: { ok: true } }),
      ]);

      await expect(client.requestJson(REQUEST)).resolves.toEqual({ ok: true });
      // 300 * 2^attempt, scaled by the 0.75 jitter factor of a mocked Math.random of 0.5
      expect(sleeper.delays).toEqual([225, 450]);
    });

    it('gives up after the configured retries', async () => {
      const { client, requests } = clientWith(
        [responseOf({ status: 429 }), responseOf({ status: 429 }), responseOf({ status: 429 })],
        { riot: { requestTimeoutMs: 1_000, maxConcurrency: 2, maxRetries: 2 } },
      );

      await expect(client.requestJson(REQUEST)).rejects.toThrow(RiotRateLimitError);
      expect(requests).toHaveLength(3);
    });

    it('exposes the Retry-After hint on the domain error', async () => {
      const { client } = clientWith(
        [responseOf({ status: 429, headers: { 'retry-after': '7' } })],
        {
          riot: { requestTimeoutMs: 1_000, maxConcurrency: 2, maxRetries: 0 },
        },
      );

      await expect(client.requestJson(REQUEST)).rejects.toMatchObject({
        code: 'RIOT_RATE_LIMITED',
        retryAfterSeconds: 7,
      });
    });
  });

  describe('permanent failures', () => {
    it('does not retry a 404', async () => {
      const { client, requests } = clientWith([responseOf({ status: 404 })]);

      await expect(client.requestJson(REQUEST)).rejects.toThrow(RiotResourceNotFoundError);
      expect(requests).toHaveLength(1);
    });

    it.each([401, 403])('does not retry a %s and reports a credentials problem', async (status) => {
      const { client, requests } = clientWith([responseOf({ status })]);

      await expect(client.requestJson(REQUEST)).rejects.toThrow(RiotAuthenticationError);
      expect(requests).toHaveLength(1);
    });

    it('does not retry other 4xx responses', async () => {
      const { client, requests } = clientWith([responseOf({ status: 400 })]);

      await expect(client.requestJson(REQUEST)).rejects.toThrow(RiotUnexpectedResponseError);
      expect(requests).toHaveLength(1);
    });

    it('reports an unexpected response when the body is not JSON', async () => {
      const { client } = clientWith([responseOf({ status: 200, bodyText: 'not json' })]);

      await expect(client.requestJson(REQUEST)).rejects.toThrow(RiotUnexpectedResponseError);
    });
  });

  describe('transient failures', () => {
    it('retries 5xx responses', async () => {
      const { client, requests, sleeper } = clientWith([
        responseOf({ status: 503 }),
        responseOf({ body: { ok: true } }),
      ]);

      await expect(client.requestJson(REQUEST)).resolves.toEqual({ ok: true });
      expect(requests).toHaveLength(2);
      expect(sleeper.delays).toEqual([225]);
    });

    it('surfaces a Riot outage after exhausting the retries', async () => {
      const { client } = clientWith([responseOf({ status: 500 }), responseOf({ status: 500 })], {
        riot: { requestTimeoutMs: 1_000, maxConcurrency: 2, maxRetries: 1 },
      });

      await expect(client.requestJson(REQUEST)).rejects.toThrow(RiotUnavailableError);
    });

    it.each(['TimeoutError', 'AbortError'] as const)('maps %s to a timeout error', async (name) => {
      const { client } = clientWith([abortError(name)], {
        riot: { requestTimeoutMs: 1_000, maxConcurrency: 2, maxRetries: 0 },
      });

      await expect(client.requestJson(REQUEST)).rejects.toThrow(RiotRequestTimeoutError);
    });

    it('maps network errors to a Riot outage', async () => {
      const { client } = clientWith([new Error('ECONNRESET')], {
        riot: { requestTimeoutMs: 1_000, maxConcurrency: 2, maxRetries: 0 },
      });

      await expect(client.requestJson(REQUEST)).rejects.toThrow(RiotUnavailableError);
    });
  });

  it('never leaks the API key inside the thrown error', async () => {
    const { client } = clientWith(
      [responseOf({ status: 401, bodyText: `key ${API_KEY} invalid` })],
      {
        riot: { requestTimeoutMs: 1_000, maxConcurrency: 2, maxRetries: 0 },
      },
    );

    const failure: unknown = await client.requestJson(REQUEST).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RiotAuthenticationError);
    expect((failure as Error).message).not.toContain('RGAPI-');
    expect(JSON.stringify(failure)).not.toContain('RGAPI-');
  });
});
