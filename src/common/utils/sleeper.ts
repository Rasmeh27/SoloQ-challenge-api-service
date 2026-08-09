/** Delay port, so retry/backoff logic can be tested without real waiting. */
export interface Sleeper {
  sleep(milliseconds: number): Promise<void>;
}

export const SLEEPER = Symbol('Sleeper');

export class SystemSleeper implements Sleeper {
  public sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
