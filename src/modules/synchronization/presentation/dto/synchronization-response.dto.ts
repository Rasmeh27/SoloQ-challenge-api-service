import { ApiProperty } from '@nestjs/swagger';

import { SYNC_STATUSES } from '../../../challenge/domain/sync-status';
import type { RiotRequestCounters } from '../../../riot/domain/riot-request.meter';
import type {
  GlobalSynchronizationReport,
  ParticipantSynchronizationReport,
  ParticipantSynchronizationResult,
} from '../../domain/synchronization.report';
import type { SynchronizationStatus } from '../../application/synchronization.orchestrator';

/**
 * Riot requests consumed by a run, per endpoint operation.
 * Administrative only: it is never part of a public response.
 */
export class RiotRequestCountersDto {
  @ApiProperty({ example: 14, description: 'HTTP requests sent to Riot, retries included.' })
  public readonly total!: number;

  @ApiProperty({
    type: Object,
    example: {
      'league-v4:entries-by-puuid': 2,
      'match-v5:ids': 2,
      'match-v5:by-id': 10,
    },
    description: 'Requests per Riot endpoint operation.',
  })
  public readonly byOperation!: Record<string, number>;

  public static from(counters: RiotRequestCounters): RiotRequestCountersDto {
    return { total: counters.total, byOperation: { ...counters.byOperation } };
  }
}

export class SynchronizationErrorDto {
  @ApiProperty({ example: 'player-two' })
  public readonly participantId!: string;

  @ApiProperty({ example: 'RIOT_RATE_LIMITED' })
  public readonly code!: string;

  @ApiProperty({ example: 'Riot rate limit reached.' })
  public readonly message!: string;
}

export class ParticipantSynchronizationReportDto {
  @ApiProperty({ example: 'player-one' })
  public readonly participantId!: string;

  @ApiProperty({ example: 'PlayerOne#LAN' })
  public readonly riotId!: string;

  @ApiProperty({
    enum: [...SYNC_STATUSES],
    example: 'SUCCESS',
    description: 'PENDING_INITIALIZATION means the participant has no baseline yet.',
  })
  public readonly status!: string;

  @ApiProperty({ example: 3 })
  public readonly newMatchesProcessed!: number;

  @ApiProperty({ example: true })
  public readonly rankUpdated!: boolean;

  @ApiProperty({ example: true })
  public readonly snapshotCaptured!: boolean;

  @ApiProperty({ nullable: true, type: Object, example: null })
  public readonly error!: { code: string; message: string } | null;

  public static from(
    report: ParticipantSynchronizationReport,
  ): ParticipantSynchronizationReportDto {
    return {
      participantId: report.participantId,
      riotId: report.riotId,
      status: report.status,
      newMatchesProcessed: report.newMatchesProcessed,
      rankUpdated: report.rankUpdated,
      snapshotCaptured: report.snapshotCaptured,
      error:
        report.error === null ? null : { code: report.error.code, message: report.error.message },
    };
  }
}

export class GlobalSynchronizationReportDto {
  @ApiProperty({ example: '2026-08-06T12:00:00.000Z' })
  public readonly startedAt!: string;

  @ApiProperty({ example: '2026-08-06T12:00:04.512Z' })
  public readonly finishedAt!: string;

  @ApiProperty({ example: 4_512 })
  public readonly durationMs!: number;

  @ApiProperty({ example: 10 })
  public readonly totalParticipants!: number;

  @ApiProperty({ example: 9 })
  public readonly successfulParticipants!: number;

  @ApiProperty({ example: 1 })
  public readonly failedParticipants!: number;

  @ApiProperty({ example: 0, description: 'Participants pending initialization.' })
  public readonly skippedParticipants!: number;

  @ApiProperty({ example: 12 })
  public readonly newMatchesProcessed!: number;

  @ApiProperty({ type: RiotRequestCountersDto })
  public readonly riotRequests!: RiotRequestCountersDto;

  @ApiProperty({ type: [SynchronizationErrorDto] })
  public readonly errors!: SynchronizationErrorDto[];

  @ApiProperty({ type: [ParticipantSynchronizationReportDto] })
  public readonly participants!: ParticipantSynchronizationReportDto[];

  public static from(report: GlobalSynchronizationReport): GlobalSynchronizationReportDto {
    return {
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      durationMs: report.durationMs,
      totalParticipants: report.totalParticipants,
      successfulParticipants: report.successfulParticipants,
      failedParticipants: report.failedParticipants,
      skippedParticipants: report.skippedParticipants,
      newMatchesProcessed: report.newMatchesProcessed,
      riotRequests: RiotRequestCountersDto.from(report.riotRequests),
      errors: report.errors.map((error) => ({
        participantId: error.participantId,
        code: error.code,
        message: error.message,
      })),
      participants: report.participants.map((participant) =>
        ParticipantSynchronizationReportDto.from(participant),
      ),
    };
  }
}

/** Response of the single participant run: the report plus its attributable Riot budget. */
export class ParticipantSynchronizationResponseDto {
  @ApiProperty({ type: ParticipantSynchronizationReportDto })
  public readonly participant!: ParticipantSynchronizationReportDto;

  @ApiProperty({ type: RiotRequestCountersDto })
  public readonly riotRequests!: RiotRequestCountersDto;

  public static from(
    result: ParticipantSynchronizationResult,
  ): ParticipantSynchronizationResponseDto {
    return {
      participant: ParticipantSynchronizationReportDto.from(result.participant),
      riotRequests: RiotRequestCountersDto.from(result.riotRequests),
    };
  }
}

export class SynchronizationStatusDto {
  @ApiProperty({ example: true })
  public readonly challengeInitialized!: boolean;

  @ApiProperty({ example: false })
  public readonly inProgress!: boolean;

  @ApiProperty({ example: true })
  public readonly scheduledSynchronizationEnabled!: boolean;

  @ApiProperty({ example: 5 })
  public readonly syncIntervalMinutes!: number;

  @ApiProperty({ nullable: true, example: '2026-08-06T12:00:00.000Z' })
  public readonly lastGlobalSyncAt!: string | null;

  @ApiProperty({ nullable: true, example: '2026-08-06T12:00:00.000Z' })
  public readonly lastSuccessfulGlobalSyncAt!: string | null;

  @ApiProperty({
    type: GlobalSynchronizationReportDto,
    nullable: true,
    description: 'Report of the last run executed by this process.',
  })
  public readonly lastReport!: GlobalSynchronizationReportDto | null;

  public static from(status: SynchronizationStatus): SynchronizationStatusDto {
    return {
      challengeInitialized: status.challengeInitialized,
      inProgress: status.inProgress,
      scheduledSynchronizationEnabled: status.scheduledSynchronizationEnabled,
      syncIntervalMinutes: status.syncIntervalMinutes,
      lastGlobalSyncAt: status.lastGlobalSyncAt,
      lastSuccessfulGlobalSyncAt: status.lastSuccessfulGlobalSyncAt,
      lastReport:
        status.lastReport === null ? null : GlobalSynchronizationReportDto.from(status.lastReport),
    };
  }
}
