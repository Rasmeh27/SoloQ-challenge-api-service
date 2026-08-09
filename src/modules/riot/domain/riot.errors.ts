import { HttpStatus } from '@nestjs/common';

import type { AppErrorCode } from '../../../common/exceptions/app-error-code';
import { DomainException } from '../../../common/exceptions/domain.exception';

/**
 * Explicit Riot integration failures.
 *
 * Riot response bodies are never attached to these errors: they are logged (sanitized)
 * and the consumer only receives a stable code plus a short message.
 */

export class RiotApiNotConfiguredError extends DomainException {
  public readonly code: AppErrorCode = 'RIOT_API_NOT_CONFIGURED';
  public readonly httpStatus = HttpStatus.SERVICE_UNAVAILABLE;

  constructor() {
    super('The Riot API key is not configured, so Riot cannot be queried.');
  }
}

export class RiotAuthenticationError extends DomainException {
  public readonly code: AppErrorCode = 'RIOT_AUTHENTICATION_FAILED';
  public readonly httpStatus = HttpStatus.BAD_GATEWAY;

  constructor(status: number) {
    super('Riot rejected the API key. Check that it is valid and not expired.', { status });
  }
}

export class RiotRateLimitError extends DomainException {
  public readonly code: AppErrorCode = 'RIOT_RATE_LIMITED';
  public readonly httpStatus = HttpStatus.TOO_MANY_REQUESTS;
  public readonly retryAfterSeconds: number | null;

  constructor(retryAfterSeconds: number | null) {
    super('Riot rate limit reached.', { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class RiotAccountNotFoundError extends DomainException {
  public readonly code: AppErrorCode = 'RIOT_ACCOUNT_NOT_FOUND';
  public readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor(riotId: string) {
    super(`Riot ID "${riotId}" does not exist on the requested routing.`, { riotId });
  }
}

export class RiotResourceNotFoundError extends DomainException {
  public readonly code: AppErrorCode = 'RIOT_RESOURCE_NOT_FOUND';
  public readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor(operation: string) {
    super('Riot returned no resource for the request.', { operation });
  }
}

export class RiotUnavailableError extends DomainException {
  public readonly code: AppErrorCode = 'RIOT_UNAVAILABLE';
  public readonly httpStatus = HttpStatus.BAD_GATEWAY;

  constructor(operation: string, status: number | null) {
    super('Riot is temporarily unavailable.', { operation, status });
  }
}

export class RiotRequestTimeoutError extends DomainException {
  public readonly code: AppErrorCode = 'RIOT_REQUEST_TIMEOUT';
  public readonly httpStatus = HttpStatus.GATEWAY_TIMEOUT;

  constructor(operation: string, timeoutMs: number) {
    super('The Riot request timed out.', { operation, timeoutMs });
  }
}

export class RiotUnexpectedResponseError extends DomainException {
  public readonly code: AppErrorCode = 'RIOT_UNEXPECTED_RESPONSE';
  public readonly httpStatus = HttpStatus.BAD_GATEWAY;

  constructor(operation: string, reason: string) {
    super('Riot returned an unexpected response.', { operation, reason });
  }
}

export class UnsupportedPlatformError extends DomainException {
  public readonly code: AppErrorCode = 'UNSUPPORTED_PLATFORM';
  public readonly httpStatus = HttpStatus.BAD_REQUEST;

  constructor(platform: string) {
    super(`Platform "${platform}" is not supported.`, { platform });
  }
}
