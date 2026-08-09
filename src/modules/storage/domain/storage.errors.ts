import { HttpStatus } from '@nestjs/common';

import type { AppErrorCode } from '../../../common/exceptions/app-error-code';
import { DomainException } from '../../../common/exceptions/domain.exception';

/**
 * The storage could not be read or written. Filesystem messages and paths are never
 * propagated to the consumer, only the logical document name.
 */
export class StorageUnavailableError extends DomainException {
  public readonly code: AppErrorCode = 'STORAGE_UNAVAILABLE';
  public readonly httpStatus = HttpStatus.SERVICE_UNAVAILABLE;

  constructor(document: string, operation: string) {
    super(`Storage is unavailable: could not ${operation} document "${document}".`, {
      document,
      operation,
    });
  }
}

/**
 * A stored document exists but does not match the expected schema.
 * Raised explicitly and never repaired by overwriting: valid data must not be lost.
 */
export class CorruptedStorageError extends DomainException {
  public readonly code: AppErrorCode = 'STORAGE_CORRUPTED';
  public readonly httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;

  constructor(document: string, reason: string) {
    super(
      `Stored document "${document}" is corrupted and was left untouched. Fix or remove it manually.`,
      { document, reason },
    );
  }
}

/**
 * A participant identifier that could escape the storage directory reached the adapter.
 * Identifiers are validated at boot, so this only guards against a programming mistake.
 */
export class UnsafeDocumentIdentifierError extends DomainException {
  public readonly code: AppErrorCode = 'INTERNAL_SERVER_ERROR';
  public readonly httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;

  constructor() {
    super('Rejected an unsafe storage document identifier.');
  }
}

export class UnsupportedStorageSchemaError extends DomainException {
  public readonly code: AppErrorCode = 'STORAGE_SCHEMA_UNSUPPORTED';
  public readonly httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;

  constructor(document: string, foundVersion: number, supportedVersion: number) {
    super(
      `Stored document "${document}" uses schema version ${foundVersion}, but this build supports ${supportedVersion}.`,
      { document, foundVersion, supportedVersion },
    );
  }
}
