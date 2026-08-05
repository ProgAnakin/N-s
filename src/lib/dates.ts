/**
 * Anniversaries, birthdays, countdowns.
 *
 * Recurrence is computed from the original anchor date every time rather than
 * by repeatedly stepping forward, so a 31st never drifts to a 28th and stays
 * there, and a 29 February birthday behaves sensibly in common years.
 */

import type { CalendarDate } from './calendar';
import {
  addDays,
  addMonths,
  addYears,
  compareDates,
  daysBetween,
  isSameDay,
  monthsBetween,
  toEpochDay,
  yearsBetween,
} from './calendar';

export type ImportantDateType =
  | 'birthday'
  | 'anniversary'
  | 'monthiversary'
  | 'milestone'
  | 'custom';

export const IMPORTANT_DATE_TYPES: readonly ImportantDateType[] = [
  'birthday',
  'anniversary',
  'monthiversary',
  'milestone',
  'custom',
];

export type Cadence = 'yearly' | 'monthly' | 'none';

export interface ImportantDateLike {
  id: string;
  label: string;
  date: CalendarDate;
  type: ImportantDateType;
  recurring: boolean;
}

/** Sensible default for a newly created date of each type. */
export function defaultRecurring(type: ImportantDateType): boolean {
  return type === 'birthday' || type === 'anniversary' || type === 'monthiversary';
}

export function cadenceFor(type: ImportantDateType, recurring: boolean): Cadence {
  if (!recurring) return 'none';
  return type === 'monthiversary' ? 'monthly' : 'yearly';
}

/**
 * The next time this date comes around, on or after `from`.
 *
 * Returns null for a one-off date that has already passed — the countdown for
 * "the day we met" is not a countdown, it is a memory.
 */
export function nextOccurrence(
  anchor: CalendarDate,
  cadence: Cadence,
  from: CalendarDate,
): CalendarDate | null {
  if (cadence === 'none') {
    return compareDates(anchor, from) >= 0 ? anchor : null;
  }

  const step = cadence === 'monthly' ? addMonths : addYears;
  const elapsed = cadence === 'monthly' ? monthsBetween(anchor, from) : yearsBetween(anchor, from);

  let k = Math.max(0, elapsed);
  let candidate = step(anchor, k);
  // At most a couple of iterations: clamping can push a candidate one period
  // short (31 Jan -> 28 Feb), never more.
  while (compareDates(candidate, from) < 0) {
    k += 1;
    candidate = step(anchor, k);
  }
  return candidate;
}

export interface Occurrence {
  source: ImportantDateLike;
  date: CalendarDate;
  daysUntil: number;
  /**
   * Which one this is — the 29th birthday, the 7th monthiversary. Null when
   * the anchor is in the future or the date does not recur.
   */
  ordinal: number | null;
}

export function occurrenceFor(
  source: ImportantDateLike,
  from: CalendarDate,
): Occurrence | null {
  const cadence = cadenceFor(source.type, source.recurring);
  const date = nextOccurrence(source.date, cadence, from);
  if (!date) return null;

  let ordinal: number | null = null;
  if (cadence === 'yearly') {
    const years = yearsBetween(source.date, date);
    ordinal = years > 0 ? years : null;
  } else if (cadence === 'monthly') {
    const months = monthsBetween(source.date, date);
    ordinal = months > 0 ? months : null;
  }

  return { source, date, daysUntil: daysBetween(from, date), ordinal };
}

/** Upcoming dates, soonest first. `withinDays` of null means "all of them". */
export function upcomingOccurrences(
  dates: readonly ImportantDateLike[],
  from: CalendarDate,
  withinDays: number | null = null,
  limit = Number.POSITIVE_INFINITY,
): Occurrence[] {
  const occurrences: Occurrence[] = [];
  for (const source of dates) {
    const occurrence = occurrenceFor(source, from);
    if (!occurrence) continue;
    if (withinDays !== null && occurrence.daysUntil > withinDays) continue;
    occurrences.push(occurrence);
  }
  occurrences.sort(
    (a, b) => a.daysUntil - b.daysUntil || a.source.label.localeCompare(b.source.label),
  );
  return Number.isFinite(limit) ? occurrences.slice(0, limit) : occurrences;
}

/** One-off dates that have already happened, most recent first. */
export function pastOccurrences(
  dates: readonly ImportantDateLike[],
  from: CalendarDate,
): ImportantDateLike[] {
  return dates
    .filter((d) => cadenceFor(d.type, d.recurring) === 'none' && compareDates(d.date, from) < 0)
    .sort((a, b) => compareDates(b.date, a.date));
}

/* ------------------------------------------------------------------ *
 * Time together
 * ------------------------------------------------------------------ */

export function daysTogether(anniversary: CalendarDate, from: CalendarDate): number {
  return Math.max(0, daysBetween(anniversary, from));
}

export function monthsTogether(anniversary: CalendarDate, from: CalendarDate): number {
  return Math.max(0, monthsBetween(anniversary, from));
}

