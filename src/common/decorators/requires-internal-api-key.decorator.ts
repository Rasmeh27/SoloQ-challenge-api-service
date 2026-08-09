import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ErrorResponseDto } from '../dto/error-response.dto';
import {
  INTERNAL_API_KEY_HEADER,
  INTERNAL_API_KEY_SECURITY_SCHEME,
  InternalApiKeyGuard,
} from '../guards/internal-api-key.guard';

/**
 * Applies the administrative guard and documents it in Swagger.
 * The key itself is never part of the documentation, only its header name.
 */
export function RequiresInternalApiKey(): ClassDecorator & MethodDecorator {
  return applyDecorators(
    UseGuards(InternalApiKeyGuard),
    ApiSecurity(INTERNAL_API_KEY_SECURITY_SCHEME),
    ApiUnauthorizedResponse({
      description: `Missing or invalid \`${INTERNAL_API_KEY_HEADER}\` header.`,
      type: ErrorResponseDto,
    }),
    ApiServiceUnavailableResponse({
      description: 'Administrative endpoints are disabled because no administrative key is set.',
      type: ErrorResponseDto,
    }),
  );
}
