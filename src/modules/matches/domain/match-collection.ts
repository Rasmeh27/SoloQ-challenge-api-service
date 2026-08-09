import type { ProcessedMatch } from './processed-match';

/** Newest first, deterministic for equal timestamps. */
function compareByRecencyDescending(left: ProcessedMatch, right: ProcessedMatch): number {
  if (right.gameStartTimestamp !== left.gameStartTimestamp) {
    return right.gameStartTimestamp - left.gameStartTimestamp;
  }

  return right.matchId.localeCompare(left.matchId);
}

export function sortMatchesByRecency(matches: readonly ProcessedMatch[]): ProcessedMatch[] {
  return [...matches].sort(compareByRecencyDescending);
}

/**
 * Merges freshly downloaded matches into the stored ones.
 *
 * Deduplicates by `matchId` (the incoming version wins, it is the most recent read) and
 * returns the canonical order: newest first. The overlap window used when asking Riot for
 * match ids relies on this deduplication.
 */
export function mergeProcessedMatches(
  stored: readonly ProcessedMatch[],
  incoming: readonly ProcessedMatch[],
): ProcessedMatch[] {
  const byMatchId = new Map<string, ProcessedMatch>();

  for (const match of stored) {
    byMatchId.set(match.matchId, match);
  }

  for (const match of incoming) {
    byMatchId.set(match.matchId, match);
  }

  return sortMatchesByRecency([...byMatchId.values()]);
}

export function newestMatchStartTimestamp(matches: readonly ProcessedMatch[]): number | null {
  if (matches.length === 0) {
    return null;
  }

  return matches.reduce(
    (newest, match) => Math.max(newest, match.gameStartTimestamp),
    Number.NEGATIVE_INFINITY,
  );
}

export function collectMatchIds(matches: readonly ProcessedMatch[]): ReadonlySet<string> {
  return new Set(matches.map((match) => match.matchId));
}
