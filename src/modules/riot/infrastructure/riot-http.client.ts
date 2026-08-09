import { Inject, Injectable, Logger } from '@nestjs/common';

import { sanitizeText } from '../../../common/logging/log-sanitizer';
import { MILLISECONDS_PER_SECOND } from '../../../common/time/time.constants';
import { Semaphore } from '../../../common/utils/semaphore';
import { SLEEPER, type Sleeper } from '../../../common/utils/sleeper';
import { type AppEnvironment, environmentConfig } from '../../../config/environment.config';
import { RIOT_API_KEY_HEADER } from '../../../config/riot.constants';
import { RiotRequestMeter } from '../domain/riot-request.meter';
import {
  RiotApiNotConfiguredError,
  RiotAuthenticationError,
  RiotRateLimitError,
  RiotRequestTimeoutError,
  RiotResourceNotFoundError,
  RiotUnavailableError,
  RiotUnexpectedResponseError,
} from '../domain/riot.errors';

const BASE_BACKOFF_MS = 300;
const MAX_BACKOFF_MS = 5_000;
const MAX_HONORED_RETRY_AFTER_MS = 30_000;
const JITTER_FLOOR = 0.5;
const ERROR_BODY_PREVIEW_LENGTH = 200;
const CLIENT_ERROR_STATUS = 400;
const SERVER_ERROR_STATUS = 500;
const UNAUTHORIZED_STATUS = 401;
const FORBIDDEN_STATUS = 403;
const NOT_FOUND_STATUS = 404;
const TOO_MANY_REQUESTS_STATUS = 429;
const RETRY_AFTER_HEADER = 'retry-after';

/** Minimal HTTP surface, so the transport can be replaced in tests without DOM typings. */
export interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface HttpRequestInit {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly signal: AbortSignal;
}

export type FetchFunction = (url: string, init: HttpRequestInit) => Promise<HttpResponseLike>;

export const HTTP_FETCH = Symbol('HttpFetch');

export interface RiotHttpRequest {
  readonly baseUrl: string;
  readonly path: string;
  readonly operation: string;
  readonly query?: Readonly<Record<string, string | number | undefined>>;
}

function parseRetryAfterSeconds(response: HttpResponseLike): number | null {
  const rawValue = response.headers.get(RETRY_AFTER_HEADER);

  if (rawValue === null) {
    return null;
  }

  const seconds = Number.parseInt(rawValue, 10);

  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/**
 * Riot HTTP transport: timeout, bounded retries with exponential backoff and jitter,
 * 429 handling honouring `Retry-After`, and a global concurrency cap.
 *
 * The API key travels only in the `X-Riot-Token` header, never in the URL, and is never
 * logged nor attached to an error.
 */
@Injectable()
export class RiotHttpClient {
  private readonly logger = new Logger(RiotHttpClient.name);
  private readonly concurrencyLimiter: Semaphore;

  constructor(
    @Inject(environmentConfig.KEY) private readonly environment: AppEnvironment,
    @Inject(SLEEPER) private readonly sleeper: Sleeper,
    @Inject(HTTP_FETCH) private readonly fetchFunction: FetchFunction,
    private readonly requestMeter: RiotRequestMeter,
  ) {
    this.concurrencyLimiter = new Semaphore(environment.riot.maxConcurrency);
  }

  public async requestJson(request: RiotHttpRequest): Promise<unknown> {
    const maxRetries = this.environment.riot.maxRetries;

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.concurrencyLimiter.runExclusive(() => this.performRequest(request));
      } catch (error) {
        if (attempt >= maxRetries || !this.isRetryable(error)) {
          throw error;
        }

        const delayMs = this.retryDelayMs(error, attempt);

        this.logger.debug(
          `Retrying Riot ${request.operation} in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
        );

        await this.sleeper.sleep(delayMs);
      }
    }
  }

  private async performRequest(request: RiotHttpRequest): Promise<unknown> {
    const apiKey = this.environment.riotApiKey;

    if (apiKey === null) {
      throw new RiotApiNotConfiguredError();
    }

    const timeoutMs = this.environment.riot.requestTimeoutMs;
    let response: HttpResponseLike;

    // Counted before sending: retries consume rate limit budget too.
    this.requestMeter.record(request.operation);

    try {
      response = await this.fetchFunction(this.buildUrl(request), {
        method: 'GET',
        headers: { [RIOT_API_KEY_HEADER]: apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw new RiotRequestTimeoutError(request.operation, timeoutMs);
      }

      throw new RiotUnavailableError(request.operation, null);
    }

    if (response.ok) {
      return this.readJson(response, request.operation);
    }

    await this.logFailedResponse(response, request.operation);

    throw this.toDomainError(response, request.operation);
  }

  private buildUrl(request: RiotHttpRequest): string {
    const url = new URL(`${request.baseUrl}${request.path}`);

    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private async readJson(response: HttpResponseLike, operation: string): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new RiotUnexpectedResponseError(operation, 'response body is not valid JSON');
    }
  }

  private toDomainError(response: HttpResponseLike, operation: string): Error {
    if (response.status === UNAUTHORIZED_STATUS || response.status === FORBIDDEN_STATUS) {
      return new RiotAuthenticationError(response.status);
    }

    if (response.status === NOT_FOUND_STATUS) {
      return new RiotResourceNotFoundError(operation);
    }

    if (response.status === TOO_MANY_REQUESTS_STATUS) {
      return new RiotRateLimitError(parseRetryAfterSeconds(response));
    }

    if (response.status >= SERVER_ERROR_STATUS) {
      return new RiotUnavailableError(operation, response.status);
    }

    if (response.status >= CLIENT_ERROR_STATUS) {
      return new RiotUnexpectedResponseError(operation, `unexpected status ${response.status}`);
    }

    return new RiotUnexpectedResponseError(operation, `unhandled status ${response.status}`);
  }

  /** 4xx responses are permanent, except 429. Timeouts and 5xx are worth retrying. */
  private isRetryable(error: unknown): boolean {
    return (
      error instanceof RiotRateLimitError ||
      error instanceof RiotUnavailableError ||
      error instanceof RiotRequestTimeoutError
    );
  }

  private retryDelayMs(error: unknown, attempt: number): number {
    if (error instanceof RiotRateLimitError && error.retryAfterSeconds !== null) {
      return Math.min(
        error.retryAfterSeconds * MILLISECONDS_PER_SECOND,
        MAX_HONORED_RETRY_AFTER_MS,
      );
    }

    const exponentialDelay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
    const jitterFactor = JITTER_FLOOR + Math.random() * (1 - JITTER_FLOOR);

    return Math.round(exponentialDelay * jitterFactor);
  }

  private async logFailedResponse(response: HttpResponseLike, operation: string): Promise<void> {
    let preview = '';

    try {
      preview = (await response.text()).slice(0, ERROR_BODY_PREVIEW_LENGTH);
    } catch {
      preview = '<unreadable body>';
    }

    // Sanitized and debug only: Riot payloads never reach the API consumer.
    this.logger.debug(`Riot ${operation} failed with ${response.status}: ${sanitizeText(preview)}`);
  }
}
