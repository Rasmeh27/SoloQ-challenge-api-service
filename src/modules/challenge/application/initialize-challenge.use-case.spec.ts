import { InMemoryCacheService } from '../../../common/cache/in-memory-cache.service';
import {
  ChallengeAlreadyInitializedError,
  LateBaselineCaptureError,
} from '../../../common/exceptions/application.exceptions';
import type { ParticipantDefinition } from '../../../config/participants.config';
import {
  aChallengeConfiguration,
  anAppEnvironment,
  aParticipantDefinition,
  aRankedPosition,
  FixedClock,
} from '../../../test-support/builders';
import { FakeRiotApiClient } from '../../../test-support/fake-riot-api.client';
import { InMemoryChallengeStateRepository } from '../../../test-support/in-memory-challenge-state.repository';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import { RiotUnavailableError } from '../../riot/domain/riot.errors';
import { BaselineTimelinessPolicy } from '../domain/baseline-timeliness.policy';
import { InitializeChallengeUseCase } from './initialize-challenge.use-case';
import { ParticipantBaselineCapturer } from './participant-baseline.capturer';

const CHALLENGE_START = '2026-08-01T00:00:00.000Z';
const NOW = new Date('2026-08-01T00:05:00.000Z');
const CHALLENGE = aChallengeConfiguration({
  startAt: CHALLENGE_START,
  lateBaselineGraceHours: 24,
});

interface Harness {
  readonly useCase: InitializeChallengeUseCase;
  readonly repository: InMemoryChallengeStateRepository;
  readonly riot: FakeRiotApiClient;
  readonly clock: FixedClock;
}

function buildHarness(definitions: readonly ParticipantDefinition[]): Harness {
  const repository = new InMemoryChallengeStateRepository();
  const riot = new FakeRiotApiClient();
  const clock = new FixedClock(NOW);
  const environment = anAppEnvironment();

  const registry = new ParticipantRegistry({ definitions });

  return {
    repository,
    riot,
    clock,
    useCase: new InitializeChallengeUseCase(
      repository,
      clock,
      environment,
      CHALLENGE,
      registry,
      new ParticipantBaselineCapturer(repository, riot, clock, CHALLENGE, registry),
      new BaselineTimelinessPolicy(CHALLENGE),
      new InMemoryCacheService(clock, environment),
    ),
  };
}

const ON_TIME = { acknowledgeLateBaseline: false };

