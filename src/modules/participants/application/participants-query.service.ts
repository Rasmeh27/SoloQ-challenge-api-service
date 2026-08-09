import { Inject, Injectable } from '@nestjs/common';

import { CACHE_KEYS, InMemoryCacheService } from '../../../common/cache/in-memory-cache.service';
import { ParticipantNotFoundError } from '../../../common/exceptions/application.exceptions';
import { CLOCK, type Clock } from '../../../common/time/clock';
import { epochMillisecondsOf } from '../../../common/time/iso-date-time';
import { type Page, paginate } from '../../../common/types/page';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';
import {
  CHALLENGE_STATE_REPOSITORY,
  type ChallengeStateRepository,
} from '../../challenge/domain/challenge-state.repository';
import type { RankSnapshot } from '../../challenge/domain/rank/rank-snapshot';
import { MatchEligibilityPolicy } from '../../matches/domain/match-eligibility.policy';
import {
  calculateMatchQuotaTracker,
  type MatchQuotaTracker,
} from '../../matches/domain/match-quota-tracker';
import type { ProcessedMatch } from '../../matches/domain/processed-match';
import { ParticipantRegistry } from '../domain/participant.registry';
import { type ParticipantView, ParticipantViewFactory } from './participant-view.factory';

/** Matches embedded in the participant profile; the full history has its own endpoint. */
const RECENT_MATCHES_LIMIT = 10;

export const MATCH_RESULTS = ['WIN', 'LOSS'] as const;

export type MatchResultFilter = (typeof MATCH_RESULTS)[number];

export interface ParticipantMatchesQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly championName?: string;
  readonly result?: MatchResultFilter;
}

export interface ParticipantProfile {
  readonly view: ParticipantView;
  readonly recentMatches: readonly ProcessedMatch[];
  readonly processedMatchesCount: number;
  readonly matchQuota: MatchQuotaTracker;
}

export interface ParticipantProgression {
  readonly view: ParticipantView;
  /** Chronological order (oldest first) so the frontend can plot it directly. */
  readonly snapshots: readonly RankSnapshot[];
}

/**
 * Read side of the participants. Works exclusively with the locally synchronized state:
 * no Riot call happens while serving a public request.
 */
@Injectable()
export class ParticipantsQueryService {
  constructor(
    @Inject(CHALLENGE_STATE_REPOSITORY) private readonly repository: ChallengeStateRepository,
    private readonly registry: ParticipantRegistry,
    private readonly viewFactory: ParticipantViewFactory,
    private readonly eligibility: MatchEligibilityPolicy,
    private readonly cache: InMemoryCacheService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration,
  ) {}

  /** Enabled participants only: disabled ones keep their history but leave the public lists. */
  public listEnabled(): Promise<readonly ParticipantView[]> {
    return this.cache.getOrSet(CACHE_KEYS.participantsOverview, async () => {
      const challengeState = await this.repository.loadChallengeState();
      const states = await this.repository.loadAllParticipantStates();

      return this.viewFactory.buildAll(this.registry.enabled(), states, challengeState.initialized);
    });
  }

  public getProfile(participantId: string): Promise<ParticipantProfile> {
    return this.cache.getOrSet(CACHE_KEYS.participantProfile(participantId), async () => {
      const view = await this.loadView(participantId);
      const matches = this.challengeMatchesOf(view);

      return {
        view,
        recentMatches: matches.slice(0, RECENT_MATCHES_LIMIT),
        processedMatchesCount: matches.length,
        matchQuota: calculateMatchQuotaTracker(matches, this.challenge, this.clock.now()),
      };
    });
  }

  public async getMatches(
    participantId: string,
    query: ParticipantMatchesQuery,
  ): Promise<Page<ProcessedMatch>> {
    const view = await this.loadView(participantId);
    const matches = this.applyFilters(this.challengeMatchesOf(view), query);

    return paginate(matches, query.page, query.pageSize);
  }

  public async getProgression(participantId: string): Promise<ParticipantProgression> {
    const view = await this.loadView(participantId);
    const snapshots = [...(view.state?.rankSnapshots ?? [])].sort(
      (left, right) => epochMillisecondsOf(left.capturedAt) - epochMillisecondsOf(right.capturedAt),
    );

    return { view, snapshots };
  }

  /** Accepts disabled participants too: their history stays publicly readable. */
  private async loadView(participantId: string): Promise<ParticipantView> {
    const definition = this.registry.find(participantId);

    if (definition === null) {
      throw new ParticipantNotFoundError(participantId);
    }

    const challengeState = await this.repository.loadChallengeState();
    const state = await this.repository.loadParticipantState(participantId);

    return this.viewFactory.build(definition, state, challengeState.initialized);
  }

  /**
   * Already newest first in storage; filtered again in case the configured period changed.
   * Coverage is the challenge period for everybody, whenever they joined the roster.
   */
  private challengeMatchesOf(view: ParticipantView): readonly ProcessedMatch[] {
    return this.eligibility.filterBelongingToChallenge(view.state?.processedMatches ?? []);
  }

  private applyFilters(
    matches: readonly ProcessedMatch[],
    query: ParticipantMatchesQuery,
  ): readonly ProcessedMatch[] {
    const championName = query.championName?.trim().toLowerCase();

    return matches.filter((match) => {
      if (championName !== undefined && match.championName.toLowerCase() !== championName) {
        return false;
      }

      if (query.result === 'WIN' && !match.win) {
        return false;
      }

      if (query.result === 'LOSS' && match.win) {
        return false;
      }

      return true;
    });
  }
}
