import { ApiProperty } from '@nestjs/swagger';

import { HEALTH_STATUSES, type HealthStatus } from '../../application/get-health-status.use-case';

export class HealthResponseDto {
  @ApiProperty({ enum: [...HEALTH_STATUSES], example: 'ok' })
  public readonly status!: string;

  @ApiProperty({ example: '2026-08-06T12:00:00.000Z' })
  public readonly timestamp!: string;

  @ApiProperty({ example: 1_284, description: 'Process uptime in seconds.' })
  public readonly uptime!: number;

  @ApiProperty({ example: 'development' })
  public readonly environment!: string;

  @ApiProperty({ example: true, description: 'Whether the JSON data directory is writable.' })
  public readonly storageWritable!: boolean;

  @ApiProperty({ example: true })
  public readonly challengeInitialized!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether RIOT_API_KEY is present. The key itself is never exposed.',
  })
  public readonly riotApiConfigured!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether ADMIN_INTERNAL_API_KEY is present. The key itself is never exposed.',
  })
  public readonly adminApiConfigured!: boolean;

  @ApiProperty({ example: true })
  public readonly scheduledSynchronizationEnabled!: boolean;

  public static from(health: HealthStatus): HealthResponseDto {
    return {
      status: health.status,
      timestamp: health.timestamp,
      uptime: health.uptimeSeconds,
      environment: health.environment,
      storageWritable: health.storageWritable,
      challengeInitialized: health.challengeInitialized,
      riotApiConfigured: health.riotApiConfigured,
      adminApiConfigured: health.adminApiConfigured,
      scheduledSynchronizationEnabled: health.scheduledSynchronizationEnabled,
    };
  }
}
