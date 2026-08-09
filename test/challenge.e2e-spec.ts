import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { applyPlatformConfiguration, setupSwagger } from '../src/bootstrap';
import { INTERNAL_API_KEY_HEADER } from '../src/common/guards/internal-api-key.guard';
import { REQUEST_ID_HEADER } from '../src/common/http/request-context';
import { challengeConfig } from '../src/config/challenge.config';
import { type AppEnvironment, environmentConfig } from '../src/config/environment.config';
import { participantsConfig, type ParticipantDefinition } from '../src/config/participants.config';
import { RIOT_API_CLIENT } from '../src/modules/riot/domain/riot-api.client';
import {
  aChallengeConfiguration,
  aProcessedMatch,
  aRankedPosition,
} from '../src/test-support/builders';
import { FakeRiotApiClient } from '../src/test-support/fake-riot-api.client';

const ADMIN_KEY = 'e2e-administrative-key-long-enough';
const MILLISECONDS_PER_DAY = 86_400_000;
const NOW = Date.now();

const PARTICIPANTS: readonly ParticipantDefinition[] = [
  { id: 'player-one', gameName: 'PlayerOne', tagLine: 'LAN', platform: 'LA1', enabled: true },
  { id: 'player-two', gameName: 'PlayerTwo', tagLine: 'LAN', platform: 'LA1', enabled: true },
  { id: 'player-off', gameName: 'PlayerOff', tagLine: 'LAN', platform: 'LA1', enabled: false },
];

const CHALLENGE = aChallengeConfiguration({
  id: 'e2e-challenge',
  startAt: new Date(NOW - 30 * MILLISECONDS_PER_DAY).toISOString(),
  endAt: new Date(NOW + 30 * MILLISECONDS_PER_DAY).toISOString(),
});

function matchAt(
  matchId: string,
  daysAgo: number,
  win: boolean,
): ReturnType<typeof aProcessedMatch> {
  const startedAt = NOW - daysAgo * MILLISECONDS_PER_DAY;

  return aProcessedMatch({
    matchId,
    gameCreation: startedAt,
    gameStartTimestamp: startedAt,
    gameEndTimestamp: startedAt + 1_800_000,
    win,
  });
}

/** Supertest exposes `body` as `any`; this keeps the assertions typed. */
function bodyOf<T>(response: request.Response): T {
  return response.body as T;
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details: Record<string, unknown> | null;
  timestamp: string;
  path: string | null;
  requestId: string | null;
}

