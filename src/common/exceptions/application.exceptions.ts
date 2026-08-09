import { HttpStatus } from '@nestjs/common';

import type { AppErrorCode } from './app-error-code';
import { DomainException } from './domain.exception';

export class ChallengeAlreadyInitializedError extends DomainException {
  public readonly code: AppErrorCode = 'CHALLENGE_ALREADY_INITIALIZED';
  public readonly httpStatus = HttpStatus.CONFLICT;

  constructor(challengeId: string) {
    super(
      'The challenge is already initialized. Baseline ranks are captured once and are never replaced.',
      { challengeId },
    );
  }
}

export class ChallengeNotInitializedError extends DomainException {
  public readonly code: AppErrorCode = 'CHALLENGE_NOT_INITIALIZED';
  public readonly httpStatus = HttpStatus.CONFLICT;

  constructor(challengeId: string) {
    super('The challenge is not initialized yet. Run the administrative initialization first.', {
      challengeId,
    });
  }
}

/**
 * The challenge started long before this initialization attempt.
 *
 * Baselines can only be captured now, so everything played between `startAt` and the
 * capture is invisible to the challenge and cannot be reconstructed. The administrator has
 * to acknowledge that explicitly instead of silently producing a misleading ranking.
 */
export class LateBaselineCaptureError extends DomainException {
  public readonly code: AppErrorCode = 'CHALLENGE_LATE_BASELINE_CAPTURE';
  public readonly httpStatus = HttpStatus.CONFLICT;

  constructor(details: {
    challengeStartAt: string;
    attemptedAt: string;
    elapsedHours: number;
    graceHours: number;
  }) {
    super(
      `The challenge started ${details.elapsedHours}h ago, beyond the ${details.graceHours}h grace period. ` +
        'Baselines are captured now, so progress before this instant cannot be measured. ' +
        'Retry with "acknowledgeLateBaseline": true to accept it, or correct startAt.',
      { ...details },
    );
  }
}

export class ParticipantNotFoundError extends DomainException {
  public readonly code: AppErrorCode = 'PARTICIPANT_NOT_FOUND';
  public readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor(participantId: string) {
    super('Participant was not found', { participantId });
  }
}

export class ParticipantNotInitializedError extends DomainException {
  public readonly code: AppErrorCode = 'PARTICIPANT_NOT_INITIALIZED';
  public readonly httpStatus = HttpStatus.CONFLICT;

  constructor(participantId: string) {
    super(
      'Participant has no baseline yet. It was added after the challenge was initialized and is pending initialization.',
      { participantId },
    );
  }
}

export class SynchronizationAlreadyRunningError extends DomainException {
  public readonly code: AppErrorCode = 'SYNCHRONIZATION_ALREADY_RUNNING';
  public readonly httpStatus = HttpStatus.CONFLICT;

  constructor() {
    super('A synchronization is already in progress.');
  }
}

export class InvalidInternalApiKeyError extends DomainException {
  public readonly code: AppErrorCode = 'INVALID_INTERNAL_API_KEY';
  public readonly httpStatus = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('A valid administrative API key is required.');
  }
}

export class AdminApiKeyNotConfiguredError extends DomainException {
  public readonly code: AppErrorCode = 'ADMIN_API_KEY_NOT_CONFIGURED';
  public readonly httpStatus = HttpStatus.SERVICE_UNAVAILABLE;

  constructor() {
    super('Administrative endpoints are disabled because no administrative API key is configured.');
  }
}
