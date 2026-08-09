import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  aBaselineRank,
  aParticipantState,
  aProcessedMatch,
  aRankedPosition,
} from '../../../test-support/builders';
import { CHALLENGE_STATE_SCHEMA_VERSION } from '../../challenge/domain/challenge-state';
import { toRankSnapshot } from '../../challenge/domain/rank/rank-snapshot';
import {
  CorruptedStorageError,
  StorageUnavailableError,
  UnsafeDocumentIdentifierError,
  UnsupportedStorageSchemaError,
} from '../domain/storage.errors';
import { JsonChallengeStateRepository } from './json-challenge-state.repository';

const CHALLENGE_ID = 'test-challenge';
const CHALLENGE_STATE_FILE = 'challenge-state.json';

describe('JsonChallengeStateRepository', () => {
  let directory: string;
  let repository: JsonChallengeStateRepository;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'soloq-challenge-'));
    repository = new JsonChallengeStateRepository(directory, CHALLENGE_ID);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns a DRAFT state when nothing was persisted yet', async () => {
    const state = await repository.loadChallengeState();

    expect(state).toEqual(
      expect.objectContaining({
        challengeId: CHALLENGE_ID,
        initialized: false,
        initializedAt: null,
        synchronizationInProgress: false,
        participants: [],
      }),
    );
  });

  it('returns null for a participant that was never persisted', async () => {
    await expect(repository.loadParticipantState('player-one')).resolves.toBeNull();
    await expect(repository.loadAllParticipantStates()).resolves.toEqual([]);
  });

  it('persists and reloads the challenge state including the schema version', async () => {
    const state = await repository.loadChallengeState();

    await repository.saveChallengeState({
      ...state,
      initialized: true,
      initializedAt: '2026-08-01T00:00:00.000Z',
      participants: [
        {
          participantId: 'player-one',
          puuid: 'puuid-1',
          initializedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    });

    const reloaded = await repository.loadChallengeState();

    expect(reloaded.initialized).toBe(true);
    expect(reloaded.participants).toHaveLength(1);
    expect(reloaded.schemaVersion).toBe(CHALLENGE_STATE_SCHEMA_VERSION);
  });

  it('survives a restart: a new repository instance reads the same data', async () => {
    const state = aParticipantState({
      participantId: 'player-one',
      processedMatches: [aProcessedMatch({ matchId: 'LA1_1' })],
      rankSnapshots: [toRankSnapshot(aRankedPosition(), '2026-08-01T00:00:00.000Z')],
    });

    await repository.saveParticipantState(state);

    const restarted = new JsonChallengeStateRepository(directory, CHALLENGE_ID);
    const reloaded = await restarted.loadParticipantState('player-one');

    expect(reloaded).toEqual(state);
  });

  it('stores snapshots in their own document', async () => {
    await repository.saveParticipantState(
      aParticipantState({
        participantId: 'player-one',
        rankSnapshots: [toRankSnapshot(aRankedPosition(), '2026-08-01T00:00:00.000Z')],
      }),
    );

    const participantDocument: unknown = JSON.parse(
      await readFile(join(directory, 'participants', 'player-one.json'), 'utf8'),
    );
    const snapshotsDocument: unknown = JSON.parse(
      await readFile(join(directory, 'snapshots', 'player-one.json'), 'utf8'),
    );

    expect(participantDocument).not.toHaveProperty('rankSnapshots');
    expect(snapshotsDocument).toEqual(
      expect.objectContaining({
        participantId: 'player-one',
        schemaVersion: CHALLENGE_STATE_SCHEMA_VERSION,
      }),
    );
  });

  it('reads a participant document written by the previous schema version', async () => {
    const { profileRefreshedAt: _dropped, ...legacyFields } = aParticipantState({
      participantId: 'player-one',
    });

    await mkdir(join(directory, 'participants'), { recursive: true });
    await writeFile(
      join(directory, 'participants', 'player-one.json'),
      JSON.stringify({ ...legacyFields, schemaVersion: 1 }),
      'utf8',
    );

    const state = await repository.loadParticipantState('player-one');

    // The field added in v2 defaults to null and is refreshed on the next synchronization.
    expect(state?.participantId).toBe('player-one');
    expect(state?.profileRefreshedAt).toBeNull();
  });

  it('reads a v2 participant document and keeps its baseline and matches intact', async () => {
    const { earliestMatchCoverageAt: _dropped, ...version2Fields } = aParticipantState({
      participantId: 'player-one',
      baselineRank: aBaselineRank({ capturedAt: '2026-08-09T00:41:13.955Z' }),
      processedMatches: [aProcessedMatch({ matchId: 'LA1_1' })],
    });

    await mkdir(join(directory, 'participants'), { recursive: true });
    await writeFile(
      join(directory, 'participants', 'player-one.json'),
      JSON.stringify({ ...version2Fields, schemaVersion: 2 }),
      'utf8',
    );

    const state = await repository.loadParticipantState('player-one');

    // Missing coverage means "never swept": the next synchronization backfills from the
    // challenge start. The stored baseline and matches are untouched.
    expect(state?.earliestMatchCoverageAt).toBeNull();
    expect(state?.baselineRank?.capturedAt).toBe('2026-08-09T00:41:13.955Z');
    expect(state?.processedMatches.map((match) => match.matchId)).toEqual(['LA1_1']);
  });

  it('drops the v3 tracking field and asks for a backfill instead', async () => {
    const version3Document = {
      ...aParticipantState({ participantId: 'player-one' }),
      // Written by schema version 3, when the window was bounded per participant.
      trackingStartedAt: '2026-08-09T01:13:11.406Z',
      schemaVersion: 3,
    };

    await mkdir(join(directory, 'participants'), { recursive: true });
    await writeFile(
      join(directory, 'participants', 'player-one.json'),
      JSON.stringify(version3Document),
      'utf8',
    );

    const state = await repository.loadParticipantState('player-one');

    expect(state).not.toBeNull();
    expect(state).not.toHaveProperty('trackingStartedAt');
    expect(state?.earliestMatchCoverageAt).toBeNull();
  });

  it('loads every persisted participant', async () => {
    await repository.saveParticipantState(aParticipantState({ participantId: 'player-one' }));
    await repository.saveParticipantState(aParticipantState({ participantId: 'player-two' }));

    const states = await repository.loadAllParticipantStates();

    expect(states.map((state) => state.participantId).sort()).toEqual(['player-one', 'player-two']);
  });

  it('leaves no temporary files behind after an atomic write', async () => {
    await repository.saveParticipantState(aParticipantState({ participantId: 'player-one' }));

    const rootEntries = await readdir(directory);
    const participantEntries = await readdir(join(directory, 'participants'));

    expect(rootEntries.some((entry) => entry.endsWith('.tmp'))).toBe(false);
    expect(participantEntries).toEqual(['player-one.json']);
  });

  it('fails explicitly on corrupted JSON and does not overwrite the file', async () => {
    const corrupted = '{ this is not json';
    await writeFile(join(directory, CHALLENGE_STATE_FILE), corrupted, 'utf8');

    await expect(repository.loadChallengeState()).rejects.toThrow(CorruptedStorageError);
    await expect(readFile(join(directory, CHALLENGE_STATE_FILE), 'utf8')).resolves.toBe(corrupted);
  });

  it('fails explicitly when a document does not match the expected schema', async () => {
    await writeFile(
      join(directory, CHALLENGE_STATE_FILE),
      JSON.stringify({ schemaVersion: 1, challengeId: CHALLENGE_ID, initialized: 'yes' }),
      'utf8',
    );

    await expect(repository.loadChallengeState()).rejects.toThrow(CorruptedStorageError);
  });

  it('refuses documents written by a newer schema version', async () => {
    await writeFile(
      join(directory, CHALLENGE_STATE_FILE),
      JSON.stringify({
        schemaVersion: 99,
        challengeId: CHALLENGE_ID,
        initialized: false,
        initializedAt: null,
        lastGlobalSyncAt: null,
        lastSuccessfulGlobalSyncAt: null,
        synchronizationInProgress: false,
        participants: [],
      }),
      'utf8',
    );

    await expect(repository.loadChallengeState()).rejects.toThrow(UnsupportedStorageSchemaError);
  });

  it('rejects participant identifiers that could escape the data directory', async () => {
    await expect(repository.loadParticipantState('../../etc/passwd')).rejects.toThrow(
      UnsafeDocumentIdentifierError,
    );
  });

  it('reports an unavailable storage without losing other valid documents', async () => {
    await repository.saveParticipantState(aParticipantState({ participantId: 'player-one' }));
    const state = await repository.loadChallengeState();

    // A directory where the document must be written makes the atomic rename impossible.
    await mkdir(join(directory, CHALLENGE_STATE_FILE), { recursive: true });

    await expect(repository.saveChallengeState(state)).rejects.toThrow(StorageUnavailableError);

    const survivor = await repository.loadParticipantState('player-one');
    expect(survivor?.participantId).toBe('player-one');
    expect((await readdir(directory)).some((entry) => entry.endsWith('.tmp'))).toBe(false);
  });

  it('serializes concurrent writes', async () => {
    await Promise.all([
      repository.saveParticipantState(aParticipantState({ participantId: 'player-one' })),
      repository.saveParticipantState(aParticipantState({ participantId: 'player-two' })),
      repository.saveParticipantState(aParticipantState({ participantId: 'player-three' })),
    ]);

    await expect(repository.loadAllParticipantStates()).resolves.toHaveLength(3);
  });

  it('runs exclusive read-modify-write sequences without deadlocking on writes', async () => {
    const result = await repository.runExclusively(async () => {
      const state = await repository.loadChallengeState();
      await repository.saveChallengeState({ ...state, initialized: true });
      return 'done';
    });

    expect(result).toBe('done');
    expect((await repository.loadChallengeState()).initialized).toBe(true);
  });

  it('reports whether the data directory is writable', async () => {
    await expect(repository.isWritable()).resolves.toBe(true);

    const filePath = join(directory, 'a-file');
    await writeFile(filePath, 'x', 'utf8');

    await expect(
      new JsonChallengeStateRepository(filePath, CHALLENGE_ID).isWritable(),
    ).resolves.toBe(false);
  });
});