describe('SoloQ Challenge API (e2e)', () => {
  let application: NestExpressApplication;
  let dataDirectory: string;
  const riot = new FakeRiotApiClient();

  async function createApplication(): Promise<NestExpressApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RIOT_API_CLIENT)
      .useValue(riot)
      .overrideProvider(participantsConfig.KEY)
      .useValue({ definitions: PARTICIPANTS })
      .overrideProvider(challengeConfig.KEY)
      .useValue(CHALLENGE)
      .compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>();
    applyPlatformConfiguration(app, app.get<AppEnvironment>(environmentConfig.KEY));
    setupSwagger(app);
    await app.init();

    return app;
  }

  function server(): ReturnType<typeof request> {
    return request(application.getHttpServer());
  }

  beforeAll(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'soloq-e2e-'));

    process.env.NODE_ENV = 'test';
    process.env.CHALLENGE_DATA_DIR = dataDirectory;
    process.env.ADMIN_INTERNAL_API_KEY = ADMIN_KEY;
    process.env.RIOT_API_KEY = 'RGAPI-00000000-0000-0000-0000-000000000000';
    process.env.SYNC_ENABLED = 'false';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.PUBLIC_CACHE_TTL_SECONDS = '0';
    process.env.PUBLIC_RATE_LIMIT = '2000';
    process.env.LOG_LEVEL = 'error';

    riot.register({
      gameName: 'PlayerOne',
      tagLine: 'LAN',
      rank: aRankedPosition({ tier: 'EMERALD', division: 'I', leaguePoints: 72 }),
      matches: [matchAt('LA1_1', 3, true), matchAt('LA1_2', 2, false), matchAt('LA1_3', 1, true)],
    });
    riot.register({
      gameName: 'PlayerTwo',
      tagLine: 'LAN',
      rank: null,
      matches: [matchAt('LA1_4', 1, true)],
    });
    riot.register({ gameName: 'PlayerOff', tagLine: 'LAN', rank: aRankedPosition() });

    application = await createApplication();
  }, 60_000);

  afterAll(async () => {
    await application.close();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  describe('GET /api/v1/health', () => {
    it('reports the local state without calling Riot', async () => {
      const response = await server().get('/api/v1/health').expect(200);
      const body = bodyOf<{
        status: string;
        storageWritable: boolean;
        challengeInitialized: boolean;
        riotApiConfigured: boolean;
        environment: string;
        uptime: number;
      }>(response);

      expect(body.status).toBe('ok');
      expect(body.storageWritable).toBe(true);
      expect(body.challengeInitialized).toBe(false);
      expect(body.riotApiConfigured).toBe(true);
      expect(body.environment).toBe('test');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(response.headers[REQUEST_ID_HEADER]).toBeDefined();
    });
  });

  describe('GET /api/v1/challenge', () => {
    it('is DRAFT before the challenge is initialized', async () => {
      const body = bodyOf<{
        status: string;
        initialized: boolean;
        leader: unknown;
        legalDisclaimer: string;
        challenge: { queueId: number; platform: string; regionalRoute: string };
      }>(await server().get('/api/v1/challenge').expect(200));

      expect(body.status).toBe('DRAFT');
      expect(body.initialized).toBe(false);
      expect(body.leader).toBeNull();
      expect(body.challenge.queueId).toBe(420);
      expect(body.challenge.platform).toBe('LA1');
      expect(body.challenge.regionalRoute).toBe('AMERICAS');
      expect(body.legalDisclaimer).toContain('Riot Games');
    });
  });

  describe('GET /api/v1/leaderboard', () => {
    it('serves enabled participants with a non computable progress before initialization', async () => {
      const body = bodyOf<{
        data: { participantId: string; progress: { units: number | null; status: string } }[];
        meta: { total: number; limit: number; offset: number; dataFreshness: string };
      }>(await server().get('/api/v1/leaderboard').expect(200));

      expect(body.data).toHaveLength(2);
      expect(body.data.map((entry) => entry.participantId).sort()).toEqual([
        'player-one',
        'player-two',
      ]);
      expect(body.data[0].progress.units).toBeNull();
      expect(body.data[0].progress.status).toBe('BASELINE_NOT_INITIALIZED');
      expect(body.meta).toEqual(
        expect.objectContaining({ total: 2, limit: 50, offset: 0, dataFreshness: 'NEVER_SYNCED' }),
      );
    });

    it('validates the query parameters', async () => {
      const tooSmall = bodyOf<ErrorBody>(
        await server().get('/api/v1/leaderboard?limit=0').expect(400),
      );
      expect(tooSmall.code).toBe('VALIDATION_FAILED');

      const tooLarge = bodyOf<ErrorBody>(
        await server().get('/api/v1/leaderboard?limit=500').expect(400),
      );
      expect(tooLarge.code).toBe('VALIDATION_FAILED');

      const unknownParameter = bodyOf<ErrorBody>(
        await server().get('/api/v1/leaderboard?unexpected=1').expect(400),
      );
      expect(unknownParameter.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/v1/participants', () => {
    it('lists only the enabled participants', async () => {
      const body = bodyOf<{ data: { participantId: string; enabled: boolean }[]; total: number }>(
        await server().get('/api/v1/participants').expect(200),
      );

      expect(body.total).toBe(2);
      expect(body.data.every((participant) => participant.enabled)).toBe(true);
    });

    it('returns the consistent error contract for an unknown participant', async () => {
      const body = bodyOf<ErrorBody>(await server().get('/api/v1/participants/ghost').expect(404));

      expect(body).toEqual(
        expect.objectContaining({
          statusCode: 404,
          code: 'PARTICIPANT_NOT_FOUND',
          message: 'Participant was not found',
          details: { participantId: 'ghost' },
          path: '/api/v1/participants/ghost',
        }),
      );
      expect(body.requestId).not.toBeNull();
      expect(Date.parse(body.timestamp)).not.toBeNaN();
    });
  });

  describe('POST /api/v1/admin/challenge/initialize', () => {
    it('rejects a request without the administrative API key', async () => {
      const body = bodyOf<ErrorBody>(
        await server().post('/api/v1/admin/challenge/initialize').expect(401),
      );

      expect(body.code).toBe('INVALID_INTERNAL_API_KEY');
    });

    it('rejects a request with a wrong administrative API key', async () => {
      const body = bodyOf<ErrorBody>(
        await server()
          .post('/api/v1/admin/challenge/initialize')
          .set(INTERNAL_API_KEY_HEADER, 'not-the-key')
          .expect(401),
      );

      expect(body.code).toBe('INVALID_INTERNAL_API_KEY');
    });

    it('refuses to capture a late baseline without an explicit acknowledgement', async () => {
      // The challenge under test started 30 days ago, far beyond the grace period.
      const body = bodyOf<ErrorBody>(
        await server()
          .post('/api/v1/admin/challenge/initialize')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .expect(409),
      );

      expect(body.code).toBe('CHALLENGE_LATE_BASELINE_CAPTURE');
      expect(body.details).toEqual(
        expect.objectContaining({ challengeStartAt: CHALLENGE.startAt, graceHours: 24 }),
      );
    });

    it('rejects an unknown field in the request body', async () => {
      await server()
        .post('/api/v1/admin/challenge/initialize')
        .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
        .send({ force: true })
        .expect(400);
    });

    it('captures the baselines with a valid administrative API key', async () => {
      const body = bodyOf<{
        challengeId: string;
        initialized: boolean;
        challengeStartAt: string;
        baselineCoverageStartAt: string | null;
        totalParticipants: number;
        successfulParticipants: number;
        failedParticipants: number;
        participants: { participantId: string; result: string; baselineRank: unknown }[];
      }>(
        await server()
          .post('/api/v1/admin/challenge/initialize')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .send({ acknowledgeLateBaseline: true })
          .expect(200),
      );

      expect(body.challengeId).toBe('e2e-challenge');
      expect(body.initialized).toBe(true);
      // Progress is measured from the capture, never retroactively from startAt.
      expect(body.challengeStartAt).toBe(CHALLENGE.startAt);
      expect(body.baselineCoverageStartAt).not.toBeNull();
      expect(Date.parse(body.baselineCoverageStartAt ?? '')).toBeGreaterThan(
        Date.parse(body.challengeStartAt),
      );
      expect(body.totalParticipants).toBe(2);
      expect(body.successfulParticipants).toBe(2);
      expect(body.failedParticipants).toBe(0);
      expect(body.participants.map((outcome) => outcome.result)).toEqual([
        'INITIALIZED',
        'INITIALIZED',
      ]);
    });

    it('is idempotent and answers 409 once initialized', async () => {
      const body = bodyOf<ErrorBody>(
        await server()
          .post('/api/v1/admin/challenge/initialize')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .send({ acknowledgeLateBaseline: true })
          .expect(409),
      );

      expect(body.code).toBe('CHALLENGE_ALREADY_INITIALIZED');
    });

    it('turns the challenge ACTIVE and exposes the baseline coverage', async () => {
      const body = bodyOf<{
        status: string;
        initialized: boolean;
        initializedAt: string | null;
        baselineCoverageStartAt: string | null;
      }>(await server().get('/api/v1/challenge').expect(200));

      expect(body.status).toBe('ACTIVE');
      expect(body.initialized).toBe(true);
      expect(body.initializedAt).not.toBeNull();
      expect(body.baselineCoverageStartAt).toBe(body.initializedAt);
    });
  });

  describe('POST /api/v1/admin/challenge/baselines/capture-missing', () => {
    interface CaptureBody {
      readonly captured: number;
      readonly skipped: number;
      readonly failed: number;
      readonly baselineCoverageStartAt: string | null;
      readonly participants: { participantId: string; result: string }[];
    }

    it('requires the administrative API key', async () => {
      const body = bodyOf<ErrorBody>(
        await server().post('/api/v1/admin/challenge/baselines/capture-missing').expect(401),
      );

      expect(body.code).toBe('INVALID_INTERNAL_API_KEY');
    });

    it('is idempotent: answers 200 with zero captures instead of a conflict', async () => {
      const initializedAt = bodyOf<{ initializedAt: string | null }>(
        await server().get('/api/v1/challenge').expect(200),
      ).initializedAt;

      const body = bodyOf<CaptureBody>(
        await server()
          .post('/api/v1/admin/challenge/baselines/capture-missing')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .send({ acknowledgeLateBaseline: true })
          .expect(200),
      );

      expect(body.captured).toBe(0);
      // Both enabled participants already had a baseline; the disabled one is ignored.
      expect(body.skipped).toBe(2);
      expect(body.failed).toBe(0);
      expect(body.participants).toEqual([]);
      // A late incorporation never moves the global coverage of the challenge.
      expect(body.baselineCoverageStartAt).toBe(initializedAt);
    });

    it('keeps the challenge initialized and its coverage untouched', async () => {
      const body = bodyOf<{ initialized: boolean; baselineCoverageStartAt: string | null }>(
        await server().get('/api/v1/challenge').expect(200),
      );

      expect(body.initialized).toBe(true);
      expect(body.baselineCoverageStartAt).not.toBeNull();
    });
  });

  describe('POST /api/v1/admin/participants/:participantId/baseline', () => {
    it('requires the administrative API key', async () => {
      await server().post('/api/v1/admin/participants/player-one/baseline').expect(401);
    });

    it('never recaptures the baseline of a participant that already has one', async () => {
      const body = bodyOf<{ captured: number; skipped: number; failed: number }>(
        await server()
          .post('/api/v1/admin/participants/player-one/baseline')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .send({ acknowledgeLateBaseline: true })
          .expect(200),
      );

      expect(body).toMatchObject({ captured: 0, skipped: 1, failed: 0 });
    });

    it('rejects a participant that is not part of the challenge', async () => {
      const body = bodyOf<ErrorBody>(
        await server()
          .post('/api/v1/admin/participants/ghost/baseline')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .send({ acknowledgeLateBaseline: true })
          .expect(404),
      );

      expect(body.code).toBe('PARTICIPANT_NOT_FOUND');
    });
  });

  describe('POST /api/v1/admin/synchronization/run', () => {
    it('requires the administrative API key', async () => {
      await server().post('/api/v1/admin/synchronization/run').expect(401);
    });

    it('downloads the Ranked Solo matches of the period', async () => {
      const body = bodyOf<{
        totalParticipants: number;
        successfulParticipants: number;
        failedParticipants: number;
        newMatchesProcessed: number;
        riotRequests: { total: number; byOperation: Record<string, number> };
        errors: unknown[];
      }>(
        await server()
          .post('/api/v1/admin/synchronization/run')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .expect(200),
      );

      expect(body.totalParticipants).toBe(2);
      expect(body.successfulParticipants).toBe(2);
      expect(body.failedParticipants).toBe(0);
      expect(body.newMatchesProcessed).toBe(4);
      expect(body.errors).toEqual([]);
      // The Riot budget is always reported. It is zero here because the HTTP client is
      // replaced by a test double, so no request leaves the process.
      expect(body.riotRequests).toEqual({ total: 0, byOperation: {} });
    });

    it('does not download the same match twice on a second run', async () => {
      const body = bodyOf<{ newMatchesProcessed: number }>(
        await server()
          .post('/api/v1/admin/synchronization/run')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .expect(200),
      );

      expect(body.newMatchesProcessed).toBe(0);
    });

    it('exposes the synchronization status', async () => {
      const body = bodyOf<{
        challengeInitialized: boolean;
        inProgress: boolean;
        lastSuccessfulGlobalSyncAt: string | null;
        lastReport: { totalParticipants: number } | null;
      }>(
        await server()
          .get('/api/v1/admin/synchronization/status')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .expect(200),
      );

      expect(body.challengeInitialized).toBe(true);
      expect(body.inProgress).toBe(false);
      expect(body.lastSuccessfulGlobalSyncAt).not.toBeNull();
      expect(body.lastReport?.totalParticipants).toBe(2);
    });

    it('synchronizes a single participant and attributes its Riot budget', async () => {
      const body = bodyOf<{
        participant: { participantId: string; status: string };
        riotRequests: { total: number };
      }>(
        await server()
          .post('/api/v1/admin/synchronization/participants/player-one')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .expect(200),
      );

      expect(body.participant).toEqual(
        expect.objectContaining({ participantId: 'player-one', status: 'SUCCESS' }),
      );
      expect(body.riotRequests.total).toBe(0);
    });

    it('answers 404 for an unknown participant', async () => {
      await server()
        .post('/api/v1/admin/synchronization/participants/ghost')
        .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
        .expect(404);
    });
  });

  describe('participant read endpoints after synchronization', () => {
    it('returns the full profile with progress and event statistics', async () => {
      const body = bodyOf<{
        participantId: string;
        riotId: string;
        currentRank: { tier: string; displayName: string } | null;
        baselineRank: { tier: string | null; capturedAt: string } | null;
        highestObservedRank: { tier: string } | null;
        progress: { units: number | null; status: string; label: string; isApproximation: boolean };
        eventStatistics: { gamesPlayed: number; wins: number; losses: number; winRate: number };
        processedMatchesCount: number;
        recentMatches: { matchId: string }[];
        syncStatus: string;
        dataFreshness: string;
        rankProgressStartedAt: string | null;
      }>(await server().get('/api/v1/participants/player-one').expect(200));

      expect(body.riotId).toBe('PlayerOne#LAN');
      expect(body.currentRank?.displayName).toBe('Emerald I · 72 LP');
      expect(body.baselineRank?.tier).toBe('EMERALD');
      expect(body.highestObservedRank?.tier).toBe('EMERALD');
      expect(body.progress).toEqual({
        units: 0,
        status: 'CALCULATED',
        label: 'Puntos de progreso',
        isApproximation: true,
      });
      expect(body.eventStatistics).toEqual(
        expect.objectContaining({ gamesPlayed: 3, wins: 2, losses: 1, winRate: 66.7 }),
      );
      expect(body.processedMatchesCount).toBe(3);
      expect(body.recentMatches).toHaveLength(3);
      expect(body.syncStatus).toBe('SUCCESS');
      expect(body.dataFreshness).toBe('FRESH');
      // Rank progress starts at the effective baseline capture of this participant.
      // Matches are not bounded by it: they cover the whole challenge period.
      expect(body.rankProgressStartedAt).toBe(body.baselineRank?.capturedAt);
    });

    it('reports CURRENTLY_UNRANKED progress without turning it into zero', async () => {
      const body = bodyOf<{
        currentRank: unknown;
        progress: { units: number | null; status: string };
      }>(await server().get('/api/v1/participants/player-two').expect(200));

      expect(body.currentRank).toBeNull();
      expect(body.progress.units).toBeNull();
      expect(body.progress.status).toBe('BASELINE_UNRANKED');
    });

    it('keeps the history of a disabled participant readable', async () => {
      const body = bodyOf<{ participantId: string; enabled: boolean }>(
        await server().get('/api/v1/participants/player-off').expect(200),
      );

      expect(body.enabled).toBe(false);
    });

    it('paginates and filters the match history', async () => {
      const all = bodyOf<{
        data: { matchId: string; win: boolean }[];
        meta: { total: number; page: number; pageSize: number; totalPages: number };
      }>(await server().get('/api/v1/participants/player-one/matches').expect(200));

      expect(all.meta.total).toBe(3);
      // Newest first.
      expect(all.data.map((match) => match.matchId)).toEqual(['LA1_3', 'LA1_2', 'LA1_1']);

      const wins = bodyOf<{ data: { matchId: string }[]; meta: { total: number } }>(
        await server().get('/api/v1/participants/player-one/matches?result=WIN').expect(200),
      );
      expect(wins.meta.total).toBe(2);

      const paged = bodyOf<{ data: unknown[]; meta: { page: number; totalPages: number } }>(
        await server().get('/api/v1/participants/player-one/matches?page=2&pageSize=2').expect(200),
      );
      expect(paged.data).toHaveLength(1);
      expect(paged.meta).toEqual(expect.objectContaining({ page: 2, totalPages: 2 }));

      const byChampion = bodyOf<{ meta: { total: number } }>(
        await server()
          .get('/api/v1/participants/player-one/matches?championName=leesin')
          .expect(200),
      );
      expect(byChampion.meta.total).toBe(3);
    });

    it('returns the progression snapshots in chronological order', async () => {
      const body = bodyOf<{
        participantId: string;
        snapshots: { capturedAt: string; visibleRankScore: number | null }[];
      }>(await server().get('/api/v1/participants/player-one/progression').expect(200));

      expect(body.participantId).toBe('player-one');
      expect(body.snapshots.length).toBeGreaterThanOrEqual(1);

      const timestamps = body.snapshots.map((snapshot) => Date.parse(snapshot.capturedAt));
      expect([...timestamps].sort((left, right) => left - right)).toEqual(timestamps);
    });

    it('ranks the leaderboard with the computed progress', async () => {
      const body = bodyOf<{
        data: {
          position: number;
          participantId: string;
          progress: { units: number | null };
          statistics: { gamesPlayed: number };
        }[];
        meta: { total: number; lastSuccessfulSyncAt: string | null; dataFreshness: string };
      }>(await server().get('/api/v1/leaderboard?limit=1').expect(200));

      expect(body.data).toHaveLength(1);
      expect(body.data[0].position).toBe(1);
      expect(body.data[0].participantId).toBe('player-one');
      expect(body.data[0].statistics.gamesPlayed).toBe(3);
      expect(body.meta.total).toBe(2);
      expect(body.meta.lastSuccessfulSyncAt).not.toBeNull();
      expect(body.meta.dataFreshness).toBe('FRESH');
    });

    it('summarises the challenge with the current leader and processed matches', async () => {
      const body = bodyOf<{
        totalProcessedMatches: number;
        totalParticipants: number;
        totalEnabledParticipants: number;
        leader: { participantId: string; position: number } | null;
      }>(await server().get('/api/v1/challenge').expect(200));

      expect(body.totalProcessedMatches).toBe(4);
      expect(body.totalParticipants).toBe(3);
      expect(body.totalEnabledParticipants).toBe(2);
      expect(body.leader).toEqual(
        expect.objectContaining({ participantId: 'player-one', position: 1 }),
      );
    });
  });

  describe('POST /api/v1/admin/participants/validate', () => {
    it('requires the administrative API key', async () => {
      await server()
        .post('/api/v1/admin/participants/validate')
        .send({ gameName: 'PlayerOne', tagLine: 'LAN', platform: 'LA1' })
        .expect(401);
    });

    it('resolves an existing Riot ID without registering it', async () => {
      const body = bodyOf<{
        riotId: string;
        regionalRoute: string;
        alreadyConfigured: boolean;
        configuredParticipantId: string | null;
        currentRank: { tier: string } | null;
      }>(
        await server()
          .post('/api/v1/admin/participants/validate')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .send({ gameName: 'PlayerOne', tagLine: 'LAN', platform: 'LA1' })
          .expect(200),
      );

      expect(body.riotId).toBe('PlayerOne#LAN');
      expect(body.regionalRoute).toBe('AMERICAS');
      expect(body.alreadyConfigured).toBe(true);
      expect(body.configuredParticipantId).toBe('player-one');
      expect(body.currentRank?.tier).toBe('EMERALD');
    });

    it('answers 404 for a Riot ID that does not exist', async () => {
      const body = bodyOf<ErrorBody>(
        await server()
          .post('/api/v1/admin/participants/validate')
          .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
          .send({ gameName: 'NobodyHere', tagLine: 'LAN', platform: 'LA1' })
          .expect(404),
      );

      expect(body.code).toBe('RIOT_ACCOUNT_NOT_FOUND');
    });

    it('validates the request body', async () => {
      await server()
        .post('/api/v1/admin/participants/validate')
        .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
        .send({ gameName: 'PlayerOne', tagLine: 'LAN', platform: 'MARS' })
        .expect(400);

      await server()
        .post('/api/v1/admin/participants/validate')
        .set(INTERNAL_API_KEY_HEADER, ADMIN_KEY)
        .send({ gameName: 'PlayerOne', tagLine: 'LAN', platform: 'LA1', extra: true })
        .expect(400);
    });
  });

  describe('Swagger', () => {
    it('publishes the documentation and never exposes secrets', async () => {
      await server().get('/docs').expect(200);

      const specification = await server().get('/docs-json').expect(200);
      const serialized = JSON.stringify(bodyOf<Record<string, unknown>>(specification));

      expect(serialized).toContain('/api/v1/leaderboard');
      expect(serialized).toContain(INTERNAL_API_KEY_HEADER);
      expect(serialized).not.toContain(ADMIN_KEY);
      expect(serialized).not.toContain('RGAPI-');
    });
  });

  describe('persistence', () => {
    it('keeps the data across a restart when the data directory persists', async () => {
      const before = bodyOf<{ eventStatistics: { gamesPlayed: number } }>(
        await server().get('/api/v1/participants/player-one').expect(200),
      );

      await application.close();
      application = await createApplication();

      const after = bodyOf<{
        eventStatistics: { gamesPlayed: number };
        baselineRank: { capturedAt: string } | null;
      }>(await server().get('/api/v1/participants/player-one').expect(200));

      expect(after.eventStatistics.gamesPlayed).toBe(before.eventStatistics.gamesPlayed);
      expect(after.baselineRank).not.toBeNull();

      const challenge = bodyOf<{ initialized: boolean; status: string }>(
        await server().get('/api/v1/challenge').expect(200),
      );
      expect(challenge.initialized).toBe(true);
      expect(challenge.status).toBe('ACTIVE');
    }, 30_000);
  });
});
