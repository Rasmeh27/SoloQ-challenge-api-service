import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { AsyncMutex } from '../../../common/utils/async-mutex';
import { mapWithConcurrency } from '../../../common/utils/concurrency';
import {
  CHALLENGE_STATE_SCHEMA_VERSION,
  type ChallengeState,
  createEmptyChallengeState,
} from '../../challenge/domain/challenge-state';
import type { ChallengeStateRepository } from '../../challenge/domain/challenge-state.repository';
import type { ParticipantState } from '../../challenge/domain/participant-state';
import type { RankSnapshot } from '../../challenge/domain/rank/rank-snapshot';
import {
  UnsafeDocumentIdentifierError,
  UnsupportedStorageSchemaError,
} from '../domain/storage.errors';
import { JsonFileStore } from './json-file-store';
import {
  challengeStateDocumentSchema,
  type ParticipantStateDocument,
  participantStateDocumentSchema,
  parseStoredDocument,
  rankSnapshotsDocumentSchema,
} from './storage.schemas';

const CHALLENGE_STATE_FILE = 'challenge-state.json';
const PARTICIPANTS_DIRECTORY = 'participants';
const SNAPSHOTS_DIRECTORY = 'snapshots';
const JSON_EXTENSION = '.json';
const CHALLENGE_STATE_DOCUMENT = 'challenge-state';
const PARTICIPANT_LOAD_CONCURRENCY = 8;
const SAFE_DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * JSON implementation of `ChallengeStateRepository`.
 *
 * Layout inside `CHALLENGE_DATA_DIR`:
 *   challenge-state.json          global flags and the initialized roster
 *   participants/<id>.json        participant state, current rank, processed matches
 *   snapshots/<id>.json           rank snapshots used for the progression chart
 *
 * Guarantees: atomic writes (temporary file + rename), writes serialized by an in-memory
 * mutex, schema validation on read, explicit errors for corrupted documents.
 *
 * Limitation, by design: the mutex is process local. This adapter is only safe for a
 * single instance with a persistent directory. It is not safe for multiple replicas nor
 * for serverless platforms with an ephemeral filesystem.
 */
@Injectable()
export class JsonChallengeStateRepository implements ChallengeStateRepository, OnModuleInit {
  private readonly logger = new Logger(JsonChallengeStateRepository.name);
  private readonly store: JsonFileStore;
  /** Serializes physical writes. */
  private readonly writeMutex = new AsyncMutex();
  /** Serializes application level read-modify-write sequences. Not reentrant with itself. */
  private readonly transactionMutex = new AsyncMutex();

  constructor(
    dataDirectory: string,
    private readonly challengeId: string,
  ) {
    this.store = new JsonFileStore(dataDirectory);
  }

  public async onModuleInit(): Promise<void> {
    try {
      await this.store.ensureBaseDirectory();
      this.logger.log(`JSON storage ready at "${this.store.directory}"`);
    } catch {
      this.logger.warn(
        `JSON storage directory "${this.store.directory}" is not writable. ` +
          'Read endpoints keep working; synchronization will fail until it is fixed.',
      );
    }
  }

  public async loadChallengeState(): Promise<ChallengeState> {
    const raw = await this.store.readJson(CHALLENGE_STATE_FILE, CHALLENGE_STATE_DOCUMENT);

    if (raw === null) {
      return createEmptyChallengeState(this.challengeId);
    }

    const document = parseStoredDocument(
      challengeStateDocumentSchema,
      raw,
      CHALLENGE_STATE_DOCUMENT,
    );

    this.assertSupportedSchemaVersion(document.schemaVersion, CHALLENGE_STATE_DOCUMENT);

    if (document.challengeId !== this.challengeId) {
      this.logger.warn(
        `Stored state belongs to challenge "${document.challengeId}" but the configured challenge is ` +
          `"${this.challengeId}". Point CHALLENGE_DATA_DIR to a different directory to start a new challenge.`,
      );
    }

    const state: ChallengeState = document;

    return state;
  }

  public saveChallengeState(state: ChallengeState): Promise<void> {
    return this.writeMutex.runExclusive(() =>
      this.store.writeJsonAtomically(CHALLENGE_STATE_FILE, CHALLENGE_STATE_DOCUMENT, {
        ...state,
        schemaVersion: CHALLENGE_STATE_SCHEMA_VERSION,
      }),
    );
  }

