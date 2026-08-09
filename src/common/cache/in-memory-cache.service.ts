import { Inject, Injectable, Logger } from '@nestjs/common';

import { environmentConfig } from '../../config/environment.config';
import type { AppEnvironment } from '../../config/environment.config';
import { CLOCK, type Clock } from '../time/clock';
import { MILLISECONDS_PER_SECOND } from '../time/time.constants';

/** Keys of the aggregated read models kept in this cache. */
export const CACHE_KEYS = {
  leaderboard: 'read-model:leaderboard',
  challengeSummary: 'read-model:challenge-summary',
  participantsOverview: 'read-model:participants-overview',
  participantProfile: (participantId: string): string =>
    `read-model:participant-profile:${participantId}`,
} as const;

interface CacheEntry<T> {
  readonly value: Promise<T>;
  readonly expiresAtMs: number;
}

/**
 * Process local cache for expensive aggregated read models (challenge summary,
 * leaderboard, participant summaries).
 *
 * It is never the source of truth: the JSON repository is. Entries are dropped after a
 * successful synchronization and a TTL of `0` disables caching entirely.
 */
@Injectable()
export class InMemoryCacheService {
  private readonly logger = new Logger(InMemoryCacheService.name);
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(environmentConfig.KEY) private readonly environment: AppEnvironment,
  ) {}

  public get defaultTtlSeconds(): number {
    return this.environment.publicCacheTtlSeconds;
  }

  public async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number = this.defaultTtlSeconds,
  ): Promise<T> {
    if (ttlSeconds <= 0) {
      return factory();
    }

    const nowMs = this.clock.now().getTime();
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;

    if (cached && cached.expiresAtMs > nowMs) {
      return cached.value;
    }

    // The promise itself is cached so concurrent callers share a single computation.
    const value = factory();

    this.entries.set(key, {
      value,
      expiresAtMs: nowMs + ttlSeconds * MILLISECONDS_PER_SECOND,
    });

    try {
      return await value;
    } catch (error) {
      this.entries.delete(key);
      throw error;
    }
  }

  public invalidate(key: string): void {
    this.entries.delete(key);
  }

  public invalidateAll(): void {
    if (this.entries.size === 0) {
      return;
    }

    this.logger.debug(`Invalidating ${this.entries.size} cached read model(s)`);
    this.entries.clear();
  }
}
