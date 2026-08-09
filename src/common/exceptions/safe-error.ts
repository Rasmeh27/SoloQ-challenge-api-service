import { DomainException } from './domain.exception';

/** Error shape safe to persist and to expose in administrative reports. */
export interface SafeErrorDescriptor {
  readonly code: string;
  readonly message: string;
}

const UNEXPECTED_ERROR: SafeErrorDescriptor = {
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Unexpected internal error',
};

/**
 * Converts any thrown value into a safe descriptor.
 * Unknown errors are collapsed into a generic entry so filesystem, HTTP client or Riot
 * internals never leak into stored state or API responses.
 */
export function toSafeErrorDescriptor(error: unknown): SafeErrorDescriptor {
  if (error instanceof DomainException) {
    return { code: error.code, message: error.message };
  }

  return UNEXPECTED_ERROR;
}
