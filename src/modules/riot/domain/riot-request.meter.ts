import { Injectable } from '@nestjs/common';

/** Requests actually sent to Riot, grouped by endpoint operation. */
export interface RiotRequestCounters {
  readonly total: number;
  readonly byOperation: Readonly<Record<string, number>>;
}

export type RiotRequestSnapshot = Readonly<Record<string, number>>;

/**
 * Counts the requests sent to Riot, per endpoint operation.
 *
 * Every HTTP attempt is counted, retries included, because that is what consumes the rate
 * limit budget. Counters are process wide; callers take a snapshot before and after a unit
 * of work and report the difference. They are administrative information only and are never
 * exposed through public endpoints.
 */
@Injectable()
export class RiotRequestMeter {
  private readonly counters = new Map<string, number>();

  public record(operation: string): void {
    this.counters.set(operation, (this.counters.get(operation) ?? 0) + 1);
  }

  public snapshot(): RiotRequestSnapshot {
    return Object.fromEntries(this.counters);
  }
}

/** Difference between two snapshots, keeping only the operations that were used. */
export function countersSince(
  before: RiotRequestSnapshot,
  after: RiotRequestSnapshot,
): RiotRequestCounters {
  const byOperation: Record<string, number> = {};
  let total = 0;

  for (const [operation, count] of Object.entries(after)) {
    const delta = count - (before[operation] ?? 0);

    if (delta > 0) {
      byOperation[operation] = delta;
      total += delta;
    }
  }

  return { total, byOperation };
}
