/**
 * Time source port. Injecting the clock keeps every time dependent rule
 * (challenge status, snapshot cadence, data freshness, cache TTL) deterministic in tests.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('Clock');

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}
