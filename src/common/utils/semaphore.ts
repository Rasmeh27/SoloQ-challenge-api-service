/** Counting semaphore used to cap the number of concurrent Riot API requests. */
export class Semaphore {
  private availablePermits: number;
  private readonly waiting: Array<() => void> = [];

  constructor(permits: number) {
    if (!Number.isInteger(permits) || permits < 1) {
      throw new RangeError(`Semaphore permits must be a positive integer, received ${permits}`);
    }

    this.availablePermits = permits;
  }

  public async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.availablePermits > 0) {
      this.availablePermits -= 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  private release(): void {
    const next = this.waiting.shift();

    if (next) {
      // The permit is handed over directly, so the counter stays unchanged.
      next();
      return;
    }

    this.availablePermits += 1;
  }
}
