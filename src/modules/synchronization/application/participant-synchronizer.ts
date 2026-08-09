import { Inject, Injectable, Logger } from '@nestjs/common';

import { toSafeErrorDescriptor } from '../../../common/exceptions/safe-error';
import { CLOCK, type Clock } from '../../../common/time/clock';
import {
  epochMillisecondsOf,
  type IsoDateTime,
  toEpochSeconds,
  toIsoDateTime,
} from '../../../common/time/iso-date-time';
import {
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
} from '../../../common/time/time.constants';
import { mapWithConcurrency } from '../../../common/utils/concurrency';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';
import { type AppEnvironment, environmentConfig } from '../../../config/environment.config';
import type { ParticipantDefinition } from '../../../config/participants.config';
import type { RiotPlatform } from '../../../config/routing.config';
import { ChallengeStatusResolver } from '../../challenge/domain/challenge-status';
import {
  CHALLENGE_STATE_REPOSITORY,
  type ChallengeStateRepository,
} from '../../challenge/domain/challenge-state.repository';
import type { ParticipantState, ResolvedAccount } from '../../challenge/domain/participant-state';
import { hasSameVisiblePosition } from '../../challenge/domain/rank/ranked-position';
import { isHigherVisibleRank } from '../../challenge/domain/rank/visible-rank-score';
import type { PersistedSyncStatus } from '../../challenge/domain/sync-status';
import {
  collectMatchIds,
  mergeProcessedMatches,
  newestMatchStartTimestamp,
} from '../../matches/domain/match-collection';
import { resolveMatchWindow } from '../../matches/domain/match-coverage';
import { MatchEligibilityPolicy } from '../../matches/domain/match-eligibility.policy';
import { calculateMatchStatistics } from '../../matches/domain/match-statistics';
import type { ProcessedMatch } from '../../matches/domain/processed-match';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import { RIOT_API_CLIENT, type RiotApiClient } from '../../riot/domain/riot-api.client';
import { RiotApiNotConfiguredError, RiotAuthenticationError } from '../../riot/domain/riot.errors';
import { appendSnapshotIfNeeded } from '../domain/rank-snapshot.policy';
import type { ParticipantSynchronizationReport } from '../domain/synchronization.report';

const PARTIAL_DOWNLOAD_ERROR_CODE = 'RIOT_PARTIAL_MATCH_DOWNLOAD';

interface MatchDownloadResult {
  readonly matches: readonly ProcessedMatch[];
  readonly failures: number;
}

interface ProfileRefresh {
  readonly summonerId: string | null;
  readonly profileIconId: number | null;
  readonly summonerLevel: number | null;
  readonly profileRefreshedAt: IsoDateTime | null;
}

/**
 * Synchronizes a single participant: current rank, new Ranked Solo/Duo matches inside the
 * challenge period, recomputed statistics, highest observed rank and snapshots.
 *
 * Riot budget: the rank and the match ids are the only calls made on every cycle. The Riot
 * ID (Account-V1) and the profile (Summoner-V4) are only refreshed once their configured
 * TTL expires, and match details are downloaded exclusively for ids never processed before.
 *
 * A failure never destroys the previous valid state: the stored document keeps its ranks
 * and matches and only records the error plus the FAILED status.
 */
@Injectable()
export class ParticipantSynchronizer {
  private readonly logger = new Logger(ParticipantSynchronizer.name);

  constructor(
    @Inject(CHALLENGE_STATE_REPOSITORY) private readonly repository: ChallengeStateRepository,
    @Inject(RIOT_API_CLIENT) private readonly riot: RiotApiClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(environmentConfig.KEY) private readonly environment: AppEnvironment,
    @Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration,
    private readonly registry: ParticipantRegistry,
    private readonly eligibility: MatchEligibilityPolicy,
    private readonly challengeStatus: ChallengeStatusResolver,
  ) {}

  public async synchronize(
    definition: ParticipantDefinition,
  ): Promise<ParticipantSynchronizationReport> {
    const riotId = this.registry.riotIdOf(definition);
    const storedState = await this.repository.loadParticipantState(definition.id);

    if (storedState === null || storedState.baselineRank === null) {
      this.logger.warn(
        `Participant "${definition.id}" has no baseline and is pending initialization; skipping it.`,
      );

      return this.emptyReport(definition.id, riotId, 'PENDING_INITIALIZATION');
    }

    await this.markAsSyncing(storedState);

    try {
      return await this.synchronizeStoredState(definition, storedState, riotId);
    } catch (error) {
      const safeError = toSafeErrorDescriptor(error);

      this.logger.warn(
        `Synchronization failed for participant "${definition.id}": ${safeError.code}`,
      );
      await this.persistFailure(storedState, safeError.code, safeError.message);

      return { ...this.emptyReport(definition.id, riotId, 'FAILED'), error: safeError };
    }
  }

