import { InMemoryCacheService } from '../../../common/cache/in-memory-cache.service';
import { MILLISECONDS_PER_MINUTE } from '../../../common/time/time.constants';
import {
  aBaselineRank,
  aChallengeConfiguration,
  anAppEnvironment,
  aParticipantDefinition,
  aParticipantState,
  aRankedPosition,
  FixedClock,
} from '../../../test-support/builders';
import { InMemoryChallengeStateRepository } from '../../../test-support/in-memory-challenge-state.repository';
import { ParticipantViewFactory } from '../../participants/application/participant-view.factory';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import { LeaderboardService } from './leaderboard.service';

const NOW = new Date('2026-08-06T12:00:00.000Z');
const CHALLENGE = aChallengeConfiguration({ syncIntervalMinutes: 5 });

const DEFINITIONS = [
  aParticipantDefinition({ id: 'climber', gameName: 'Climber' }),
  aParticipantDefinition({ id: 'stable', gameName: 'Stable' }),
  aParticipantDefinition({ id: 'unranked', gameName: 'Unranked' }),
  aParticipantDefinition({ id: 'retired', gameName: 'Retired', enabled: false }),
];

function buildService(repository: InMemoryChallengeStateRepository): LeaderboardService {
  const clock = new FixedClock(NOW);
  const environment = anAppEnvironment({ publicCacheTtlSeconds: 0 });

  return new LeaderboardService(
    repository,
    clock,
    CHALLENGE,
    new ParticipantRegistry({ definitions: DEFINITIONS }),
    new ParticipantViewFactory(clock, CHALLENGE),
    new InMemoryCacheService(clock, environment),
  );
}

function seededRepository(): InMemoryChallengeStateRepository {
  const repository = new InMemoryChallengeStateRepository();

  repository.challengeState = {
    ...repository.challengeState,
    initialized: true,
    lastSuccessfulGlobalSyncAt: new Date(NOW.getTime() - MILLISECONDS_PER_MINUTE).toISOString(),
  };

  repository.seedParticipant(
    aParticipantState({
      participantId: 'climber',
      baselineRank: aBaselineRank({
        rank: aRankedPosition({ tier: 'GOLD', division: 'IV', leaguePoints: 0 }),
      }),
      currentRank: aRankedPosition({ tier: 'PLATINUM', division: 'IV', leaguePoints: 0 }),
    }),
  );
  repository.seedParticipant(
    aParticipantState({
      participantId: 'stable',
      baselineRank: aBaselineRank({
        rank: aRankedPosition({ tier: 'DIAMOND', division: 'IV', leaguePoints: 0 }),
      }),
      currentRank: aRankedPosition({ tier: 'DIAMOND', division: 'IV', leaguePoints: 10 }),
    }),
  );
  repository.seedParticipant(
    aParticipantState({
      participantId: 'unranked',
      baselineRank: aBaselineRank({ rank: null }),
      currentRank: null,
    }),
  );
  repository.seedParticipant(
    aParticipantState({
      participantId: 'retired',
      baselineRank: aBaselineRank({
        rank: aRankedPosition({ tier: 'IRON', division: 'IV', leaguePoints: 0 }),
      }),
      currentRank: aRankedPosition({ tier: 'CHALLENGER', division: null, leaguePoints: 900 }),
    }),
  );

  return repository;
}

describe('LeaderboardService', () => {
  it('ranks enabled participants by current rank and assigns positions', async () => {
    const page = await buildService(seededRepository()).getPage(50, 0);

    expect(page.entries.map((entry) => [entry.position, entry.participant.definition.id])).toEqual([
      [1, 'stable'],
      [2, 'climber'],
      [3, 'unranked'],
    ]);
    expect(page.entries[0].participant.progress.units).toBe(10);
    expect(page.entries[1].participant.progress.units).toBe(400);
    expect(page.entries[2].participant.progress.units).toBeNull();
  });

  it('excludes disabled participants from the public ranking but keeps their stored state', async () => {
    const repository = seededRepository();
    const page = await buildService(repository).getPage(50, 0);

    expect(page.entries.map((entry) => entry.participant.definition.id)).not.toContain('retired');
    expect(repository.participantStates.has('retired')).toBe(true);
  });

  it('paginates without changing the computed positions', async () => {
    const service = buildService(seededRepository());

    const secondPage = await service.getPage(1, 1);

    expect(secondPage.total).toBe(3);
    expect(secondPage.limit).toBe(1);
    expect(secondPage.offset).toBe(1);
    expect(secondPage.entries).toHaveLength(1);
    expect(secondPage.entries[0].position).toBe(2);
    expect(secondPage.entries[0].participant.definition.id).toBe('climber');
  });

  it('exposes the leader of the challenge', async () => {
    const leader = await buildService(seededRepository()).getLeader();

    expect(leader?.position).toBe(1);
    expect(leader?.participant.definition.id).toBe('stable');
  });

  it('reports the global synchronization timestamp and its freshness', async () => {
    const page = await buildService(seededRepository()).getPage(50, 0);

    expect(page.lastSuccessfulSyncAt).not.toBeNull();
    expect(page.dataFreshness).toBe('FRESH');
  });

  it('marks the leaderboard as stale when synchronization falls behind', async () => {
    const repository = seededRepository();
    repository.challengeState = {
      ...repository.challengeState,
      lastSuccessfulGlobalSyncAt: new Date(
        NOW.getTime() - 120 * MILLISECONDS_PER_MINUTE,
      ).toISOString(),
    };

    const page = await buildService(repository).getPage(50, 0);

    expect(page.dataFreshness).toBe('STALE');
  });

  it('serves an empty leaderboard when nothing was synchronized yet', async () => {
    const page = await buildService(new InMemoryChallengeStateRepository()).getPage(50, 0);

    expect(page.total).toBe(3);
    expect(page.entries.every((entry) => entry.participant.state === null)).toBe(true);
    expect(page.dataFreshness).toBe('NEVER_SYNCED');
    expect(await buildService(new InMemoryChallengeStateRepository()).getLeader()).not.toBeNull();
  });
});
