import { InMemoryCacheService } from '../../../common/cache/in-memory-cache.service';
import {
  ChallengeNotInitializedError,
  LateBaselineCaptureError,
  ParticipantNotFoundError,
} from '../../../common/exceptions/application.exceptions';
import type { ParticipantDefinition } from '../../../config/participants.config';
import {
  aBaselineRank,
  aChallengeConfiguration,
  anAppEnvironment,
  aParticipantDefinition,
  aParticipantState,
  aRankedPosition,
  FixedClock,
} from '../../../test-support/builders';
import { FakeRiotApiClient } from '../../../test-support/fake-riot-api.client';
import { InMemoryChallengeStateRepository } from '../../../test-support/in-memory-challenge-state.repository';
import { ParticipantRegistry } from '../../participants/domain/participant.registry';
import { RiotUnavailableError } from '../../riot/domain/riot.errors';
import { BaselineTimelinessPolicy } from '../domain/baseline-timeliness.policy';
import { CaptureMissingParticipantBaselinesUseCase } from './capture-missing-participant-baselines.use-case';
import { ParticipantBaselineCapturer } from './participant-baseline.capturer';

const CHALLENGE_START = '2026-08-01T00:00:00.000Z';
/** Well beyond the grace period: incorporating someone late is inherently a late capture. */
const NOW = new Date('2026-08-09T02:10:00.000Z');
const INITIALIZED_AT = '2026-08-01T00:05:00.000Z';
const EXISTING_BASELINE_AT = '2026-08-01T00:05:00.000Z';

const CHALLENGE = aChallengeConfiguration({
  startAt: CHALLENGE_START,
  lateBaselineGraceHours: 24,
});

const ACKNOWLEDGED = { acknowledgeLateBaseline: true };

