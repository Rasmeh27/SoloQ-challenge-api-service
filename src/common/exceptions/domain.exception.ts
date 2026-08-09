import type { AppErrorCode } from './app-error-code';

export type ErrorDetails = Record<string, unknown> | null;

/**
 * Base class for every expected (business) error of the application.
 *
 * Carrying `code` and `httpStatus` in the domain keeps controllers free of error
 * translation logic: the global exception filter maps any `DomainException` to the
 * public error contract, while unknown errors become a generic 500.
 */
export abstract class DomainException extends Error {
  public abstract readonly code: AppErrorCode;
  public abstract readonly httpStatus: number;
  public readonly details: ErrorDetails;

  constructor(message: string, details: ErrorDetails = null) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }
}
