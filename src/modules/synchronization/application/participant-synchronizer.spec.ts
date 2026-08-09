import {
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
} from '../../../common/time/time.constants';
import {
  aBaselineRank,
  aChallengeConfiguration,
  anAppEnvironment,
  aParticipantDefinition,
  aParticipantState,
  aProcessedMatch,
  aRankedPosition,
  FixedClock,
} from '../../../test-support/builders';
import { FakeRiotApiClient } from '../../../test-support/fake-riot-api.client';
import { InMemoryChallengeStateRepository } from '../../../test-support/in-memory-challenge-state.repository';
import { ChallengeStatusResolver } from '../../challenge/domain/challenge-status';
import { calculateRankProgress } from '../../challenge/domain/rank/rank-progress';
import { MatchEligibilityPolicy } from '../../matches/domain/match-eligibility.policy';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import { RiotUnavailableError } from '../../riot/domain/riot.errors';
import { ParticipantSynchronizer } from './participant-synchronizer';

const NOW = new Date('2026-08-06T12:00:00.000Z');
const CHALLENGE = aChallengeConfiguration({
  startAt: '2026-08-01T00:00:00.000Z',
  endAt: '2026-10-31T23:59:59.999Z',
  syncIntervalMinutes: 5,
  syncOverlapMinutes: 30,
  accountRefreshTtlHours: 24,
  profileRefreshTtlHours: 6,
});
const DEFINITION = aParticipantDefinition({ id: 'one', gameName: 'PlayerOne', tagLine: 'LAN' });
const PUUID = 'puuid-playerone';

interface Harness {
  readonly synchronizer: ParticipantSynchronizer;
  readonly repository: InMemoryChallengeStateRepository;
  readonly riot: FakeRiotApiClient;
  readonly clock: FixedClock;
}

function buildHarness(): Harness {
  const repository = new InMemoryChallengeStateRepository();
  const riot = new FakeRiotApiClient();
  const clock = new FixedClock(NOW);

  return {
    repository,
    riot,
    clock,
    synchronizer: new ParticipantSynchronizer(
      repository,
      riot,
      clock,
      anAppEnvironment(),
      CHALLENGE,
      new ParticipantRegistry({ definitions: [DEFINITION] }),
      new MatchEligibilityPolicy(CHALLENGE),
      new ChallengeStatusResolver(CHALLENGE, clock),
    ),
  };
}

function matchAt(matchId: string, isoInstant: string, win = true) {
  return aProcessedMatch({
    matchId,
    gameStartTimestamp: Date.parse(isoInstant),
    gameEndTimestamp: Date.parse(isoInstant) + 30 * MILLISECONDS_PER_MINUTE,
    win,
  });
}

