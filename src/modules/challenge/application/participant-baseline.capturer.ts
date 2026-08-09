import { Inject, Injectable, Logger } from '@nestjs/common';

import { toSafeErrorDescriptor } from '../../../common/exceptions/safe-error';
import { CLOCK, type Clock } from '../../../common/time/clock';
import { type IsoDateTime, toIsoDateTime } from '../../../common/time/iso-date-time';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';
import type { ParticipantDefinition } from '../../../config/participants.config';
import { EMPTY_MATCH_STATISTICS } from '../../matches/domain/match-statistics';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import { RIOT_API_CLIENT, type RiotApiClient } from '../../riot/domain/riot-api.client';
import {
  CHALLENGE_STATE_REPOSITORY,
  type ChallengeStateRepository,
} from '../domain/challenge-state.repository';
import type { ParticipantState } from '../domain/participant-state';
import { toRankSnapshot } from '../domain/rank/rank-snapshot';
import type { BaselineRank } from '../domain/rank/ranked-position';
import type { ParticipantInitializationOutcome } from './challenge-initialization.report';

/**
 * Captures the baseline of a single participant.
 *
 * Single home of the capture rules, shared by the initial global initialization and by the
 * later incorporation of participants added to the roster afterwards. Both flows must
 * behave identically, so the rules live here instead of being duplicated per use case.
 *
 * Invariants:
 *  - a participant that already has a baseline is never touched, under any circumstance;
 *  - UNRANKED is a valid baseline and never aborts the capture;
 *  - the failure of one participant never affects the stored state of the others.
 */
@Injectable()
export class ParticipantBaselineCapturer {
  private readonly logger = new Logger(ParticipantBaselineCapturer.name);

  constructor(
    @Inject(CHALLENGE_STATE_REPOSITORY) private readonly repository: ChallengeStateRepository,
    @Inject(RIOT_API_CLIENT) private readonly riot: RiotApiClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration,
    private readonly registry: ParticipantRegistry,
  ) {}

  /**
   * Resolves the participant against Riot and persists their baseline, or reports it as
   * already initialized when one exists. Never throws for a Riot failure: the error is
   * returned inside the outcome so a batch can continue with the rest.
   */
  public async capture(
    definition: ParticipantDefinition,
  ): Promise<ParticipantInitializationOutcome> {
    const riotId = this.registry.riotIdOf(definition);
    const existing = await this.repository.loadParticipantState(definition.id);

    if (existing !== null && existing.baselineRank !== null) {
      return {
        participantId: definition.id,
        riotId,
        result: 'ALREADY_INITIALIZED',
        puuid: existing.puuid,
        baselineRank: existing.baselineRank,
        rankProgressStartedAt: existing.baselineRank.capturedAt,
        error: null,
      };
    }

    try {
      const state = await this.captureBaseline(definition);
      await this.repository.saveParticipantState(state);

      return {
        participantId: definition.id,
        riotId: `${state.resolvedAccount.gameName}#${state.resolvedAccount.tagLine}`,
        result: 'INITIALIZED',
        puuid: state.puuid,
        baselineRank: state.baselineRank,
        rankProgressStartedAt: state.baselineRank?.capturedAt ?? null,
        error: null,
      };
    } catch (error) {
      const safeError = toSafeErrorDescriptor(error);
      this.logger.warn(
        `Could not capture the baseline of participant "${definition.id}" (${riotId}): ${safeError.code}`,
      );

      return {
        participantId: definition.id,
        riotId,
        result: 'FAILED',
        puuid: null,
        baselineRank: null,
        rankProgressStartedAt: null,
        error: safeError,
      };
    }
  }

  private async captureBaseline(definition: ParticipantDefinition): Promise<ParticipantState> {
    const account = await this.riot.resolveAccountByRiotId(
      definition.gameName,
      definition.tagLine,
      definition.platform,
    );
    const profile = await this.riot.fetchSummonerProfile(account.puuid, definition.platform);
    const currentRank = await this.riot.fetchRankedSoloPosition(account.puuid, definition.platform);

    const capturedAt: IsoDateTime = toIsoDateTime(this.clock.now());
    const baselineRank: BaselineRank = { rank: currentRank, capturedAt };

    return {
      participantId: definition.id,
      resolvedAccount: {
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        platform: definition.platform,
        resolvedAt: capturedAt,
      },
      puuid: account.puuid,
      summonerId: profile.summonerId,
      profileIconId: profile.profileIconId,
      summonerLevel: profile.summonerLevel,
      profileRefreshedAt: capturedAt,
      baselineRank,
      // Never swept yet: the first synchronization backfills the whole period, so a
      // participant incorporated late still recovers everything played since the start.
      earliestMatchCoverageAt: null,
      // The current rank starts equal to the baseline, so progress starts at exactly 0.
      currentRank,
      highestObservedRank:
        currentRank === null ? null : { rank: currentRank, observedAt: capturedAt },
      rankSnapshots: [toRankSnapshot(currentRank, capturedAt)],
      processedMatches: [],
      matchStatistics: EMPTY_MATCH_STATISTICS,
      lastSyncAt: capturedAt,
      lastSuccessfulSyncAt: null,
      syncStatus: 'PENDING',
      lastError: null,
    };
  }
}
