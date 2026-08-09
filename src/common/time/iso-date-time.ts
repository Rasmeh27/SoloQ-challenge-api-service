import { MILLISECONDS_PER_SECOND } from './time.constants';

/** ISO 8601 instant, always serialized in UTC (`...Z`). */
export type IsoDateTime = string;

export function toIsoDateTime(date: Date): IsoDateTime {
  return date.toISOString();
}

export function fromEpochMilliseconds(epochMilliseconds: number): IsoDateTime {
  return new Date(epochMilliseconds).toISOString();
}

export function epochMillisecondsOf(value: IsoDateTime): number {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    throw new TypeError(`Invalid ISO 8601 instant: ${value}`);
  }

  return parsed;
}

export function toEpochSeconds(epochMilliseconds: number): number {
  return Math.floor(epochMilliseconds / MILLISECONDS_PER_SECOND);
}