  private async synchronizeStoredState(
    definition: ParticipantDefinition,
    storedState: ParticipantState,
    riotId: string,
  ): Promise<ParticipantSynchronizationReport> {
    const platform = definition.platform;
    const now = this.clock.now();
    const nowIso = toIsoDateTime(now);

    const resolvedAccount = await this.refreshAccountIfStale(storedState, platform, now, nowIso);
    const profile = await this.refreshProfileIfStale(storedState, platform, now, nowIso);
    const currentRank = await this.riot.fetchRankedSoloPosition(storedState.puuid, platform);

    const download = await this.downloadNewMatches(storedState, platform);
    const processedMatches = mergeProcessedMatches(storedState.processedMatches, download.matches);
    const matchStatistics = calculateMatchStatistics(
      this.eligibility.filterForStatistics(processedMatches),
    );

    const rankSnapshots = appendSnapshotIfNeeded(storedState.rankSnapshots, currentRank, now);
    const status: PersistedSyncStatus = download.failures > 0 ? 'PARTIAL' : 'SUCCESS';

    const nextState: ParticipantState = {
      ...storedState,
      resolvedAccount,
      summonerId: profile.summonerId,
      profileIconId: profile.profileIconId,
      summonerLevel: profile.summonerLevel,
      profileRefreshedAt: profile.profileRefreshedAt,
      currentRank,
      highestObservedRank: this.resolveHighestObservedRank(storedState, currentRank, nowIso),
      rankSnapshots,
      processedMatches,
      matchStatistics,
      // Only a complete sweep may claim coverage: a partial download keeps the previous
      // value so the next cycle retries the backfill instead of leaving a hole.
      earliestMatchCoverageAt:
        download.failures === 0 ? this.challenge.startAt : storedState.earliestMatchCoverageAt,
      lastSyncAt: nowIso,
      lastSuccessfulSyncAt: status === 'SUCCESS' ? nowIso : storedState.lastSuccessfulSyncAt,
      syncStatus: status,
      lastError:
        download.failures > 0
          ? {
              code: PARTIAL_DOWNLOAD_ERROR_CODE,
              message: `${download.failures} match detail request(s) failed and will be retried.`,
              occurredAt: nowIso,
            }
          : null,
    };

    await this.repository.saveParticipantState(nextState);

    return {
      participantId: definition.id,
      riotId,
      status,
      newMatchesProcessed: download.matches.length,
      rankUpdated: !hasSameVisiblePosition(storedState.currentRank, currentRank),
      snapshotCaptured: rankSnapshots.length !== storedState.rankSnapshots.length,
      error: nextState.lastError,
    };
  }

  /**
   * Riot IDs can be renamed, but rarely: Account-V1 is only queried once the TTL expires.
   */
  private async refreshAccountIfStale(
    storedState: ParticipantState,
    platform: RiotPlatform,
    now: Date,
    nowIso: IsoDateTime,
  ): Promise<ResolvedAccount> {
    const ttlMs = this.challenge.accountRefreshTtlHours * MILLISECONDS_PER_HOUR;
    const ageMs = now.getTime() - epochMillisecondsOf(storedState.resolvedAccount.resolvedAt);

    if (ageMs < ttlMs) {
      return storedState.resolvedAccount;
    }

    const account = await this.riot.resolveAccountByPuuid(storedState.puuid, platform);

    return {
      puuid: storedState.puuid,
      gameName:
        account.gameName.length > 0 ? account.gameName : storedState.resolvedAccount.gameName,
      tagLine: account.tagLine.length > 0 ? account.tagLine : storedState.resolvedAccount.tagLine,
      platform,
      resolvedAt: nowIso,
    };
  }

  /** Summoner-V4 only provides the icon and the level: it does not need a per cycle refresh. */
  private async refreshProfileIfStale(
    storedState: ParticipantState,
    platform: RiotPlatform,
    now: Date,
    nowIso: IsoDateTime,
  ): Promise<ProfileRefresh> {
    const ttlMs = this.challenge.profileRefreshTtlHours * MILLISECONDS_PER_HOUR;
    const refreshedAt = storedState.profileRefreshedAt;
    const isFresh =
      refreshedAt !== null && now.getTime() - epochMillisecondsOf(refreshedAt) < ttlMs;

    if (isFresh) {
      return {
        summonerId: storedState.summonerId,
        profileIconId: storedState.profileIconId,
        summonerLevel: storedState.summonerLevel,
        profileRefreshedAt: refreshedAt,
      };
    }

    const profile = await this.riot.fetchSummonerProfile(storedState.puuid, platform);

    return {
      summonerId: profile.summonerId ?? storedState.summonerId,
      profileIconId: profile.profileIconId,
      summonerLevel: profile.summonerLevel,
      profileRefreshedAt: nowIso,
    };
  }

