import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import { put } from '@vercel/blob';

import { CHALLENGE } from '../config/challenge.config';

const JSON_EXTENSION = '.json';
const BLOB_CONTENT_TYPE = 'application/json; charset=utf-8';

async function findJsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        return findJsonFiles(path);
      }

      return entry.isFile() && entry.name.endsWith(JSON_EXTENSION) ? [path] : [];
    }),
  );

  return files.flat();
}

async function main(): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token === undefined || token === '') {
    throw new Error('BLOB_READ_WRITE_TOKEN is required to migrate local challenge data.');
  }

  const dataDirectory = resolve(process.env.CHALLENGE_DATA_DIR?.trim() || './data');
  const files = await findJsonFiles(dataDirectory);

  if (files.length === 0) {
    throw new Error(`No JSON challenge data was found in "${dataDirectory}".`);
  }

  for (const filePath of files) {
    const relativePath = relative(dataDirectory, filePath).split(sep).join('/');
    const pathname = `${CHALLENGE.id}/${relativePath}`;
    const content = await readFile(filePath);

    await put(pathname, content, {
      access: 'private',
      token,
      allowOverwrite: true,
      contentType: BLOB_CONTENT_TYPE,
      cacheControlMaxAge: 0,
    });

    console.log(`Uploaded ${relativePath}`);
  }

  console.log(`Migrated ${files.length} document(s) to private Vercel Blob storage.`);
}

void main();
