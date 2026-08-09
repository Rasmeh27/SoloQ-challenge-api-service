import { get, list, put } from '@vercel/blob';
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
  CorruptedStorageError,
  StorageUnavailableError,
  UnsafeDocumentIdentifierError,
  UnsupportedStorageSchemaError,
} from '../domain/storage.errors';
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
const JSON_INDENTATION = 2;
const SAFE_DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * Vercel Blob implementation of the challenge persistence port.
 *
 * Documents stay private and keep the same logical layout as the local JSON adapter,
 * namespaced by challenge id. This allows the Vercel function to survive cold starts and
 * deployments, where the filesystem is not persistent.
 */
@Injectable()
export class VercelBlobChallengeStateRepository implements ChallengeStateRepository, OnModuleInit {
  private readonly logger = new Logger(VercelBlobChallengeStateRepository.name);
  private readonly writeMutex = new AsyncMutex();
  private readonly transactionMutex = new AsyncMutex();
  private readonly pathPrefix: string;

  constructor(
    private readonly challengeId: string,
    private readonly token: string,
  ) {
    this.pathPrefix = `${challengeId}/`;
  }

  public async onModuleInit(): Promise<void> {
    if (await this.isWritable()) {
      this.logger.log(`Vercel Blob storage ready for challenge "${this.challengeId}".`);
      return;
    }

    this.logger.warn(
      'Vercel Blob storage is unreachable. Read endpoints keep working only while a warm instance has cached data.',
    );
  }

  public async loadChallengeState(): Promise<ChallengeState> {
    const raw = await this.readJson(CHALLENGE_STATE_FILE, CHALLENGE_STATE_DOCUMENT);

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
        `Stored state belongs to challenge "${document.challengeId}" but this deployment uses ` +
          `"${this.challengeId}". Use a separate Blob store or a different storage prefix.`,
      );
    }

    return document;
  }

  public saveChallengeState(state: ChallengeState): Promise<void> {
    return this.writeMutex.runExclusive(() =>
      this.writeJson(CHALLENGE_STATE_FILE, CHALLENGE_STATE_DOCUMENT, {
        ...state,
        schemaVersion: CHALLENGE_STATE_SCHEMA_VERSION,
      }),
    );
  }

  public async loadParticipantState(participantId: string): Promise<ParticipantState | null> {
    const documentName = this.participantDocumentName(participantId);
    const raw = await this.readJson(this.participantFilePath(participantId), documentName);

    if (raw === null) {
      return null;
    }

    const document = parseStoredDocument(participantStateDocumentSchema, raw, documentName);
    this.assertSupportedSchemaVersion(document.schemaVersion, documentName);

    return this.toParticipantState(document, await this.loadRankSnapshots(participantId));
  }

  public async loadAllParticipantStates(): Promise<readonly ParticipantState[]> {
    const fileNames = await this.listJsonFileNames(PARTICIPANTS_DIRECTORY);
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

      await this.writeJson(
        this.snapshotsFilePath(state.participantId),
        `${SNAPSHOTS_DIRECTORY}/${state.participantId}`,
        {
          schemaVersion: CHALLENGE_STATE_SCHEMA_VERSION,
          participantId: state.participantId,
          snapshots: rankSnapshots,
        },
      );

      await this.writeJson(this.participantFilePath(state.participantId), documentName, {
        ...participantFields,
        schemaVersion: CHALLENGE_STATE_SCHEMA_VERSION,
      });
    });
  }

  public runExclusively<T>(task: () => Promise<T>): Promise<T> {
    return this.transactionMutex.runExclusive(task);
  }

  public async isWritable(): Promise<boolean> {
    try {
      await list({ prefix: this.pathPrefix, limit: 1, token: this.token });
      return true;
    } catch {
      return false;
    }
  }

  private async readJson(relativePath: string, documentName: string): Promise<unknown> {
    let response: Awaited<ReturnType<typeof get>>;

    try {
      response = await get(this.blobPath(relativePath), {
        access: 'private',
        token: this.token,
        useCache: false,
      });
    } catch {
      throw new StorageUnavailableError(documentName, 'read');
    }

    if (response === null || response.statusCode !== 200 || response.stream === null) {
      return null;
    }

    let content: string;
    try {
      content = await new Response(response.stream).text();
    } catch {
      throw new StorageUnavailableError(documentName, 'read');
    }

    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new CorruptedStorageError(documentName, 'content is not valid JSON');
    }
  }

  private async writeJson(
    relativePath: string,
    documentName: string,
    value: unknown,
  ): Promise<void> {
    try {
      await put(this.blobPath(relativePath), `${JSON.stringify(value, null, JSON_INDENTATION)}\n`, {
        access: 'private',
        token: this.token,
        allowOverwrite: true,
        contentType: 'application/json; charset=utf-8',
        cacheControlMaxAge: 0,
      });
    } catch {
      throw new StorageUnavailableError(documentName, 'write');
    }
  }

  private async listJsonFileNames(relativeDirectory: string): Promise<string[]> {
    const directoryPrefix = `${this.blobPath(relativeDirectory)}/`;
    const fileNames: string[] = [];
    let cursor: string | undefined;

    try {
      do {
        const page = await list({
          prefix: directoryPrefix,
          cursor,
          token: this.token,
        });
        fileNames.push(
          ...page.blobs
            .map((blob) => blob.pathname.slice(directoryPrefix.length))
            .filter((fileName) => !fileName.includes('/') && fileName.endsWith(JSON_EXTENSION)),
        );
        cursor = page.cursor;
      } while (cursor !== undefined);
    } catch {
      throw new StorageUnavailableError(relativeDirectory, 'list');
    }

    return fileNames.sort((left, right) => left.localeCompare(right));
  }

  private async loadRankSnapshots(participantId: string): Promise<RankSnapshot[]> {
    const documentName = `${SNAPSHOTS_DIRECTORY}/${participantId}`;
    const raw = await this.readJson(this.snapshotsFilePath(participantId), documentName);

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

    return { ...participantFields, rankSnapshots };
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

  private blobPath(relativePath: string): string {
    return `${this.pathPrefix}${relativePath}`;
  }

  private assertSafeDocumentId(participantId: string): string {
    if (!SAFE_DOCUMENT_ID_PATTERN.test(participantId)) {
      throw new UnsafeDocumentIdentifierError();
    }

    return participantId;
  }
}
