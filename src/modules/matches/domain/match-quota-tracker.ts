import type { ProcessedMatch } from './processed-match';

/** Calendar-day state used by the public match-limit tracker. */
export const MATCH_QUOTA_MODES = ['LIMITED', 'UNLIMITED', 'NOT_STARTED', 'FINISHED'] as const;

export type MatchQuotaMode = (typeof MATCH_QUOTA_MODES)[number];

export interface MatchQuotaConfiguration {
  readonly startAt: string;
  readonly endAt: string;
  readonly timeZone: string;
  readonly weekdayMatchLimit: number;
}

/**
 * Snapshot of a participant's allowance at `now`.
 *
 * A new credit is granted for every Monday-Friday that has started. Credits are
 * only spent by weekday matches, therefore Saturday and Sunday are truly
 * unlimited and do not consume a carried balance.
 */
export interface MatchQuotaTracker {
  readonly mode: MatchQuotaMode;
  /** Local ISO date in the challenge's configured time zone. */
  readonly date: string;
  readonly timeZone: string;
  readonly weekdayDailyLimit: number;
  /** `null` when the current day is unlimited or the challenge is no longer active. */
  readonly remainingMatches: number | null;
  /** Unused credits granted before the current weekday. */
  readonly carriedOverMatches: number;
  readonly matchesPlayedToday: number;
  readonly weekdayCreditsEarned: number;
  readonly weekdayMatchesPlayed: number;
  /** Matches above the credits granted so far; the tracker never discards them. */
  readonly exceededBy: number;
}

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export function calculateMatchQuotaTracker(
  matches: readonly ProcessedMatch[],
  configuration: MatchQuotaConfiguration,
  now: Date,
): MatchQuotaTracker {
  const localDateOf = localDateConverter(configuration.timeZone);
  const nowDate = localDateOf(now);
  const startAt = new Date(configuration.startAt);
  const endAt = new Date(configuration.endAt);

  if (now.getTime() < startAt.getTime()) {
    return unavailableTracker('NOT_STARTED', nowDate, configuration);
  }

  if (now.getTime() > endAt.getTime()) {
    return completedTracker(matches, localDateOf, nowDate, localDateOf(endAt), configuration);
  }

  const startDate = localDateOf(startAt);
  const matchDates = matches.map((match) => localDateOf(new Date(match.gameStartTimestamp)));
  const weekdayCreditsEarned =
    countWeekdaysBetween(startDate, nowDate) * configuration.weekdayMatchLimit;
  const weekdayMatchesPlayed = matchDates.filter((date) => isWeekday(date)).length;
  const matchesPlayedToday = matchDates.filter((date) => isSameDate(date, nowDate)).length;
  const exceededBy = Math.max(0, weekdayMatchesPlayed - weekdayCreditsEarned);

  if (!isWeekday(nowDate)) {
    return {
      mode: 'UNLIMITED',
      date: dateKey(nowDate),
      timeZone: configuration.timeZone,
      weekdayDailyLimit: configuration.weekdayMatchLimit,
      remainingMatches: null,
      carriedOverMatches: 0,
      matchesPlayedToday,
      weekdayCreditsEarned,
      weekdayMatchesPlayed,
      exceededBy,
    };
  }

  const previousDay = addDays(nowDate, -1);
  const creditsBeforeToday =
    countWeekdaysBetween(startDate, previousDay) * configuration.weekdayMatchLimit;
  const weekdayMatchesBeforeToday = matchDates.filter(
    (date) => isWeekday(date) && compareDates(date, nowDate) < 0,
  ).length;

  return {
    mode: 'LIMITED',
    date: dateKey(nowDate),
    timeZone: configuration.timeZone,
    weekdayDailyLimit: configuration.weekdayMatchLimit,
    remainingMatches: Math.max(0, weekdayCreditsEarned - weekdayMatchesPlayed),
    carriedOverMatches: Math.max(0, creditsBeforeToday - weekdayMatchesBeforeToday),
    matchesPlayedToday,
    weekdayCreditsEarned,
    weekdayMatchesPlayed,
    exceededBy,
  };
}

function unavailableTracker(
  mode: Extract<MatchQuotaMode, 'NOT_STARTED'>,
  date: CalendarDate,
  configuration: MatchQuotaConfiguration,
): MatchQuotaTracker {
  return {
    mode,
    date: dateKey(date),
    timeZone: configuration.timeZone,
    weekdayDailyLimit: configuration.weekdayMatchLimit,
    remainingMatches: 0,
    carriedOverMatches: 0,
    matchesPlayedToday: 0,
    weekdayCreditsEarned: 0,
    weekdayMatchesPlayed: 0,
    exceededBy: 0,
  };
}

function completedTracker(
  matches: readonly ProcessedMatch[],
  localDateOf: (instant: Date) => CalendarDate,
  nowDate: CalendarDate,
  endDate: CalendarDate,
  configuration: MatchQuotaConfiguration,
): MatchQuotaTracker {
  const startDate = localDateOf(new Date(configuration.startAt));
  const matchDates = matches.map((match) => localDateOf(new Date(match.gameStartTimestamp)));
  const weekdayCreditsEarned =
    countWeekdaysBetween(startDate, endDate) * configuration.weekdayMatchLimit;
  const weekdayMatchesPlayed = matchDates.filter((date) => isWeekday(date)).length;

  return {
    mode: 'FINISHED',
    date: dateKey(nowDate),
    timeZone: configuration.timeZone,
    weekdayDailyLimit: configuration.weekdayMatchLimit,
    remainingMatches: null,
    carriedOverMatches: 0,
    matchesPlayedToday: matchDates.filter((date) => isSameDate(date, nowDate)).length,
    weekdayCreditsEarned,
    weekdayMatchesPlayed,
    exceededBy: Math.max(0, weekdayMatchesPlayed - weekdayCreditsEarned),
  };
}

function localDateConverter(timeZone: string): (instant: Date) => CalendarDate {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (instant) => {
    const parts = formatter.formatToParts(instant);
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<'year' | 'month' | 'day', number>;

    return { year: values.year, month: values.month, day: values.day };
  };
}

function countWeekdaysBetween(start: CalendarDate, end: CalendarDate): number {
  if (compareDates(start, end) > 0) {
    return 0;
  }

  let weekdays = 0;
  for (let serial = daySerial(start); serial <= daySerial(end); serial += 1) {
    if (isWeekday(serialToDate(serial))) {
      weekdays += 1;
    }
  }

  return weekdays;
}

function isWeekday(date: CalendarDate): boolean {
  const dayOfWeek = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function compareDates(left: CalendarDate, right: CalendarDate): number {
  return daySerial(left) - daySerial(right);
}

function isSameDate(left: CalendarDate, right: CalendarDate): boolean {
  return compareDates(left, right) === 0;
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  return serialToDate(daySerial(date) + days);
}

function daySerial(date: CalendarDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / MILLISECONDS_PER_DAY);
}

function serialToDate(serial: number): CalendarDate {
  const instant = new Date(serial * MILLISECONDS_PER_DAY);
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
  };
}

function dateKey(date: CalendarDate): string {
  return `${date.year.toString().padStart(4, '0')}-${date.month
    .toString()
    .padStart(2, '0')}-${date.day.toString().padStart(2, '0')}`;
}
