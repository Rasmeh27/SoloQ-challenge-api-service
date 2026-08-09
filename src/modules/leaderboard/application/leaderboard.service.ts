import { Inject, Injectable } from '@nestjs/common';

import { CACHE_KEYS, InMemoryCacheService } from '../../../common/cache/in-memory-cache.service';
import { CLOCK, type Clock } from '../../../common/time/clock';
import type { IsoDateTime } from '../../../common/time/iso-date-time';
import { challengeConfig, type ChallengeConfiguration } from '../../../config/challenge.config';
import {
  CHALLENGE_STATE_REPOSITORY,
  type ChallengeStateRepository,
} from '../../challenge/domain/challenge-state.repository';
import { type DataFreshness, resolveDataFreshness } from '../../challenge/domain/data-freshness';
import {
  type ParticipantView,
  ParticipantViewFactory,
} from '../../participants/application/participant-view.factory';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import {
  type LeaderboardCandidate,
  sortLeaderboardCandidates,
} from '../domain/leaderboard-sorting';

const FIRST_POSITION = 1;

export interface LeaderboardEntry {
  readonly position: number;
  readonly participant: ParticipantView;
}

export interface LeaderboardPage {
  readonly entries: readonly LeaderboardEntry[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly lastSuccessfulSyncAt: IsoDateTime | null;
  readonly dataFreshness: DataFreshness;
}

interface RankedCandidate extends LeaderboardCandidate {
  readonly participant: ParticipantView;
}

/** Full ordered leaderboard plus the global synchronization timestamp. Cached as a unit. */
export interface LeaderboardSnapshot {
  readonly entries: readonly LeaderboardEntry[];
  readonly lastSuccessfulSyncAt: IsoDateTime | null;
}

/**
 * Builds the leaderboard from the locally synchronized state.
 *
 * It never calls the Riot API: public reads always answer from storage, marking the data
 * as stale when synchronization is behind. Disabled participants keep their stored history
 * but are excluded from the public ranking.
 */
@Injectable()
export class LeaderboardService {
  constructor(
    @Inject(CHALLENGE_STATE_REPOSITORY) private readonly repository: ChallengeStateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(challengeConfig.KEY) private readonly challenge: ChallengeConfiguration,
    private readonly registry: ParticipantRegistry,
    private readonly viewFactory: ParticipantViewFactory,
    private readonly cache: InMemoryCacheService,
  ) {}

  public async getPage(limit: number, offset: number): Promise<LeaderboardPage> {
    const leaderboard = await this.getSnapshot();

    return {
      entries: leaderboard.entries.slice(offset, offset + limit),
      total: leaderboard.entries.length,
      limit,
      offset,
      lastSuccessfulSyncAt: leaderboard.lastSuccessfulSyncAt,
      dataFreshness: resolveDataFreshness(
        leaderboard.lastSuccessfulSyncAt,
        this.clock.now(),
        this.challenge.syncIntervalMinutes,
      ),
    };
  }

  public async getLeader(): Promise<LeaderboardEntry | null> {
    const leaderboard = await this.getSnapshot();

    return leaderboard.entries[0] ?? null;
  }

  /** Cached read model reused by the leaderboard endpoint and the challenge summary. */
  public getSnapshot(): Promise<LeaderboardSnapshot> {
    return this.cache.getOrSet(CACHE_KEYS.leaderboard, () => this.buildLeaderboard());
  }

  private async buildLeaderboard(): Promise<LeaderboardSnapshot> {
    const challengeState = await this.repository.loadChallengeState();
    const states = await this.repository.loadAllParticipantStates();
    const views = this.viewFactory.buildAll(
      this.registry.enabled(),
      states,
      challengeState.initialized,
    );

    const ordered = sortLeaderboardCandidates(
      views.map((view) => this.toCandidate(view)),
      this.challenge.leaderboardTieBreakers,
    );

    return {
      entries: ordered.map((candidate, index) => ({
        position: index + FIRST_POSITION,
        participant: candidate.participant,
      })),
      lastSuccessfulSyncAt: challengeState.lastSuccessfulGlobalSyncAt,
    };
  }

  private toCandidate(view: ParticipantView): RankedCandidate {
    const currentRank = view.state?.currentRank ?? null;

    return {
      riotId: view.riotId,
      progressUnits: view.progress.units,
      currentRank,
      leaguePoints: currentRank?.leaguePoints ?? null,
      eventWins: view.statistics.wins,
      eventWinRate: view.statistics.winRate,
      participant: view,
    };
  }
}
