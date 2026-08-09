import { InMemoryCacheService } from '../../../common/cache/in-memory-cache.service';
import {
  ChallengeNotInitializedError,
  SynchronizationAlreadyRunningError,
} from '../../../common/exceptions/application.exceptions';
import { ParticipantNotFoundError } from '../../../common/exceptions/application.exceptions';
import type { AppEnvironment } from '../../../config/environment.config';
import type { ParticipantDefinition } from '../../../config/participants.config';
import {
  aChallengeConfiguration,
  anAppEnvironment,
  aParticipantDefinition,
  FixedClock,
} from '../../../test-support/builders';
import { InMemoryChallengeStateRepository } from '../../../test-support/in-memory-challenge-state.repository';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import { RiotRequestMeter } from '../../riot/domain/riot-request.meter';
import type { ParticipantSynchronizationReport } from '../domain/synchronization.report';
import type { ParticipantSynchronizer } from './participant-synchronizer';
import { SynchronizationOrchestrator } from './synchronization.orchestrator';

const NOW = new Date('2026-08-06T12:00:00.000Z');
const DEFINITIONS = [
  aParticipantDefinition({ id: 'one', gameName: 'One' }),
  aParticipantDefinition({ id: 'two', gameName: 'Two' }),
  aParticipantDefinition({ id: 'three', gameName: 'Three', enabled: false }),
];

/** Scripted synchronizer: the orchestrator is tested in isolation from Riot and storage. */
class StubParticipantSynchronizer {
  public readonly synchronized: string[] = [];
  public readonly thrownFor = new Set<string>();
  public readonly failedFor = new Set<string>();
  public newMatchesPerParticipant = 2;
  public onSynchronize: (() => Promise<void>) | null = null;

  public async synchronize(
    definition: ParticipantDefinition,
  ): Promise<ParticipantSynchronizationReport> {
    this.synchronized.push(definition.id);

    if (this.onSynchronize) {
      await this.onSynchronize();
    }

    if (this.thrownFor.has(definition.id)) {
      throw new Error('unexpected crash');
    }

    return {
      participantId: definition.id,
      riotId: `${definition.gameName}#${definition.tagLine}`,
      status: this.failedFor.has(definition.id) ? 'FAILED' : 'SUCCESS',
      newMatchesProcessed: this.failedFor.has(definition.id) ? 0 : this.newMatchesPerParticipant,
      rankUpdated: false,
      snapshotCaptured: false,
      error: this.failedFor.has(definition.id)
        ? { code: 'RIOT_UNAVAILABLE', message: 'Riot is temporarily unavailable.' }
        : null,
    };
  }
}

interface Harness {
  readonly orchestrator: SynchronizationOrchestrator;
  readonly repository: InMemoryChallengeStateRepository;
  readonly synchronizer: StubParticipantSynchronizer;
  readonly cache: InMemoryCacheService;
  readonly requestMeter: RiotRequestMeter;
}

function buildHarness(
  options: { initialized?: boolean; storageDriver?: AppEnvironment['storageDriver'] } = {},
): Harness {
  const repository = new InMemoryChallengeStateRepository();
  const clock = new FixedClock(NOW);
  const environment = anAppEnvironment({
    publicCacheTtlSeconds: 60,
    storageDriver: options.storageDriver ?? 'filesystem',
  });
  const cache = new InMemoryCacheService(clock, environment);
  const synchronizer = new StubParticipantSynchronizer();
  const requestMeter = new RiotRequestMeter();

  repository.challengeState = {
    ...repository.challengeState,
    initialized: options.initialized ?? true,
  };

  return {
    repository,
    synchronizer,
    cache,
    requestMeter,
    orchestrator: new SynchronizationOrchestrator(
      repository,
      clock,
      environment,
      aChallengeConfiguration(),
      new ParticipantRegistry({ definitions: DEFINITIONS }),
      synchronizer as unknown as ParticipantSynchronizer,
      cache,
      requestMeter,
    ),
  };
}