export function nextMonthiversary(
  anniversary: CalendarDate,
  from: CalendarDate,
): { date: CalendarDate; months: number; daysUntil: number } | null {
  const date = nextOccurrence(anniversary, 'monthly', from);
  if (!date) return null;
  const months = monthsBetween(anniversary, date);
  if (months <= 0) return null;
  return { date, months, daysUntil: daysBetween(from, date) };
}

/**
 * Round-number day counts worth noticing — 100 days, 500 days, 1000 days.
 * Deliberately sparse: a milestone every week is not a milestone.
 */
export function nextRoundDayMilestone(
  anniversary: CalendarDate,
  from: CalendarDate,
  withinDays = 30,
): { days: number; date: CalendarDate; daysUntil: number } | null {
  const elapsed = daysTogether(anniversary, from);
  const steps = [100, 200, 300, 365, 500, 730, 1000, 1095, 1500, 1825, 2000];
  for (const step of steps) {
    if (step <= elapsed) continue;
    const daysUntil = step - elapsed;
    if (daysUntil > withinDays) return null;
    return { days: step, date: addDays(from, daysUntil), daysUntil };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Describing a countdown (as data, so the UI can translate it)
 * ------------------------------------------------------------------ */

export type Countdown =
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'inDays'; days: number }
  | { kind: 'inWeeks'; weeks: number; days: number }
  | { kind: 'yesterday' }
  | { kind: 'daysAgo'; days: number };

export function describeCountdown(days: number): Countdown {
  if (days === 0) return { kind: 'today' };
  if (days === 1) return { kind: 'tomorrow' };
  if (days === -1) return { kind: 'yesterday' };
  if (days < 0) return { kind: 'daysAgo', days: Math.abs(days) };
  if (days < 14) return { kind: 'inDays', days };
  return { kind: 'inWeeks', weeks: Math.floor(days / 7), days };
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export type DateStyle = 'long' | 'medium' | 'short' | 'dayMonth';

const DATE_STYLE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  short: { day: '2-digit', month: '2-digit', year: '2-digit' },
  dayMonth: { day: 'numeric', month: 'long' },
};

/**
 * Formats in UTC on purpose: the CalendarDate has no timezone, so pinning the
 * formatter to UTC is what stops "3 May" rendering as "2 May" west of London.
 */
export function formatDate(
  date: CalendarDate,
  style: DateStyle = 'medium',
  locale = 'en-GB',
): string {
  const instant = new Date(Date.UTC(date.year, date.month - 1, date.day));
  try {
    return new Intl.DateTimeFormat(locale, {
      ...DATE_STYLE_OPTIONS[style],
      timeZone: 'UTC',
    }).format(instant);
  } catch {
    return `${date.day}/${date.month}/${date.year}`;
  }
}

/** Just the month, abbreviated — for the little date block on the home card. */
export function formatMonthShort(date: CalendarDate, locale = 'en-GB'): string {
  const instant = new Date(Date.UTC(date.year, date.month - 1, 1));
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(instant);
  } catch {
    return String(date.month);
  }
}

export function formatMonthYear(date: CalendarDate, locale = 'en-GB'): string {
  const instant = new Date(Date.UTC(date.year, date.month - 1, 1));
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(instant);
  } catch {
    return `${date.month}/${date.year}`;
  }
}

/* ------------------------------------------------------------------ *
 * Month grid
 * ------------------------------------------------------------------ */

export interface MonthCell {
  date: CalendarDate;
  /** False for the leading and trailing days borrowed from adjacent months. */
  inMonth: boolean;
  isToday: boolean;
}

/**
 * A month laid out as whole weeks.
 *
 * Always six rows. A month can genuinely span six weeks, and a grid that
 * changes height as you page through the year makes everything below it
 * jump — so the shape is constant and the spare row is simply next month's
 * first days, greyed.
 *
 * `weekStartsOn` is 1 for Monday, which is what both Brazil and China use.
 */
export function monthGrid(
  year: number,
  month: number,
  today: CalendarDate,
  weekStartsOn = 1,
): MonthCell[][] {
  const first: CalendarDate = { year, month, day: 1 };
  // How far back to reach for the first cell of the grid.
  const firstWeekday = (((toEpochDay(first) + 4) % 7) + 7) % 7; // 0 = Sunday
  const lead = (firstWeekday - weekStartsOn + 7) % 7;
  const start = addDays(first, -lead);

  const weeks: MonthCell[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const row: MonthCell[] = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(start, week * 7 + day);
      row.push({
        date,
        inMonth: date.year === year && date.month === month,
        isToday: isSameDay(date, today),
      });
    }
    weeks.push(row);
  }
  return weeks;
}

/** Groups dated records into month buckets, newest first — for the timeline. */
export function groupByMonth<T>(
  items: readonly T[],
  getDate: (item: T) => CalendarDate,
): { key: string; month: CalendarDate; items: T[] }[] {
  const buckets = new Map<string, { month: CalendarDate; items: T[] }>();
  for (const item of items) {
    const date = getDate(item);
    const key = `${date.year}-${String(date.month).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.items.push(item);
    } else {
      buckets.set(key, { month: { year: date.year, month: date.month, day: 1 }, items: [item] });
    }
  }
  return [...buckets.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => compareDates(b.month, a.month));
}
