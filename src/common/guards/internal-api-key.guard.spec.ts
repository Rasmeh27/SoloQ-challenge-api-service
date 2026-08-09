import type { ExecutionContext } from '@nestjs/common';

import { anAppEnvironment } from '../../test-support/builders';
import {
  AdminApiKeyNotConfiguredError,
  InvalidInternalApiKeyError,
} from '../exceptions/application.exceptions';
import { INTERNAL_API_KEY_HEADER, InternalApiKeyGuard } from './internal-api-key.guard';

const CONFIGURED_KEY = 'a-very-long-administrative-key-value';

function contextWithHeaders(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('InternalApiKeyGuard', () => {
  it('accepts a request carrying the configured key', () => {
    const guard = new InternalApiKeyGuard(
      anAppEnvironment({ adminInternalApiKey: CONFIGURED_KEY }),
    );

    expect(
      guard.canActivate(contextWithHeaders({ [INTERNAL_API_KEY_HEADER]: CONFIGURED_KEY })),
    ).toBe(true);
  });

  it('rejects a request without the header', () => {
    const guard = new InternalApiKeyGuard(
      anAppEnvironment({ adminInternalApiKey: CONFIGURED_KEY }),
    );

    expect(() => guard.canActivate(contextWithHeaders({}))).toThrow(InvalidInternalApiKeyError);
  });

  it('rejects an empty or non string header', () => {
    const guard = new InternalApiKeyGuard(
      anAppEnvironment({ adminInternalApiKey: CONFIGURED_KEY }),
    );

    expect(() => guard.canActivate(contextWithHeaders({ [INTERNAL_API_KEY_HEADER]: '' }))).toThrow(
      InvalidInternalApiKeyError,
    );
    expect(() =>
      guard.canActivate(contextWithHeaders({ [INTERNAL_API_KEY_HEADER]: ['a', 'b'] })),
    ).toThrow(InvalidInternalApiKeyError);
  });

  it('rejects a wrong key, including prefixes of the real one', () => {
    const guard = new InternalApiKeyGuard(
      anAppEnvironment({ adminInternalApiKey: CONFIGURED_KEY }),
    );

    expect(() =>
      guard.canActivate(contextWithHeaders({ [INTERNAL_API_KEY_HEADER]: 'wrong-key' })),
    ).toThrow(InvalidInternalApiKeyError);
    expect(() =>
      guard.canActivate(
        contextWithHeaders({ [INTERNAL_API_KEY_HEADER]: CONFIGURED_KEY.slice(0, -1) }),
      ),
    ).toThrow(InvalidInternalApiKeyError);
  });

  it('fails closed when no administrative key is configured', () => {
    const guard = new InternalApiKeyGuard(anAppEnvironment({ adminInternalApiKey: null }));

    expect(() =>
      guard.canActivate(contextWithHeaders({ [INTERNAL_API_KEY_HEADER]: 'anything' })),
    ).toThrow(AdminApiKeyNotConfiguredError);
  });
});
