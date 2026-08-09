import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { environmentConfig } from '../../config/environment.config';
import type { AppEnvironment } from '../../config/environment.config';
import {
  AdminApiKeyNotConfiguredError,
  InvalidInternalApiKeyError,
} from '../exceptions/application.exceptions';
import type { RequestWithContext } from '../http/request-context';
import { secureCompare } from '../utils/secure-compare';

export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';
export const INTERNAL_API_KEY_SECURITY_SCHEME = 'internal-api-key';

/**
 * Protects the administrative endpoints.
 *
 * Fails closed: when no administrative key is configured every administrative request
 * is rejected instead of being allowed through. The comparison is constant time and the
 * provided value is never logged.
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(@Inject(environmentConfig.KEY) private readonly environment: AppEnvironment) {}

  public canActivate(context: ExecutionContext): boolean {
    const configuredKey = this.environment.adminInternalApiKey;

    if (configuredKey === null) {
      throw new AdminApiKeyNotConfiguredError();
    }

    const providedKey = context.switchToHttp().getRequest<RequestWithContext>().headers[
      INTERNAL_API_KEY_HEADER
    ];

    if (typeof providedKey !== 'string' || providedKey.length === 0) {
      throw new InvalidInternalApiKeyError();
    }

    if (!secureCompare(providedKey, configuredKey)) {
      throw new InvalidInternalApiKeyError();
    }

    return true;
  }
}
