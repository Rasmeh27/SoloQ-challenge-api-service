import { MILLISECONDS_PER_MINUTE } from '../../../common/time/time.constants';
import {
  aBaselineRank,
  aChallengeConfiguration,
  aParticipantDefinition,
  aParticipantState,
  aRankedPosition,
  FixedClock,
} from '../../../test-support/builders';
import { ParticipantViewFactory } from './participant-view.factory';

const NOW = new Date('2026-08-06T12:00:00.000Z');
const CHALLENGE = aChallengeConfiguration({ syncIntervalMinutes: 5 });

function factoryAt(instant: Date = NOW): ParticipantViewFactory {
  return new ParticipantViewFactory(new FixedClock(instant), CHALLENGE);
}

describe('ParticipantViewFactory', () => {
  it('derives PENDING_INITIALIZATION for a participant added after the challenge started', () => {
    const view = factoryAt().build(aParticipantDefinition(), null, true);

    expect(view.syncStatus).toBe('PENDING_INITIALIZATION');
    expect(view.progress.status).toBe('BASELINE_NOT_INITIALIZED');
    expect(view.progress.units).toBeNull();
    expect(view.dataFreshness).toBe('NEVER_SYNCED');
    expect(view.statistics.gamesPlayed).toBe(0);
  });

  it('reports NEVER_SYNCED while the challenge is not initialized', () => {
    const view = factoryAt().build(aParticipantDefinition(), null, false);

    expect(view.syncStatus).toBe('NEVER_SYNCED');
  });

  it('derives STALE when the last successful synchronization is too old', () => {
    const state = aParticipantState({
      lastSuccessfulSyncAt: new Date(NOW.getTime() - 60 * MILLISECONDS_PER_MINUTE).toISOString(),
      syncStatus: 'SUCCESS',
    });

    const view = factoryAt().build(aParticipantDefinition(), state, true);

    expect(view.dataFreshness).toBe('STALE');
    expect(view.syncStatus).toBe('STALE');
  });

  it('keeps FRESH data as reported by the stored status', () => {
    const state = aParticipantState({
      lastSuccessfulSyncAt: new Date(NOW.getTime() - MILLISECONDS_PER_MINUTE).toISOString(),
      syncStatus: 'SUCCESS',
    });

    const view = factoryAt().build(aParticipantDefinition(), state, true);

    expect(view.dataFreshness).toBe('FRESH');
    expect(view.syncStatus).toBe('SUCCESS');
  });

  it('never masks a FAILED status behind staleness', () => {
    const state = aParticipantState({
      lastSuccessfulSyncAt: new Date(NOW.getTime() - 60 * MILLISECONDS_PER_MINUTE).toISOString(),
      syncStatus: 'FAILED',
    });

    expect(factoryAt().build(aParticipantDefinition(), state, true).syncStatus).toBe('FAILED');
  });

  it('prefers the stored Riot ID because Riot IDs can be renamed', () => {
    const state = aParticipantState({
      resolvedAccount: {
        puuid: 'puuid-player-one',
        gameName: 'RenamedPlayer',
        tagLine: 'LAS',
        platform: 'LA1',
        resolvedAt: '2026-08-06T12:00:00.000Z',
      },
    });

    const view = factoryAt().build(
      aParticipantDefinition({ gameName: 'PlayerOne', tagLine: 'LAN' }),
      state,
      true,
    );

    expect(view.gameName).toBe('RenamedPlayer');
    expect(view.tagLine).toBe('LAS');
    expect(view.riotId).toBe('RenamedPlayer#LAS');
  });

  it('computes the progress from the stored baseline and current rank', () => {
    const state = aParticipantState({
      baselineRank: aBaselineRank({
        rank: aRankedPosition({ tier: 'GOLD', division: 'IV', leaguePoints: 0 }),
      }),
      currentRank: aRankedPosition({ tier: 'GOLD', division: 'III', leaguePoints: 50 }),
    });

    const view = factoryAt().build(aParticipantDefinition(), state, true);

    expect(view.progress.units).toBe(150);
    expect(view.progress.status).toBe('CALCULATED');
  });

  it('builds views for a whole roster, matching states by participant id', () => {
    const views = factoryAt().buildAll(
      [
        aParticipantDefinition({ id: 'one', gameName: 'One' }),
        aParticipantDefinition({ id: 'two', gameName: 'Two' }),
      ],
      [aParticipantState({ participantId: 'two' })],
      true,
    );

    expect(views.map((view) => view.definition.id)).toEqual(['one', 'two']);
    expect(views[0].state).toBeNull();
    expect(views[1].state).not.toBeNull();
  });
});
