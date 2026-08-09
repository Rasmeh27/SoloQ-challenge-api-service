const IGNORE_RESULT = (): void => undefined;

/**
 * Minimal in-memory mutex used to serialize writes to the JSON storage.
 * Single process only, which matches the documented deployment model
 * (one NestJS instance, one synchronization process).
 */
export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  public runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(IGNORE_RESULT, IGNORE_RESULT);
    return result;
  }
}
