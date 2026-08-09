jest.mock('@vercel/blob', () => ({
  get: jest.fn(),
  list: jest.fn(),
  put: jest.fn(),
}));

import { get, list, put } from '@vercel/blob';

import { aChallengeState } from '../../../test-support/builders';
import { VercelBlobChallengeStateRepository } from './vercel-blob-challenge-state.repository';

const TOKEN = 'vercel_blob_rw_test_token';
const CHALLENGE_ID = 'test-challenge';

function jsonStream(value: unknown): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
}

describe('VercelBlobChallengeStateRepository', () => {
  const mockedGet = jest.mocked(get);
  const mockedList = jest.mocked(list);
  const mockedPut = jest.mocked(put);
  let repository: VercelBlobChallengeStateRepository;

  beforeEach(() => {
    jest.resetAllMocks();
    repository = new VercelBlobChallengeStateRepository(CHALLENGE_ID, TOKEN);
  });

  it('writes the challenge state to the private challenge namespace', async () => {
    await repository.saveChallengeState(aChallengeState({ challengeId: CHALLENGE_ID }));

    expect(mockedPut).toHaveBeenCalledWith(
      `${CHALLENGE_ID}/challenge-state.json`,
      expect.any(String),
      expect.objectContaining({
        access: 'private',
        token: TOKEN,
        allowOverwrite: true,
      }),
    );
  });

  it('reads and validates a persisted challenge state without using the Blob cache', async () => {
    const state = aChallengeState({ challengeId: CHALLENGE_ID });
    mockedGet.mockResolvedValue({
      statusCode: 200,
      stream: jsonStream({ ...state, schemaVersion: 4 }),
    } as never);

    await expect(repository.loadChallengeState()).resolves.toEqual(
      expect.objectContaining({ challengeId: CHALLENGE_ID }),
    );
    expect(mockedGet).toHaveBeenCalledWith(`${CHALLENGE_ID}/challenge-state.json`, {
      access: 'private',
      token: TOKEN,
      useCache: false,
    });
  });

  it('checks the configured Blob store before reporting storage as writable', async () => {
    mockedList.mockResolvedValue({ blobs: [], hasMore: false });

    await expect(repository.isWritable()).resolves.toBe(true);
    expect(mockedList).toHaveBeenCalledWith({
      prefix: `${CHALLENGE_ID}/`,
      limit: 1,
      token: TOKEN,
    });
  });
});