  public async loadParticipantState(participantId: string): Promise<ParticipantState | null> {
    const documentName = this.participantDocumentName(participantId);
    const raw = await this.store.readJson(this.participantFilePath(participantId), documentName);

    if (raw === null) {
      return null;
    }

    const document = parseStoredDocument(participantStateDocumentSchema, raw, documentName);
    this.assertSupportedSchemaVersion(document.schemaVersion, documentName);

    return this.toParticipantState(document, await this.loadRankSnapshots(participantId));
  }

  public async loadAllParticipantStates(): Promise<readonly ParticipantState[]> {
    const fileNames = await this.store.listJsonFileNames(PARTICIPANTS_DIRECTORY);
    const participantIds = fileNames.map((fileName) => fileName.slice(0, -JSON_EXTENSION.length));

    const states = await mapWithConcurrency(
      participantIds,
      PARTICIPANT_LOAD_CONCURRENCY,
      (participantId) => this.loadParticipantState(participantId),
    );

    return states.filter((state): state is ParticipantState => state !== null);
  }

  public saveParticipantState(state: ParticipantState): Promise<void> {
    return this.writeMutex.runExclusive(async () => {
      const { rankSnapshots, ...participantFields } = state;
      const documentName = this.participantDocumentName(state.participantId);

      // Snapshots are written first: they are append only, so a failure between both
      // writes can never leave the participant document referencing missing history.
      await this.store.writeJsonAtomically(
        this.snapshotsFilePath(state.participantId),
        `${SNAPSHOTS_DIRECTORY}/${state.participantId}`,
        {
          schemaVersion: CHALLENGE_STATE_SCHEMA_VERSION,
          participantId: state.participantId,
          snapshots: rankSnapshots,
        },
      );

      await this.store.writeJsonAtomically(
        this.participantFilePath(state.participantId),
        documentName,
        { ...participantFields, schemaVersion: CHALLENGE_STATE_SCHEMA_VERSION },
      );
    });
  }

  public runExclusively<T>(task: () => Promise<T>): Promise<T> {
    return this.transactionMutex.runExclusive(task);
  }

  public isWritable(): Promise<boolean> {
    return this.store.isWritable();
  }

  private async loadRankSnapshots(participantId: string): Promise<RankSnapshot[]> {
    const documentName = `${SNAPSHOTS_DIRECTORY}/${participantId}`;
    const raw = await this.store.readJson(this.snapshotsFilePath(participantId), documentName);

    if (raw === null) {
      return [];
    }

    const document = parseStoredDocument(rankSnapshotsDocumentSchema, raw, documentName);
    this.assertSupportedSchemaVersion(document.schemaVersion, documentName);

    return document.snapshots;
  }

  private toParticipantState(
    document: ParticipantStateDocument,
    rankSnapshots: readonly RankSnapshot[],
  ): ParticipantState {
    const { schemaVersion: _schemaVersion, ...participantFields } = document;
    const state: ParticipantState = { ...participantFields, rankSnapshots };

    return state;
  }

  private assertSupportedSchemaVersion(version: number, documentName: string): void {
    if (version > CHALLENGE_STATE_SCHEMA_VERSION) {
      throw new UnsupportedStorageSchemaError(
        documentName,
        version,
        CHALLENGE_STATE_SCHEMA_VERSION,
      );
    }
  }

  private participantDocumentName(participantId: string): string {
    return `${PARTICIPANTS_DIRECTORY}/${this.assertSafeDocumentId(participantId)}`;
  }

  private participantFilePath(participantId: string): string {
    return `${PARTICIPANTS_DIRECTORY}/${this.assertSafeDocumentId(participantId)}${JSON_EXTENSION}`;
  }

  private snapshotsFilePath(participantId: string): string {
    return `${SNAPSHOTS_DIRECTORY}/${this.assertSafeDocumentId(participantId)}${JSON_EXTENSION}`;
  }

  /** Defense in depth: identifiers are validated at boot, but never build a path blindly. */
  private assertSafeDocumentId(participantId: string): string {
    if (!SAFE_DOCUMENT_ID_PATTERN.test(participantId)) {
      throw new UnsafeDocumentIdentifierError();
    }

    return participantId;
  }
}
