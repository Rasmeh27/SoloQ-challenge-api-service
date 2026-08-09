import type { IsoDateTime } from '../../../common/time/iso-date-time';
import { epochMillisecondsOf } from '../../../common/time/iso-date-time';
import { MILLISECONDS_PER_MINUTE } from '../../../common/time/time.constants';

export const DATA_FRESHNESS_VALUES = ['FRESH', 'STALE', 'NEVER_SYNCED'] as const;

export type DataFreshness = (typeof DATA_FRESHNESS_VALUES)[number];

/**
 * Data is considered stale after this many synchronization intervals without a
 * successful update. Public endpoints keep serving the last valid state and mark it as
 * stale instead of failing when Riot is unavailable.
 */
export const STALE_SYNC_INTERVAL_MULTIPLIER = 3;

export function resolveDataFreshness(
  lastSuccessfulSyncAt: IsoDateTime | null,
  now: Date,
  syncIntervalMinutes: number,
): DataFreshness {
  if (lastSuccessfulSyncAt === null) {
    return 'NEVER_SYNCED';
  }

  const staleAfterMs =
    syncIntervalMinutes * STALE_SYNC_INTERVAL_MULTIPLIER * MILLISECONDS_PER_MINUTE;
  const elapsedMs = now.getTime() - epochMillisecondsOf(lastSuccessfulSyncAt);

  return elapsedMs > staleAfterMs ? 'STALE' : 'FRESH';
}
