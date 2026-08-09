import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';

import type { RequestWithContext } from '../http/request-context';
import { sanitizeUrl } from '../logging/log-sanitizer';

const NANOSECONDS_PER_MILLISECOND = 1_000_000;
const DURATION_DECIMALS = 1;

/**
 * Logs one line per successfully handled request.
 * Failed requests are logged by the global exception filter, so there is no double logging.
 * Request headers and bodies are never logged.
 */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Http');

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          const elapsedMs =
            Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_MILLISECOND;

          this.logger.log(
            `${request.method} ${sanitizeUrl(request.originalUrl ?? request.url)} -> ` +
              `${response.statusCode} ${elapsedMs.toFixed(DURATION_DECIMALS)}ms ` +
              `[requestId=${request.requestId ?? 'none'}]`,
          );
        },
      }),
    );
  }
}
