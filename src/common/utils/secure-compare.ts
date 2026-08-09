import { createHash, timingSafeEqual } from 'node:crypto';

const DIGEST_ALGORITHM = 'sha256';

/**
 * Constant time comparison of two secrets.
 * Both values are hashed first so `timingSafeEqual` always receives equal length
 * buffers and the comparison does not leak the expected key length.
 */
export function secureCompare(left: string, right: string): boolean {
  const leftDigest = createHash(DIGEST_ALGORITHM).update(left, 'utf8').digest();
  const rightDigest = createHash(DIGEST_ALGORITHM).update(right, 'utf8').digest();

  return timingSafeEqual(leftDigest, rightDigest);
}