describe('InitializeChallengeUseCase', () => {
  it('captures the baseline of every enabled participant and marks the challenge initialized', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'one', gameName: 'One' }),
      aParticipantDefinition({ id: 'two', gameName: 'Two' }),
    ]);
    riot.register({ gameName: 'One', tagLine: 'LAN', rank: aRankedPosition() });
    riot.register({ gameName: 'Two', tagLine: 'LAN', rank: aRankedPosition({ tier: 'GOLD' }) });

    const report = await useCase.execute(ON_TIME);

    expect(report.initialized).toBe(true);
    expect(report.totalParticipants).toBe(2);
    expect(report.successfulParticipants).toBe(2);
    expect(report.failedParticipants).toBe(0);
    expect(report.participants.map((outcome) => outcome.result)).toEqual([
      'INITIALIZED',
      'INITIALIZED',
    ]);

    expect(repository.challengeState.initialized).toBe(true);
    expect(repository.challengeState.initializedAt).toBe(NOW.toISOString());
    expect(repository.challengeState.participants.map((entry) => entry.participantId)).toEqual([
      'one',
      'two',
    ]);
  });

  it('stores the captured baseline, a first snapshot and an empty match history', async () => {
    const { useCase, repository, riot } = buildHarness([aParticipantDefinition({ id: 'one' })]);
    riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', rank: aRankedPosition() });

    await useCase.execute(ON_TIME);
    const state = repository.participantStates.get('one');

    expect(state?.baselineRank).toEqual({ rank: aRankedPosition(), capturedAt: NOW.toISOString() });
    expect(state?.highestObservedRank).toEqual({
      rank: aRankedPosition(),
      observedAt: NOW.toISOString(),
    });
    expect(state?.rankSnapshots).toHaveLength(1);
    expect(state?.processedMatches).toEqual([]);
    expect(state?.matchStatistics.gamesPlayed).toBe(0);
    expect(state?.syncStatus).toBe('PENDING');
    expect(state?.lastSuccessfulSyncAt).toBeNull();
    expect(state?.profileIconId).toBe(1_234);
    expect(state?.summonerLevel).toBe(350);
  });

  it('leaves the match coverage unswept so the first synchronization backfills it', async () => {
    const { useCase, repository, riot } = buildHarness([aParticipantDefinition({ id: 'one' })]);
    riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', rank: aRankedPosition() });

    await useCase.execute(ON_TIME);

    expect(repository.participantStates.get('one')?.earliestMatchCoverageAt).toBeNull();
  });

  it('accepts UNRANKED participants as a valid baseline', async () => {
    const { useCase, repository, riot } = buildHarness([aParticipantDefinition({ id: 'one' })]);
    riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', rank: null });

    const report = await useCase.execute(ON_TIME);

    expect(report.initialized).toBe(true);
    expect(repository.participantStates.get('one')?.baselineRank).toEqual({
      rank: null,
      capturedAt: NOW.toISOString(),
    });
    expect(repository.participantStates.get('one')?.highestObservedRank).toBeNull();
  });

  it('ignores disabled participants', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'one', gameName: 'One' }),
      aParticipantDefinition({ id: 'two', gameName: 'Two', enabled: false }),
    ]);
    riot.register({ gameName: 'One', tagLine: 'LAN', rank: aRankedPosition() });

    const report = await useCase.execute(ON_TIME);

    expect(report.initialized).toBe(true);
    expect(report.totalParticipants).toBe(1);
    expect(repository.participantStates.has('two')).toBe(false);
  });

  it('rejects a second initialization with a conflict', async () => {
    const { useCase, riot } = buildHarness([aParticipantDefinition({ id: 'one' })]);
    riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', rank: aRankedPosition() });

    await useCase.execute(ON_TIME);

    await expect(useCase.execute(ON_TIME)).rejects.toThrow(ChallengeAlreadyInitializedError);
  });

  it('does not mark the challenge as initialized when a Riot ID cannot be resolved', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'one', gameName: 'One' }),
      aParticipantDefinition({ id: 'two', gameName: 'Missing' }),
    ]);
    riot.register({ gameName: 'One', tagLine: 'LAN', rank: aRankedPosition() });

    const report = await useCase.execute(ON_TIME);

    const failedOutcome = report.participants.find((outcome) => outcome.participantId === 'two');

    expect(report.initialized).toBe(false);
    expect(report.failedParticipants).toBe(1);
    expect(failedOutcome?.result).toBe('FAILED');
    expect(failedOutcome?.baselineRank).toBeNull();
    expect(failedOutcome?.error?.code).toBe('RIOT_ACCOUNT_NOT_FOUND');
    expect(repository.challengeState.initialized).toBe(false);
    expect(repository.challengeState.initializedAt).toBeNull();
  });

  it('is idempotent: a retry keeps existing baselines and only resolves the missing ones', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'one', gameName: 'One' }),
      aParticipantDefinition({ id: 'two', gameName: 'Two' }),
    ]);
    riot.register({ gameName: 'One', tagLine: 'LAN', rank: aRankedPosition() });
    riot.register({ gameName: 'Two', tagLine: 'LAN', rank: aRankedPosition({ tier: 'GOLD' }) });
    riot.failAccountResolution('Two', 'LAN', new RiotUnavailableError('account', 503));

    const firstReport = await useCase.execute(ON_TIME);
    const baselineOfOne = repository.participantStates.get('one')?.baselineRank;

    expect(firstReport.initialized).toBe(false);
    expect(baselineOfOne).not.toBeUndefined();

    // Riot recovers and the roster is retried.
    riot.clearAccountResolutionFailure('Two', 'LAN');

    const secondReport = await useCase.execute(ON_TIME);

    expect(secondReport.initialized).toBe(true);
    expect(secondReport.participants).toEqual([
      expect.objectContaining({ participantId: 'one', result: 'ALREADY_INITIALIZED' }),
      expect.objectContaining({ participantId: 'two', result: 'INITIALIZED' }),
    ]);
    // The baseline captured in the first run was not replaced.
    expect(repository.participantStates.get('one')?.baselineRank).toEqual(baselineOfOne);
    expect(repository.challengeState.initialized).toBe(true);
  });

  describe('baseline coverage', () => {
    it('reports the instant from which progress is measured, not the challenge start', async () => {
      const { useCase, riot } = buildHarness([aParticipantDefinition({ id: 'one' })]);
      riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', rank: aRankedPosition() });

      const report = await useCase.execute(ON_TIME);

      expect(report.challengeStartAt).toBe(CHALLENGE_START);
      expect(report.baselineCoverageStartAt).toBe(NOW.toISOString());
      expect(report.baselineCoverageStartAt).not.toBe(report.challengeStartAt);
    });

    it('leaves the coverage undefined when the challenge could not be initialized', async () => {
      const { useCase } = buildHarness([aParticipantDefinition({ id: 'missing' })]);

      const report = await useCase.execute(ON_TIME);

      expect(report.initialized).toBe(false);
      expect(report.baselineCoverageStartAt).toBeNull();
    });

    it('refuses to capture a baseline long after the challenge started', async () => {
      const { useCase, repository, clock, riot } = buildHarness([
        aParticipantDefinition({ id: 'one' }),
      ]);
      riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', rank: aRankedPosition() });
      // Two days after startAt, well beyond the 24h grace period.
      clock.set('2026-08-03T00:00:00.000Z');

      await expect(useCase.execute(ON_TIME)).rejects.toThrow(LateBaselineCaptureError);
      expect(repository.participantStates.size).toBe(0);
      expect(repository.challengeState.initialized).toBe(false);
    });

    it('proceeds when the administrator acknowledges the late capture explicitly', async () => {
      const { useCase, repository, clock, riot } = buildHarness([
        aParticipantDefinition({ id: 'one' }),
      ]);
      riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', rank: aRankedPosition() });
      clock.set('2026-08-03T00:00:00.000Z');

      const report = await useCase.execute({ acknowledgeLateBaseline: true });

      expect(report.initialized).toBe(true);
      expect(report.baselineCoverageStartAt).toBe('2026-08-03T00:00:00.000Z');
      expect(repository.participantStates.get('one')?.baselineRank?.capturedAt).toBe(
        '2026-08-03T00:00:00.000Z',
      );
    });

    it('still refuses to replace an existing baseline, acknowledged or not', async () => {
      const { useCase, repository, clock, riot } = buildHarness([
        aParticipantDefinition({ id: 'one' }),
      ]);
      riot.register({ gameName: 'PlayerOne', tagLine: 'LAN', rank: aRankedPosition() });

      await useCase.execute(ON_TIME);
      const originalBaseline = repository.participantStates.get('one')?.baselineRank;
      clock.set('2026-08-10T00:00:00.000Z');

      await expect(useCase.execute({ acknowledgeLateBaseline: true })).rejects.toThrow(
        ChallengeAlreadyInitializedError,
      );
      expect(repository.participantStates.get('one')?.baselineRank).toEqual(originalBaseline);
    });
  });

  it('does not initialize an empty roster', async () => {
    const { useCase, repository } = buildHarness([]);

    const report = await useCase.execute(ON_TIME);

    expect(report.initialized).toBe(false);
    expect(report.totalParticipants).toBe(0);
    expect(repository.challengeState.initialized).toBe(false);
  });
});
