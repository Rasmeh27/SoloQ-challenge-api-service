/**
 * Maps items with a bounded number of workers, preserving input order in the result.
 *
 * Used instead of an unbounded `Promise.all` when fanning out over participants or
 * matches. The worker is expected to handle its own recoverable errors; a rejection
 * propagates and aborts the mapping.
 */
export async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  const runners = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);

  return results;
}
