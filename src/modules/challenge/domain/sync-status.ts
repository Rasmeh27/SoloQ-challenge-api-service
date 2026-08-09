/** Statuses that are actually written to storage. */
export const PERSISTED_SYNC_STATUSES = [
  'NEVER_SYNCED',
  'PENDING',
  'SYNCING',
  'SUCCESS',
  'PARTIAL',
  'FAILED',
] as const;

export type PersistedSyncStatus = (typeof PERSISTED_SYNC_STATUSES)[number];

/**
 * Statuses exposed by the API. `STALE` and `PENDING_INITIALIZATION` are derived when
 * reading (from the last successful sync and from the absence of a baseline), never
 * persisted, so stored data can not contradict reality.
 */
export const SYNC_STATUSES = [
  ...PERSISTED_SYNC_STATUSES,
  'STALE',
  'PENDING_INITIALIZATION',
] as const;

export type SyncStatus = (typeof SYNC_STATUSES)[number];
