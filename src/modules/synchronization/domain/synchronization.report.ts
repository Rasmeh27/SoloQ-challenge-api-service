import type { SafeErrorDescriptor } from '../../../common/exceptions/safe-error';
import type { IsoDateTime } from '../../../common/time/iso-date-time';
import type { SyncStatus } from '../../challenge/domain/sync-status';
import type { RiotRequestCounters } from '../../riot/domain/riot-request.meter';

export interface ParticipantSynchronizationReport {
  readonly participantId: string;
  readonly riotId: string;
  readonly status: SyncStatus;
  readonly newMatchesProcessed: number;
  readonly rankUpdated: boolean;
  readonly snapshotCaptured: boolean;
  readonly error: SafeErrorDescriptor | null;
}

/** Result of an isolated single participant run, where the counters are attributable. */
export interface ParticipantSynchronizationResult {
  readonly participant: ParticipantSynchronizationReport;
  readonly riotRequests: RiotRequestCounters;
}

export interface SynchronizationErrorSummary {
  readonly participantId: string;
  readonly code: string;
  readonly message: string;
}

export interface GlobalSynchronizationReport {
  readonly startedAt: IsoDateTime;
  readonly finishedAt: IsoDateTime;
  readonly durationMs: number;
  readonly totalParticipants: number;
  readonly successfulParticipants: number;
  readonly failedParticipants: number;
  /** Participants without a baseline, pending initialization. */
  readonly skippedParticipants: number;
  readonly newMatchesProcessed: number;
  /** Riot requests consumed by this run, per endpoint. Administrative information only. */
  readonly riotRequests: RiotRequestCounters;
  readonly errors: readonly SynchronizationErrorSummary[];
  readonly participants: readonly ParticipantSynchronizationReport[];
}

export function buildGlobalSynchronizationReport(
  startedAt: Date,
  finishedAt: Date,
  reports: readonly ParticipantSynchronizationReport[],
  riotRequests: RiotRequestCounters,
): GlobalSynchronizationReport {
  const failed = reports.filter((report) => report.status === 'FAILED');
  const skipped = reports.filter((report) => report.status === 'PENDING_INITIALIZATION');

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    totalParticipants: reports.length,
    successfulParticipants: reports.filter(
      (report) => report.status === 'SUCCESS' || report.status === 'PARTIAL',
    ).length,
    failedParticipants: failed.length,
    skippedParticipants: skipped.length,
    newMatchesProcessed: reports.reduce((total, report) => total + report.newMatchesProcessed, 0),
    riotRequests,
    errors: failed.map((report) => ({
      participantId: report.participantId,
      code: report.error?.code ?? 'INTERNAL_SERVER_ERROR',
      message: report.error?.message ?? 'Unexpected internal error',
    })),
    participants: reports,
  };
}
