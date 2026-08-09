import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

const MAX_INCOMING_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID_PATTERN = /^[\w.:-]+$/;

export interface RequestWithContext extends Request {
  requestId?: string;
}

function resolveRequestId(incoming: unknown): string {
  if (
    typeof incoming === 'string' &&
    incoming.length > 0 &&
    incoming.length <= MAX_INCOMING_REQUEST_ID_LENGTH &&
    SAFE_REQUEST_ID_PATTERN.test(incoming)
  ) {
    return incoming;
  }

  return randomUUID();
}

/**
 * Attaches a request id to every request and echoes it back.
 * Registered with `app.use` so it also runs for requests rejected by guards,
 * whose error responses must still carry the identifier.
 */
export function requestIdMiddleware(
  request: RequestWithContext,
  response: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);

  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
