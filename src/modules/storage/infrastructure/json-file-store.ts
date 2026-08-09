import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { CorruptedStorageError, StorageUnavailableError } from '../domain/storage.errors';

const JSON_EXTENSION = '.json';
const JSON_INDENTATION = 2;
const FILE_ENCODING = 'utf8';
const NOT_FOUND_ERROR_CODE = 'ENOENT';

function hasErrorCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === 'object' && (error as { code?: unknown }).code === code;
}

/**
 * Thin filesystem adapter: the only place in the application allowed to touch `fs`.
 *
 * Writes go to a temporary file and are then renamed, which is atomic on the supported
 * platforms, so a crash mid-write can never truncate a valid document.
 */
export class JsonFileStore {
  private temporaryFileCounter = 0;

  constructor(private readonly baseDirectory: string) {}

  public get directory(): string {
    return this.baseDirectory;
  }

  public async readJson(relativePath: string, documentName: string): Promise<unknown> {
    const absolutePath = this.absolutePathOf(relativePath);
    let content: string;

    try {
      content = await readFile(absolutePath, FILE_ENCODING);
    } catch (error) {
      if (hasErrorCode(error, NOT_FOUND_ERROR_CODE)) {
        return null;
      }

      throw new StorageUnavailableError(documentName, 'read');
    }

    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new CorruptedStorageError(documentName, 'content is not valid JSON');
    }
  }

  public async writeJsonAtomically(
    relativePath: string,
    documentName: string,
    value: unknown,
  ): Promise<void> {
    const absolutePath = this.absolutePathOf(relativePath);
    const temporaryPath = this.temporaryPathFor(absolutePath);

    try {
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(temporaryPath, `${JSON.stringify(value, null, JSON_INDENTATION)}\n`, {
        encoding: FILE_ENCODING,
      });
      await rename(temporaryPath, absolutePath);
    } catch {
      await this.discardTemporaryFile(temporaryPath);
      throw new StorageUnavailableError(documentName, 'write');
    }
  }

  public async listJsonFileNames(relativeDirectory: string): Promise<string[]> {
    try {
      const entries = await readdir(this.absolutePathOf(relativeDirectory), {
        withFileTypes: true,
      });

      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(JSON_EXTENSION))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
    } catch (error) {
      if (hasErrorCode(error, NOT_FOUND_ERROR_CODE)) {
        return [];
      }

      throw new StorageUnavailableError(relativeDirectory, 'list');
    }
  }

  public async ensureBaseDirectory(): Promise<void> {
    try {
      await mkdir(this.baseDirectory, { recursive: true });
    } catch {
      throw new StorageUnavailableError(this.baseDirectory, 'create');
    }
  }

  /** Non destructive writability probe used by the health endpoint. */
  public async isWritable(): Promise<boolean> {
    try {
      await mkdir(this.baseDirectory, { recursive: true });
      await access(this.baseDirectory, fsConstants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  private absolutePathOf(relativePath: string): string {
    return resolve(join(this.baseDirectory, relativePath));
  }

  private temporaryPathFor(absolutePath: string): string {
    this.temporaryFileCounter += 1;

    return `${absolutePath}.${process.pid}.${this.temporaryFileCounter}.tmp`;
  }

  private async discardTemporaryFile(temporaryPath: string): Promise<void> {
    try {
      await rm(temporaryPath, { force: true });
    } catch {
      // The temporary file is already gone or unreachable; the original document is intact.
    }
  }
}
