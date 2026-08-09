import { ApiProperty } from '@nestjs/swagger';

/** Consistent error contract returned by every endpoint. */
export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  public readonly statusCode!: number;

  @ApiProperty({
    example: 'PARTICIPANT_NOT_FOUND',
    description: 'Stable machine readable error code.',
  })
  public readonly code!: string;

  @ApiProperty({ example: 'Participant was not found' })
  public readonly message!: string;

  @ApiProperty({
    nullable: true,
    type: Object,
    example: { participantId: 'example-player' },
    description: 'Additional safe context. Never contains internal or Riot payloads.',
  })
  public readonly details!: Record<string, unknown> | null;

  @ApiProperty({ example: '2026-08-06T12:00:00.000Z' })
  public readonly timestamp!: string;

  @ApiProperty({ example: '/api/v1/participants/example-player' })
  public readonly path!: string | null;

  @ApiProperty({ example: '6f1c8f36-6c1e-4f2a-9d9f-6a1b2c3d4e5f', nullable: true })
  public readonly requestId!: string | null;
}
