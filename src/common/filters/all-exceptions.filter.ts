import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { environmentConfig } from '../../config/environment.config';
import type { AppEnvironment } from '../../config/environment.config';
import type { ErrorResponseDto } from '../dto/error-response.dto';
import { type AppErrorCode, errorCodeForHttpStatus } from '../exceptions/app-error-code';
import { DomainException, type ErrorDetails } from '../exceptions/domain.exception';
import type { RequestWithContext } from '../http/request-context';
import { sanitizeText, sanitizeUrl } from '../logging/log-sanitizer';
import { CLOCK, type Clock } from '../time/clock';
import { toIsoDateTime } from '../time/iso-date-time';

const GENERIC_INTERNAL_MESSAGE = 'Unexpected internal error';
const GENERIC_REQUEST_MESSAGE = 'Request could not be processed';
const VALIDATION_MESSAGE = 'Request validation failed';
const MIN_HTTP_ERROR_STATUS = 400;
const MAX_HTTP_ERROR_STATUS = 599;
const SERVER_ERROR_STATUS_THRESHOLD = 500;

interface ResolvedError {
  readonly statusCode: number;
  readonly code: AppErrorCode;
  readonly message: string;
  readonly details: ErrorDetails;
}

function extractStatusLikeProperty(exception: unknown): number | null {
  if (exception === null || typeof exception !== 'object') {
    return null;
  }

  const candidate = exception as { status?: unknown; statusCode?: unknown };
  const status = typeof candidate.status === 'number' ? candidate.status : candidate.statusCode;

  if (
    typeof status === 'number' &&
    status >= MIN_HTTP_ERROR_STATUS &&
    status <= MAX_HTTP_ERROR_STATUS
  ) {
    return status;
  }

  return null;
}

function resolveHttpException(exception: HttpException): ResolvedError {
  const statusCode = exception.getStatus();
  const payload = exception.getResponse();

  if (statusCode >= SERVER_ERROR_STATUS_THRESHOLD) {
    return {
      statusCode,
      code: errorCodeForHttpStatus(statusCode),
      message: GENERIC_INTERNAL_MESSAGE,
      details: null,
    };
  }

  if (typeof payload === 'string') {
    return {
      statusCode,
      code: errorCodeForHttpStatus(statusCode),
      message: payload,
      details: null,
    };
  }

  const rawMessage = (payload as { message?: unknown }).message;

  if (Array.isArray(rawMessage)) {
    return {
      statusCode,
      code: 'VALIDATION_FAILED',
      message: VALIDATION_MESSAGE,
      details: { issues: rawMessage.map((issue) => String(issue)) },
    };
  }

  return {
    statusCode,
    code: errorCodeForHttpStatus(statusCode),
    message: typeof rawMessage === 'string' ? rawMessage : GENERIC_REQUEST_MESSAGE,
    details: null,
  };
}

/**
 * Global exception filter.
 *
 * Expected business errors (`DomainException`) keep their code and status, framework
 * errors are mapped to the same contract, and anything unknown becomes a generic 500.
 * Stack traces and third party payloads (fs, Riot, HTTP client) are logged, never returned.
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    @Inject(environmentConfig.KEY) private readonly environment: AppEnvironment,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<RequestWithContext>();
    const response = httpContext.getResponse<Response>();
    const resolved = this.resolve(exception);

    const body: ErrorResponseDto = {
      statusCode: resolved.statusCode,
      code: resolved.code,
      message: sanitizeText(resolved.message),
      details: resolved.details,
      timestamp: toIsoDateTime(this.clock.now()),
      path: request.originalUrl ?? request.url ?? null,
      requestId: request.requestId ?? null,
    };

    this.logFailure(request, body, exception);

    response.status(resolved.statusCode).json(body);
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof DomainException) {
      return {
        statusCode: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      return resolveHttpException(exception);
    }

    const statusLike = extractStatusLikeProperty(exception);

    if (statusLike !== null) {
      return {
        statusCode: statusLike,
        code: errorCodeForHttpStatus(statusLike),
        message:
          statusLike >= SERVER_ERROR_STATUS_THRESHOLD
            ? GENERIC_INTERNAL_MESSAGE
            : GENERIC_REQUEST_MESSAGE,
        details: null,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: GENERIC_INTERNAL_MESSAGE,
      details: null,
    };
  }

  private logFailure(
    request: RequestWithContext,
    body: ErrorResponseDto,
    exception: unknown,
  ): void {
    const summary =
      `${request.method} ${sanitizeUrl(request.originalUrl ?? request.url)} -> ` +
      `${body.statusCode} ${body.code} [requestId=${body.requestId ?? 'none'}]`;

    if (body.statusCode >= SERVER_ERROR_STATUS_THRESHOLD) {
      const stack = exception instanceof Error ? sanitizeText(exception.stack ?? '') : undefined;
      this.logger.error(summary, this.environment.isProduction ? undefined : stack);
      return;
    }

    this.logger.warn(summary);
  }
}