describe('ParticipantSynchronizer', () => {
  it('skips a participant without a baseline instead of capturing a new one', async () => {
    const { synchronizer, repository, riot } = buildHarness();

    const report = await synchronizer.synchronize(DEFINITION);

    expect(report.status).toBe('PENDING_INITIALIZATION');
    expect(report.newMatchesProcessed).toBe(0);
    expect(repository.participantStates.size).toBe(0);
    expect(riot.matchIdsRequests).toHaveLength(0);
  });

  it('updates the current rank and downloads the new matches of the period', async () => {
    const { synchronizer, repository, riot } = buildHarness();
    repository.seedParticipant(
      aParticipantState({
        participantId: 'one',
        puuid: PUUID,
        currentRank: aRankedPosition({ leaguePoints: 20 }),
        rankSnapshots: [],
        processedMatches: [],
        lastSuccessfulSyncAt: null,
        syncStatus: 'PENDING',
      }),
    );
    riot.register({
      gameName: 'PlayerOne',
      tagLine: 'LAN',
      puuid: PUUID,
      rank: aRankedPosition({ leaguePoints: 62 }),
      matches: [
        matchAt('LA1_1', '2026-08-02T18:00:00.000Z'),
        matchAt('LA1_2', '2026-08-03T18:00:00.000Z', false),
      ],
    });

    const report = await synchronizer.synchronize(DEFINITION);
    const state = repository.participantStates.get('one');

    expect(report.status).toBe('SUCCESS');
    expect(report.newMatchesProcessed).toBe(2);
    expect(report.rankUpdated).toBe(true);
    expect(state?.currentRank?.leaguePoints).toBe(62);
    expect(state?.processedMatches.map((match) => match.matchId)).toEqual(['LA1_2', 'LA1_1']);
    expect(state?.matchStatistics.gamesPlayed).toBe(2);
    expect(state?.matchStatistics.wins).toBe(1);
    expect(state?.lastSuccessfulSyncAt).toBe(NOW.toISOString());
    expect(state?.lastError).toBeNull();
  });

  describe('Riot request budget', () => {
    it('does not resolve the Riot ID nor the profile again while their TTL is valid', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      repository.seedParticipant(
        aParticipantState({
          participantId: 'one',
          puuid: PUUID,
          resolvedAccount: {
            puuid: PUUID,
            gameName: 'PlayerOne',
            tagLine: 'LAN',
            platform: 'LA1',
            resolvedAt: new Date(NOW.getTime() - MILLISECONDS_PER_HOUR).toISOString(),
          },
          profileRefreshedAt: new Date(NOW.getTime() - MILLISECONDS_PER_HOUR).toISOString(),
        }),
      );
      riot.register({
        gameName: 'PlayerOne',
        tagLine: 'LAN',
        puuid: PUUID,
        rank: aRankedPosition(),
      });

      await synchronizer.synchronize(DEFINITION);

      expect(riot.accountByPuuidRequests).toEqual([]);
      expect(riot.summonerProfileRequests).toEqual([]);
      // The rank and the match ids are the only per cycle calls.
      expect(riot.rankedPositionRequests).toEqual([PUUID]);
      expect(riot.matchIdsRequests).toHaveLength(1);
    });

    it('refreshes the Riot ID once the account TTL expired', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      repository.seedParticipant(
        aParticipantState({
          participantId: 'one',
          puuid: PUUID,
          resolvedAccount: {
            puuid: PUUID,
            gameName: 'OldName',
            tagLine: 'LAN',
            platform: 'LA1',
            resolvedAt: new Date(NOW.getTime() - 30 * MILLISECONDS_PER_HOUR).toISOString(),
          },
          profileRefreshedAt: NOW.toISOString(),
        }),
      );
      riot.register({ gameName: 'NewName', tagLine: 'LAN', puuid: PUUID, rank: aRankedPosition() });

      await synchronizer.synchronize(DEFINITION);

      expect(riot.accountByPuuidRequests).toEqual([PUUID]);
      expect(riot.summonerProfileRequests).toEqual([]);
      expect(repository.participantStates.get('one')?.resolvedAccount).toEqual(
        expect.objectContaining({ gameName: 'NewName', resolvedAt: NOW.toISOString() }),
      );
    });

    it('refreshes the profile once its TTL expired', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      repository.seedParticipant(
        aParticipantState({
          participantId: 'one',
          puuid: PUUID,
          resolvedAccount: {
            puuid: PUUID,
            gameName: 'PlayerOne',
            tagLine: 'LAN',
            platform: 'LA1',
            resolvedAt: NOW.toISOString(),
          },
          profileRefreshedAt: new Date(NOW.getTime() - 7 * MILLISECONDS_PER_HOUR).toISOString(),
        }),
      );
      riot.register({
        gameName: 'PlayerOne',
        tagLine: 'LAN',
        puuid: PUUID,
        rank: aRankedPosition(),
      });

      await synchronizer.synchronize(DEFINITION);

      expect(riot.summonerProfileRequests).toEqual([PUUID]);
      expect(repository.participantStates.get('one')?.profileRefreshedAt).toBe(NOW.toISOString());
    });

    it('refreshes the profile of a state written before the TTL existed', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      repository.seedParticipant(
        aParticipantState({ participantId: 'one', puuid: PUUID, profileRefreshedAt: null }),
      );
      riot.register({
        gameName: 'PlayerOne',
        tagLine: 'LAN',
        puuid: PUUID,
        rank: aRankedPosition(),
      });

      await synchronizer.synchronize(DEFINITION);

      expect(riot.summonerProfileRequests).toEqual([PUUID]);
    });
  });

  it('never downloads a match that was already processed', async () => {
    const { synchronizer, repository, riot } = buildHarness();
    const known = matchAt('LA1_1', '2026-08-02T18:00:00.000Z');
    repository.seedParticipant(
      aParticipantState({ participantId: 'one', puuid: PUUID, processedMatches: [known] }),
    );
    riot.register({
      gameName: 'PlayerOne',
      tagLine: 'LAN',
      puuid: PUUID,
      rank: aRankedPosition(),
      matches: [known, matchAt('LA1_2', '2026-08-04T18:00:00.000Z')],
    });

    const report = await synchronizer.synchronize(DEFINITION);

    expect(riot.matchDetailRequests).toEqual(['LA1_2']);
    expect(report.newMatchesProcessed).toBe(1);
    expect(repository.participantStates.get('one')?.processedMatches).toHaveLength(2);
  });

  it('applies the overlap window when asking Riot for match ids', async () => {
    const { synchronizer, repository, riot } = buildHarness();
    const newest = matchAt('LA1_1', '2026-08-05T10:00:00.000Z');
    repository.seedParticipant(
      aParticipantState({
        participantId: 'one',
        puuid: PUUID,
        processedMatches: [newest],
        // History already swept: only then does the window become incremental.
        earliestMatchCoverageAt: '2026-08-01T00:00:00.000Z',
      }),
    );
    riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', puuid: PUUID, rank: aRankedPosition() });

    await synchronizer.synchronize(DEFINITION);

    const expectedStartMs = newest.gameStartTimestamp - 30 * MILLISECONDS_PER_MINUTE;
    expect(riot.matchIdsRequests[0]).toEqual(
      expect.objectContaining({
        puuid: PUUID,
        queueId: 420,
        startTimeSeconds: Math.floor(expectedStartMs / 1_000),
        endTimeSeconds: null,
      }),
    );
  });

  it('starts from the challenge start date when nothing was processed yet', async () => {
    const { synchronizer, repository, riot } = buildHarness();
    repository.seedParticipant(
      aParticipantState({ participantId: 'one', puuid: PUUID, processedMatches: [] }),
    );
    riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', puuid: PUUID, rank: aRankedPosition() });

    await synchronizer.synchronize(DEFINITION);

    expect(riot.matchIdsRequests[0].startTimeSeconds).toBe(
      Math.floor(Date.parse('2026-08-01T00:00:00.000Z') / 1_000),
    );
  });

  describe('participants incorporated after the challenge started', () => {
    /** Added and captured on the 4th, three days after the challenge began. */
    const BASELINE_CAPTURED_AT = '2026-08-04T00:00:00.000Z';
    const BASELINE = aBaselineRank({
      rank: aRankedPosition({ tier: 'GOLD', division: 'IV', leaguePoints: 55 }),
      capturedAt: BASELINE_CAPTURED_AT,
    });

    function seedLateParticipant(
      repository: InMemoryChallengeStateRepository,
      overrides: Partial<Parameters<typeof aParticipantState>[0]> = {},
    ) {
      repository.seedParticipant(
        aParticipantState({
          participantId: 'one',
          puuid: PUUID,
          baselineRank: BASELINE,
          currentRank: BASELINE.rank,
          processedMatches: [],
          earliestMatchCoverageAt: null,
          ...overrides,
        }),
      );
    }

    /** Two before the baseline, one after; plus two that must never count. */
    function registerHistory(riot: FakeRiotApiClient) {
      riot.register({
        gameName: 'PlayerOne',
        tagLine: 'LAN',
        puuid: PUUID,
        rank: BASELINE.rank,
        matches: [
          matchAt('LA1_before_challenge', '2026-07-30T18:00:00.000Z', true),
          matchAt('LA1_day1', '2026-08-02T18:00:00.000Z', true),
          matchAt('LA1_day2', '2026-08-03T18:00:00.000Z', false),
          matchAt('LA1_after_baseline', '2026-08-05T18:00:00.000Z', true),
          aProcessedMatch({
            matchId: 'LA1_flex',
            queueId: 440,
            gameStartTimestamp: Date.parse('2026-08-02T20:00:00.000Z'),
          }),
        ],
      });
    }

    it('asks Riot from the challenge start, not from the baseline capture', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      seedLateParticipant(repository);
      registerHistory(riot);

      await synchronizer.synchronize(DEFINITION);

      expect(riot.matchIdsRequests[0]?.startTimeSeconds).toBe(
        Math.floor(Date.parse('2026-08-01T00:00:00.000Z') / 1_000),
      );
    });

    it('recovers the matches played before the baseline was captured', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      seedLateParticipant(repository);
      registerHistory(riot);

      const report = await synchronizer.synchronize(DEFINITION);
      const state = repository.participantStates.get('one');

      expect(report.newMatchesProcessed).toBe(3);
      expect(state?.processedMatches.map((match) => match.matchId)).toEqual([
        'LA1_after_baseline',
        'LA1_day2',
        'LA1_day1',
      ]);
    });

    it('counts those matches in the statistics of the event', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      seedLateParticipant(repository);
      registerHistory(riot);

      await synchronizer.synchronize(DEFINITION);
      const statistics = repository.participantStates.get('one')?.matchStatistics;

      expect(statistics?.gamesPlayed).toBe(3);
      expect(statistics?.wins).toBe(2);
      expect(statistics?.losses).toBe(1);
      expect(statistics?.winRate).toBeCloseTo(66.67, 1);
      expect(statistics?.averageKda).toBeGreaterThan(0);
      expect(statistics?.uniqueChampionsPlayed).toBeGreaterThan(0);
      expect(statistics?.mostPlayedChampion).not.toBeNull();
    });

    it('excludes matches played before the challenge and other queues', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      seedLateParticipant(repository);
      registerHistory(riot);

      await synchronizer.synchronize(DEFINITION);
      const stored = repository.participantStates.get('one')?.processedMatches ?? [];

      expect(stored.map((match) => match.matchId)).not.toContain('LA1_before_challenge');
      expect(stored.map((match) => match.matchId)).not.toContain('LA1_flex');
    });

    it('never touches the baseline, so rank progress still starts at zero', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      seedLateParticipant(repository);
      registerHistory(riot);

      await synchronizer.synchronize(DEFINITION);
      const state = repository.participantStates.get('one');

      expect(state?.baselineRank).toEqual(BASELINE);
      // Ten games played, zero visible progress: valid and expected.
      expect(
        calculateRankProgress(state?.baselineRank ?? null, state?.currentRank ?? null),
      ).toEqual(expect.objectContaining({ units: 0, status: 'CALCULATED' }));
    });

    it('records the coverage so the next cycle goes back to being incremental', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      seedLateParticipant(repository);
      registerHistory(riot);

      await synchronizer.synchronize(DEFINITION);

      expect(repository.participantStates.get('one')?.earliestMatchCoverageAt).toBe(
        '2026-08-01T00:00:00.000Z',
      );
    });

    it('is idempotent: a second run adds nothing and duplicates no match id', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      seedLateParticipant(repository);
      registerHistory(riot);

      await synchronizer.synchronize(DEFINITION);
      const afterFirst = repository.participantStates.get('one')?.processedMatches ?? [];

      const secondReport = await synchronizer.synchronize(DEFINITION);
      const afterSecond = repository.participantStates.get('one')?.processedMatches ?? [];

      expect(secondReport.newMatchesProcessed).toBe(0);
      expect(afterSecond).toHaveLength(afterFirst.length);
      expect(new Set(afterSecond.map((match) => match.matchId)).size).toBe(afterSecond.length);
    });

    it('backfills a participant that already has recent matches but incomplete coverage', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      // The state left by the previous rule: synchronized, but only from the baseline.
      seedLateParticipant(repository, {
        processedMatches: [matchAt('LA1_after_baseline', '2026-08-05T18:00:00.000Z', true)],
        earliestMatchCoverageAt: BASELINE_CAPTURED_AT,
        syncStatus: 'SUCCESS',
      });
      registerHistory(riot);

      const report = await synchronizer.synchronize(DEFINITION);

      expect(riot.matchIdsRequests[0]?.startTimeSeconds).toBe(
        Math.floor(Date.parse('2026-08-01T00:00:00.000Z') / 1_000),
      );
      expect(report.newMatchesProcessed).toBe(2);
      expect(repository.participantStates.get('one')?.matchStatistics.gamesPlayed).toBe(3);
    });

    it('keeps the coverage unset when the sweep was only partial, so it retries', async () => {
      const { synchronizer, repository, riot } = buildHarness();
      seedLateParticipant(repository);
      registerHistory(riot);
      riot.failMatchDetail('LA1_day1', new RiotUnavailableError('match', 503));

      const report = await synchronizer.synchronize(DEFINITION);

      expect(report.status).toBe('PARTIAL');
      expect(repository.participantStates.get('one')?.earliestMatchCoverageAt).toBeNull();
    });
  });

  it('bounds the window with the end date once the challenge is over', async () => {
    const { synchronizer, repository, riot, clock } = buildHarness();
    clock.set('2026-11-05T00:00:00.000Z');
    repository.seedParticipant(
      aParticipantState({ participantId: 'one', puuid: PUUID, processedMatches: [] }),
    );
    riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', puuid: PUUID, rank: aRankedPosition() });

    await synchronizer.synchronize(DEFINITION);

    expect(riot.matchIdsRequests[0].endTimeSeconds).toBe(
      Math.floor(Date.parse('2026-10-31T23:59:59.999Z') / 1_000),
    );
  });

  it('raises the highest observed rank only when the visible position improves', async () => {
    const { synchronizer, repository, riot } = buildHarness();
    const highest = aRankedPosition({ tier: 'EMERALD', division: 'I', leaguePoints: 80 });
    repository.seedParticipant(
      aParticipantState({
        participantId: 'one',
        puuid: PUUID,
        highestObservedRank: { rank: highest, observedAt: '2026-08-05T00:00:00.000Z' },
      }),
    );
    riot.register({
      gameName: 'PlayerOne',
      tagLine: 'LAN',
      puuid: PUUID,
      rank: aRankedPosition({ tier: 'EMERALD', division: 'II', leaguePoints: 10 }),
    });

    await synchronizer.synchronize(DEFINITION);

    expect(repository.participantStates.get('one')?.highestObservedRank).toEqual({
      rank: highest,
      observedAt: '2026-08-05T00:00:00.000Z',
    });
  });

  it('records a new highest observed rank when the participant climbs', async () => {
    const { synchronizer, repository, riot } = buildHarness();
    repository.seedParticipant(
      aParticipantState({
        participantId: 'one',
        puuid: PUUID,
        highestObservedRank: {
          rank: aRankedPosition({ tier: 'EMERALD', division: 'III', leaguePoints: 20 }),
          observedAt: '2026-08-01T00:00:00.000Z',
        },
      }),
    );
    const climbed = aRankedPosition({ tier: 'DIAMOND', division: 'IV', leaguePoints: 5 });
    riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', puuid: PUUID, rank: climbed });

    await synchronizer.synchronize(DEFINITION);

    expect(repository.participantStates.get('one')?.highestObservedRank).toEqual({
      rank: climbed,
      observedAt: NOW.toISOString(),
    });
  });

  it('captures a snapshot when the visible position changed', async () => {
    const { synchronizer, repository, riot } = buildHarness();
    repository.seedParticipant(
      aParticipantState({
        participantId: 'one',
        puuid: PUUID,
        currentRank: aRankedPosition({ leaguePoints: 20 }),
        rankSnapshots: [],
      }),
    );
    riot.register({
      gameName: 'PlayerOne',
      tagLine: 'LAN',
      puuid: PUUID,
      rank: aRankedPosition({ leaguePoints: 45 }),
    });

    const report = await synchronizer.synchronize(DEFINITION);

    expect(report.snapshotCaptured).toBe(true);
    expect(repository.participantStates.get('one')?.rankSnapshots).toEqual([
      expect.objectContaining({ leaguePoints: 45, capturedAt: NOW.toISOString() }),
    ]);
  });

  it('refreshes a renamed Riot ID from the stable PUUID', async () => {
    const { synchronizer, repository, riot } = buildHarness();
    repository.seedParticipant(aParticipantState({ participantId: 'one', puuid: PUUID }));
    riot.register({
      gameName: 'RenamedPlayer',
      tagLine: 'LAS',
      puuid: PUUID,
      rank: aRankedPosition(),
    });

    await synchronizer.synchronize(DEFINITION);

    expect(repository.participantStates.get('one')?.resolvedAccount).toEqual(
      expect.objectContaining({ gameName: 'RenamedPlayer', tagLine: 'LAS' }),
    );
  });

  it('keeps the last valid state when Riot fails and records the error', async () => {
    const { synchronizer, repository, riot } = buildHarness();
    const knownMatch = matchAt('LA1_1', '2026-08-02T18:00:00.000Z');
    repository.seedParticipant(
      aParticipantState({
        participantId: 'one',
        puuid: PUUID,
        baselineRank: aBaselineRank(),
        currentRank: aRankedPosition({ leaguePoints: 33 }),
        processedMatches: [knownMatch],
        lastSuccessfulSyncAt: '2026-08-06T11:00:00.000Z',
      }),
    );
    riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', puuid: PUUID, rank: aRankedPosition() });
    riot.failRankLookup(PUUID, new RiotUnavailableError('league-v4', 503));

    const report = await synchronizer.synchronize(DEFINITION);
    const state = repository.participantStates.get('one');

    expect(report.status).toBe('FAILED');
    expect(report.error?.code).toBe('RIOT_UNAVAILABLE');
    expect(state?.syncStatus).toBe('FAILED');
    expect(state?.lastError).toEqual(
      expect.objectContaining({ code: 'RIOT_UNAVAILABLE', occurredAt: NOW.toISOString() }),
    );
    // Nothing was destroyed.
    expect(state?.currentRank?.leaguePoints).toBe(33);
    expect(state?.processedMatches).toEqual([knownMatch]);
    expect(state?.baselineRank).toEqual(aBaselineRank());
    expect(state?.lastSuccessfulSyncAt).toBe('2026-08-06T11:00:00.000Z');
  });

  it('reports PARTIAL when only some match details could be downloaded', async () => {
    const { synchronizer, repository, riot } = buildHarness();
    repository.seedParticipant(
      aParticipantState({
        participantId: 'one',
        puuid: PUUID,
        processedMatches: [],
        lastSuccessfulSyncAt: '2026-08-06T11:00:00.000Z',
      }),
    );
    riot.register({
      gameName: 'PlayerOne',
      tagLine: 'LAN',
      puuid: PUUID,
      rank: aRankedPosition(),
      matches: [
        matchAt('LA1_1', '2026-08-02T18:00:00.000Z'),
        matchAt('LA1_2', '2026-08-03T18:00:00.000Z'),
      ],
    });
    riot.failMatchDetail('LA1_2', new RiotUnavailableError('match-v5', 500));

    const report = await synchronizer.synchronize(DEFINITION);
    const state = repository.participantStates.get('one');

    expect(report.status).toBe('PARTIAL');
    expect(report.newMatchesProcessed).toBe(1);
    expect(state?.syncStatus).toBe('PARTIAL');
    expect(state?.processedMatches.map((match) => match.matchId)).toEqual(['LA1_1']);
    expect(state?.lastError?.code).toBe('RIOT_PARTIAL_MATCH_DOWNLOAD');
    // A partial run does not refresh the successful synchronization timestamp.
    expect(state?.lastSuccessfulSyncAt).toBe('2026-08-06T11:00:00.000Z');
  });
});