interface Harness {
  readonly useCase: CaptureMissingParticipantBaselinesUseCase;
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
    useCase: new CaptureMissingParticipantBaselinesUseCase(
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

/** Reproduces the real situation: an initialized challenge with one captured participant. */
function seedInitializedChallengeWith(
  repository: InMemoryChallengeStateRepository,
  participantId: string,
): void {
  const baselineRank = aBaselineRank({
    rank: aRankedPosition({ tier: 'SILVER', division: 'II', leaguePoints: 55 }),
    capturedAt: EXISTING_BASELINE_AT,
  });

  repository.seedParticipant(aParticipantState({ participantId, baselineRank }));

  repository.challengeState = {
    ...repository.challengeState,
    initialized: true,
    initializedAt: INITIALIZED_AT,
    participants: [
      { participantId, puuid: `puuid-${participantId}`, initializedAt: EXISTING_BASELINE_AT },
    ],
  };
}

describe('CaptureMissingParticipantBaselinesUseCase', () => {
  it('refuses to run while the challenge is not initialized', async () => {
    const { useCase, repository } = buildHarness([aParticipantDefinition({ id: 'one' })]);

    await expect(useCase.execute(ACKNOWLEDGED)).rejects.toThrow(ChallengeNotInitializedError);
    expect(repository.participantStates.size).toBe(0);
  });

  it('is idempotent: with nothing pending it succeeds with zero captures', async () => {
    const { useCase, repository } = buildHarness([aParticipantDefinition({ id: 'existing' })]);
    seedInitializedChallengeWith(repository, 'existing');
    const savesBefore = repository.participantSaveCount;

    const report = await useCase.execute(ACKNOWLEDGED);

    expect(report.captured).toBe(0);
    expect(report.skipped).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.participants).toEqual([]);
    // Nothing was rewritten, not even the challenge document.
    expect(repository.participantSaveCount).toBe(savesBefore);
  });

  it('captures only the newcomer and leaves the existing baseline untouched', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'existing', gameName: 'Existing' }),
      aParticipantDefinition({ id: 'newcomer', gameName: 'Newcomer' }),
    ]);
    seedInitializedChallengeWith(repository, 'existing');
    const originalBaseline = repository.participantStates.get('existing')?.baselineRank;
    riot.register({
      gameName: 'Newcomer',
      tagLine: 'LAN',
      rank: aRankedPosition({ tier: 'GOLD' }),
    });

    const report = await useCase.execute(ACKNOWLEDGED);

    expect(report.captured).toBe(1);
    expect(report.skipped).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.participants).toEqual([
      expect.objectContaining({ participantId: 'newcomer', result: 'INITIALIZED' }),
    ]);

    expect(repository.participantStates.get('existing')?.baselineRank).toEqual(originalBaseline);
    expect(repository.participantStates.get('newcomer')?.baselineRank?.capturedAt).toBe(
      NOW.toISOString(),
    );
  });

  it('captures several newcomers in one run', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'existing', gameName: 'Existing' }),
      aParticipantDefinition({ id: 'first', gameName: 'First' }),
      aParticipantDefinition({ id: 'second', gameName: 'Second' }),
    ]);
    seedInitializedChallengeWith(repository, 'existing');
    riot.register({ gameName: 'First', tagLine: 'LAN', rank: aRankedPosition() });
    riot.register({ gameName: 'Second', tagLine: 'LAN', rank: aRankedPosition({ tier: 'GOLD' }) });

    const report = await useCase.execute(ACKNOWLEDGED);

    expect(report.captured).toBe(2);
    expect(report.skipped).toBe(1);
    expect(repository.participantStates.get('first')?.baselineRank).not.toBeNull();
    expect(repository.participantStates.get('second')?.baselineRank).not.toBeNull();
  });

  it('reports a Riot failure without preventing the rest from being incorporated', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'existing', gameName: 'Existing' }),
      aParticipantDefinition({ id: 'healthy', gameName: 'Healthy' }),
      aParticipantDefinition({ id: 'broken', gameName: 'Broken' }),
    ]);
    seedInitializedChallengeWith(repository, 'existing');
    const originalBaseline = repository.participantStates.get('existing')?.baselineRank;
    riot.register({ gameName: 'Healthy', tagLine: 'LAN', rank: aRankedPosition() });
    riot.register({ gameName: 'Broken', tagLine: 'LAN', rank: aRankedPosition() });
    riot.failAccountResolution('Broken', 'LAN', new RiotUnavailableError('account', 503));

    const report = await useCase.execute(ACKNOWLEDGED);

    expect(report.captured).toBe(1);
    expect(report.failed).toBe(1);
    expect(
      report.participants.find((outcome) => outcome.participantId === 'broken')?.error?.code,
    ).toBe('RIOT_UNAVAILABLE');

    expect(repository.participantStates.get('healthy')?.baselineRank).not.toBeNull();
    expect(repository.participantStates.has('broken')).toBe(false);
    // The failure never touched anyone else.
    expect(repository.participantStates.get('existing')?.baselineRank).toEqual(originalBaseline);
  });

  it('accepts UNRANKED as a valid baseline that is simply not computable', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'existing', gameName: 'Existing' }),
      aParticipantDefinition({ id: 'unranked', gameName: 'Unranked' }),
    ]);
    seedInitializedChallengeWith(repository, 'existing');
    riot.register({ gameName: 'Unranked', tagLine: 'LAN', rank: null });

    const report = await useCase.execute(ACKNOWLEDGED);
    const state = repository.participantStates.get('unranked');

    expect(report.captured).toBe(1);
    expect(report.failed).toBe(0);
    expect(state?.baselineRank).toEqual({ rank: null, capturedAt: NOW.toISOString() });
    expect(state?.highestObservedRank).toBeNull();
  });

  it('persists the baseline capture as the start of the rank progress only', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'existing', gameName: 'Existing' }),
      aParticipantDefinition({ id: 'newcomer', gameName: 'Newcomer' }),
    ]);
    seedInitializedChallengeWith(repository, 'existing');
    riot.register({ gameName: 'Newcomer', tagLine: 'LAN', rank: aRankedPosition() });

    const report = await useCase.execute(ACKNOWLEDGED);
    const state = repository.participantStates.get('newcomer');

    expect(state?.baselineRank?.capturedAt).toBe(NOW.toISOString());
    expect(report.participants[0]?.rankProgressStartedAt).toBe(NOW.toISOString());
    // Matches are not bounded by it: the history is swept from the challenge start on the
    // first synchronization, which is exactly what an unset coverage asks for.
    expect(state?.earliestMatchCoverageAt).toBeNull();
  });

  it('starts the newcomer progress at exactly zero', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'existing', gameName: 'Existing' }),
      aParticipantDefinition({ id: 'newcomer', gameName: 'Newcomer' }),
    ]);
    seedInitializedChallengeWith(repository, 'existing');
    const rank = aRankedPosition({ tier: 'GOLD', division: 'IV', leaguePoints: 20 });
    riot.register({ gameName: 'Newcomer', tagLine: 'LAN', rank });

    await useCase.execute(ACKNOWLEDGED);
    const state = repository.participantStates.get('newcomer');

    expect(state?.currentRank).toEqual(state?.baselineRank?.rank);
    expect(state?.highestObservedRank?.rank).toEqual(state?.baselineRank?.rank);
    expect(state?.matchStatistics.gamesPlayed).toBe(0);
    expect(state?.processedMatches).toEqual([]);
  });

  it('never modifies the global initialization flags', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'existing', gameName: 'Existing' }),
      aParticipantDefinition({ id: 'newcomer', gameName: 'Newcomer' }),
    ]);
    seedInitializedChallengeWith(repository, 'existing');
    riot.register({ gameName: 'Newcomer', tagLine: 'LAN', rank: aRankedPosition() });

    const report = await useCase.execute(ACKNOWLEDGED);

    expect(repository.challengeState.initialized).toBe(true);
    expect(repository.challengeState.initializedAt).toBe(INITIALIZED_AT);
    expect(report.baselineCoverageStartAt).toBe(INITIALIZED_AT);
    // The newcomer joins the registered roster with their own capture instant.
    expect(repository.challengeState.participants).toEqual([
      expect.objectContaining({ participantId: 'existing', initializedAt: EXISTING_BASELINE_AT }),
      expect.objectContaining({ participantId: 'newcomer', initializedAt: NOW.toISOString() }),
    ]);
  });

  it('running it twice never replaces the baseline captured by the first run', async () => {
    const { useCase, repository, riot, clock } = buildHarness([
      aParticipantDefinition({ id: 'existing', gameName: 'Existing' }),
      aParticipantDefinition({ id: 'newcomer', gameName: 'Newcomer' }),
    ]);
    seedInitializedChallengeWith(repository, 'existing');
    riot.register({ gameName: 'Newcomer', tagLine: 'LAN', rank: aRankedPosition() });

    await useCase.execute(ACKNOWLEDGED);
    const capturedBaseline = repository.participantStates.get('newcomer')?.baselineRank;

    clock.set('2026-08-20T00:00:00.000Z');
    const secondReport = await useCase.execute(ACKNOWLEDGED);

    expect(secondReport.captured).toBe(0);
    expect(secondReport.skipped).toBe(2);
    expect(repository.participantStates.get('newcomer')?.baselineRank).toEqual(capturedBaseline);
  });

  it('demands an explicit acknowledgement when the capture is late', async () => {
    const { useCase, repository, riot } = buildHarness([
      aParticipantDefinition({ id: 'existing', gameName: 'Existing' }),
      aParticipantDefinition({ id: 'newcomer', gameName: 'Newcomer' }),
    ]);
    seedInitializedChallengeWith(repository, 'existing');
    riot.register({ gameName: 'Newcomer', tagLine: 'LAN', rank: aRankedPosition() });

    await expect(useCase.execute({ acknowledgeLateBaseline: false })).rejects.toThrow(
      LateBaselineCaptureError,
    );
    expect(repository.participantStates.has('newcomer')).toBe(false);
  });

  it('does not demand an acknowledgement when there is nothing pending', async () => {
    const { useCase, repository } = buildHarness([aParticipantDefinition({ id: 'existing' })]);
    seedInitializedChallengeWith(repository, 'existing');

    await expect(useCase.execute({ acknowledgeLateBaseline: false })).resolves.toMatchObject({
      captured: 0,
      skipped: 1,
      failed: 0,
    });
  });

  describe('single participant scope', () => {
    it('captures only the requested participant', async () => {
      const { useCase, repository, riot } = buildHarness([
        aParticipantDefinition({ id: 'existing', gameName: 'Existing' }),
        aParticipantDefinition({ id: 'first', gameName: 'First' }),
        aParticipantDefinition({ id: 'second', gameName: 'Second' }),
      ]);
      seedInitializedChallengeWith(repository, 'existing');
      riot.register({ gameName: 'First', tagLine: 'LAN', rank: aRankedPosition() });
      riot.register({ gameName: 'Second', tagLine: 'LAN', rank: aRankedPosition() });

      const report = await useCase.execute({ ...ACKNOWLEDGED, participantId: 'first' });

      expect(report.captured).toBe(1);
      expect(repository.participantStates.has('first')).toBe(true);
      expect(repository.participantStates.has('second')).toBe(false);
    });

    it('rejects an unknown or disabled participant', async () => {
      const { useCase, repository } = buildHarness([
        aParticipantDefinition({ id: 'existing', gameName: 'Existing' }),
        aParticipantDefinition({ id: 'disabled', gameName: 'Disabled', enabled: false }),
      ]);
      seedInitializedChallengeWith(repository, 'existing');

      await expect(useCase.execute({ ...ACKNOWLEDGED, participantId: 'ghost' })).rejects.toThrow(
        ParticipantNotFoundError,
      );
      await expect(useCase.execute({ ...ACKNOWLEDGED, participantId: 'disabled' })).rejects.toThrow(
        ParticipantNotFoundError,
      );
    });
  });
});