describe('SynchronizationOrchestrator', () => {
  it('synchronizes every enabled participant and reports the run', async () => {
    const { orchestrator, synchronizer } = buildHarness();

    const report = await orchestrator.runGlobalSynchronization();

    expect(synchronizer.synchronized).toEqual(['one', 'two']);
    expect(report).toEqual(
      expect.objectContaining({
        startedAt: NOW.toISOString(),
        finishedAt: NOW.toISOString(),
        durationMs: 0,
        totalParticipants: 2,
        successfulParticipants: 2,
        failedParticipants: 0,
        skippedParticipants: 0,
        newMatchesProcessed: 4,
        errors: [],
      }),
    );
  });

  it('refuses to run when the challenge is not initialized', async () => {
    const { orchestrator, synchronizer } = buildHarness({ initialized: false });

    await expect(orchestrator.runGlobalSynchronization()).rejects.toThrow(
      ChallengeNotInitializedError,
    );
    expect(synchronizer.synchronized).toEqual([]);
  });

  it('rejects a concurrent run instead of starting a second one', async () => {
    const { orchestrator, synchronizer } = buildHarness();
    let openGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    synchronizer.onSynchronize = () => gate;

    const firstRun = orchestrator.runGlobalSynchronization();

    await expect(orchestrator.runGlobalSynchronization()).rejects.toThrow(
      SynchronizationAlreadyRunningError,
    );

    openGate();
    await firstRun;

    // Once finished, a new run is accepted again.
    synchronizer.onSynchronize = null;
    await expect(orchestrator.runGlobalSynchronization()).resolves.toEqual(
      expect.objectContaining({ totalParticipants: 2 }),
    );
  });

  it('isolates a participant failure so the rest of the roster is still synchronized', async () => {
    const { orchestrator, synchronizer } = buildHarness();
    synchronizer.failedFor.add('one');

    const report = await orchestrator.runGlobalSynchronization();

    expect(synchronizer.synchronized).toEqual(['one', 'two']);
    expect(report.successfulParticipants).toBe(1);
    expect(report.failedParticipants).toBe(1);
    expect(report.errors).toEqual([
      {
        participantId: 'one',
        code: 'RIOT_UNAVAILABLE',
        message: 'Riot is temporarily unavailable.',
      },
    ]);
  });

  it('converts an unexpected synchronizer crash into a participant failure', async () => {
    const { orchestrator, synchronizer } = buildHarness();
    synchronizer.thrownFor.add('two');

    const report = await orchestrator.runGlobalSynchronization();

    expect(report.failedParticipants).toBe(1);
    expect(report.errors[0]).toEqual(
      expect.objectContaining({ participantId: 'two', code: 'INTERNAL_SERVER_ERROR' }),
    );
  });

  it('tracks the global synchronization timestamps and clears the in-progress flag', async () => {
    const { orchestrator, repository } = buildHarness();

    await orchestrator.runGlobalSynchronization();

    expect(repository.challengeState.lastGlobalSyncAt).toBe(NOW.toISOString());
    expect(repository.challengeState.lastSuccessfulGlobalSyncAt).toBe(NOW.toISOString());
    expect(repository.challengeState.synchronizationInProgress).toBe(false);
  });

  it('does not advance the successful timestamp when a participant failed', async () => {
    const { orchestrator, repository, synchronizer } = buildHarness();
    synchronizer.failedFor.add('one');

    await orchestrator.runGlobalSynchronization();

    expect(repository.challengeState.lastGlobalSyncAt).toBe(NOW.toISOString());
    expect(repository.challengeState.lastSuccessfulGlobalSyncAt).toBeNull();
    expect(repository.challengeState.synchronizationInProgress).toBe(false);
  });

  it('invalidates the cached read models after a successful run', async () => {
    const { orchestrator, cache } = buildHarness();
    const factory = jest.fn().mockResolvedValue('value');

    await cache.getOrSet('read-model:test', factory);
    await cache.getOrSet('read-model:test', factory);
    expect(factory).toHaveBeenCalledTimes(1);

    await orchestrator.runGlobalSynchronization();

    await cache.getOrSet('read-model:test', factory);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('synchronizes a single participant on demand', async () => {
    const { orchestrator, synchronizer } = buildHarness();

    const result = await orchestrator.runParticipantSynchronization('two');

    expect(synchronizer.synchronized).toEqual(['two']);
    expect(result.participant.participantId).toBe('two');
  });

  it('reports the Riot requests consumed by a global run, per endpoint', async () => {
    const { orchestrator, synchronizer, requestMeter } = buildHarness();
    // Requests recorded before the run must not be attributed to it.
    requestMeter.record('league-v4:entries-by-puuid');
    synchronizer.onSynchronize = () => {
      requestMeter.record('league-v4:entries-by-puuid');
      requestMeter.record('match-v5:ids');
      return Promise.resolve();
    };

    const report = await orchestrator.runGlobalSynchronization();

    expect(report.riotRequests).toEqual({
      total: 4,
      byOperation: { 'league-v4:entries-by-puuid': 2, 'match-v5:ids': 2 },
    });
  });

  it('attributes the Riot requests of an isolated single participant run', async () => {
    const { orchestrator, synchronizer, requestMeter } = buildHarness();
    synchronizer.onSynchronize = () => {
      requestMeter.record('match-v5:by-id');
      return Promise.resolve();
    };

    const result = await orchestrator.runParticipantSynchronization('one');

    expect(result.riotRequests).toEqual({ total: 1, byOperation: { 'match-v5:by-id': 1 } });
  });

  it('fails with a not found error for an unknown participant', async () => {
    const { orchestrator } = buildHarness();

    await expect(orchestrator.runParticipantSynchronization('missing')).rejects.toThrow(
      ParticipantNotFoundError,
    );
  });

  it('clears a stale in-progress flag left by a previous crash while booting', async () => {
    const { orchestrator, repository } = buildHarness();
    repository.challengeState = {
      ...repository.challengeState,
      synchronizationInProgress: true,
    };

    await orchestrator.onApplicationBootstrap();

    expect(repository.challengeState.synchronizationInProgress).toBe(false);
  });

  it('keeps the persisted lock when a Vercel instance starts cold', async () => {
    const { orchestrator, repository } = buildHarness({ storageDriver: 'vercel-blob' });
    repository.challengeState = {
      ...repository.challengeState,
      synchronizationInProgress: true,
    };

    await orchestrator.onApplicationBootstrap();

    expect(repository.challengeState.synchronizationInProgress).toBe(true);
  });

  it('does not start another synchronization while the persisted lock is recent', async () => {
    const { orchestrator, repository } = buildHarness();
    repository.challengeState = {
      ...repository.challengeState,
      synchronizationInProgress: true,
      lastGlobalSyncAt: NOW.toISOString(),
    };

    await expect(orchestrator.runGlobalSynchronization()).rejects.toThrow(
      SynchronizationAlreadyRunningError,
    );
  });

  it('reports the status and the last report of this process', async () => {
    const { orchestrator } = buildHarness();

    await expect(orchestrator.status()).resolves.toEqual(
      expect.objectContaining({
        challengeInitialized: true,
        inProgress: false,
        lastReport: null,
      }),
    );

    await orchestrator.runGlobalSynchronization();

    const status = await orchestrator.status();
    expect(status.lastReport?.totalParticipants).toBe(2);
    expect(status.lastSuccessfulGlobalSyncAt).toBe(NOW.toISOString());
  });
});