  private resolveHighestObservedRank(
    storedState: ParticipantState,
    currentRank: ParticipantState['currentRank'],
    observedAt: IsoDateTime,
  ): ParticipantState['highestObservedRank'] {
    if (currentRank === null) {
      return storedState.highestObservedRank;
    }

    if (!isHigherVisibleRank(currentRank, storedState.highestObservedRank?.rank ?? null)) {
      return storedState.highestObservedRank;
    }

    return { rank: currentRank, observedAt };
  }

  /**
   * Asks Riot for the window that can contain matches this service does not have yet.
   *
   * The lower bound is `challenge.startAt` for everybody: a participant added to the
   * roster later still counts every Ranked Solo/Duo game played since the challenge began,
   * and Match-V5 can serve that history. Once the recorded coverage already reaches the
   * start, the window shrinks to an incremental one anchored on the newest stored match.
   */
  private async downloadNewMatches(
    storedState: ParticipantState,
    platform: RiotPlatform,
  ): Promise<MatchDownloadResult> {
    const period = this.eligibility.period;
    const window = resolveMatchWindow({
      challengeStartAtMs: period.startAtMs,
      earliestMatchCoverageAt: storedState.earliestMatchCoverageAt,
      newestProcessedMatchMs: newestMatchStartTimestamp(storedState.processedMatches),
      overlapMs: this.challenge.syncOverlapMinutes * MILLISECONDS_PER_MINUTE,
    });
    const endMs = this.challengeStatus.hasFinished() ? period.endAtMs : null;

    if (window.isBackfill) {
      this.logger.log(
        `Backfilling the match history of "${storedState.participantId}" from the challenge start.`,
      );
    }

    const matchIds = await this.riot.fetchMatchIds({
      puuid: storedState.puuid,
      platform,
      queueId: this.challenge.queueId,
      startTimeSeconds: toEpochSeconds(window.startAtMs),
      endTimeSeconds: endMs === null ? null : toEpochSeconds(endMs),
    });

    const alreadyProcessed = collectMatchIds(storedState.processedMatches);
    const pendingMatchIds = matchIds.filter((matchId) => !alreadyProcessed.has(matchId));

    if (pendingMatchIds.length === 0) {
      return { matches: [], failures: 0 };
    }

    let failures = 0;
    const downloaded = await mapWithConcurrency(
      pendingMatchIds,
      this.environment.riot.maxConcurrency,
      async (matchId) => {
        try {
          return await this.riot.fetchProcessedMatch(matchId, storedState.puuid, platform);
        } catch (error) {
          // Credential problems are not partial failures: they abort this participant.
          if (
            error instanceof RiotAuthenticationError ||
            error instanceof RiotApiNotConfiguredError
          ) {
            throw error;
          }

          failures += 1;
          this.logger.warn(
            `Could not download match ${matchId} for "${storedState.participantId}": ` +
              toSafeErrorDescriptor(error).code,
          );

          return null;
        }
      },
    );

    const matches = downloaded.filter((match): match is ProcessedMatch => match !== null);

    return { matches: this.eligibility.filterBelongingToChallenge(matches), failures };
  }

  private markAsSyncing(storedState: ParticipantState): Promise<void> {
    return this.repository.saveParticipantState({
      ...storedState,
      syncStatus: 'SYNCING',
      lastSyncAt: toIsoDateTime(this.clock.now()),
    });
  }

  private async persistFailure(
    storedState: ParticipantState,
    code: string,
    message: string,
  ): Promise<void> {
    const occurredAt = toIsoDateTime(this.clock.now());

    try {
      await this.repository.saveParticipantState({
        ...storedState,
        lastSyncAt: occurredAt,
        syncStatus: 'FAILED',
        lastError: { code, message, occurredAt },
      });
    } catch {
      this.logger.error(
        `Could not persist the failure of participant "${storedState.participantId}"; stored data is unchanged.`,
      );
    }
  }

  private emptyReport(
    participantId: string,
    riotId: string,
    status: ParticipantSynchronizationReport['status'],
  ): ParticipantSynchronizationReport {
    return {
      participantId,
      riotId,
      status,
      newMatchesProcessed: 0,
      rankUpdated: false,
      snapshotCaptured: false,
      error: null,
    };
  }
}
