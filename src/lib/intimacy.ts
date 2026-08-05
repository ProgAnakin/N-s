/**
 * The intimacy log.
 *
 * A count is the easiest thing in the world to turn into a scoreboard, and
 * this is the last place that should happen. So the same rule the spending
 * feature lives under applies here: this module reports what happened, and
 * never a target, a streak to protect, a "you're behind this month", or a
 * comparison with anyone. There is no goal in this file.
 *
 * `daysSinceLast` is the one figure that could read as a nudge, so it is
 * offered as a plain fact for the UI to use gently or not at all.
 */

import type { CalendarDate } from './calendar';
import { compareDates, daysBetween } from './calendar';

export type IntimacyKind = 'affection' | 'kiss' | 'massage' | 'foreplay' | 'sex' | 'other';

export const INTIMACY_KINDS: readonly IntimacyKind[] = [
  'affection',
  'kiss',
  'massage',
  'foreplay',
  'sex',
  'other',
];

export interface IntimacyEntry {
  id: string;
  date: CalendarDate;
  kind: IntimacyKind;
  place: string | null;
}

export interface KindCount {
  kind: IntimacyKind;
  count: number;
}

export interface PlaceCount {
  place: string;
  count: number;
}

export interface MonthCount {
  /** `YYYY-MM`, for a stable key and a natural sort. */
  key: string;
  year: number;
  month: number;
  count: number;
}

export interface IntimacySummary {
  total: number;
  /** Entries in the calendar month `today` falls in. */
  thisMonth: number;
  /** Entries in the 30 days up to and including `today`. */
  lastThirtyDays: number;
  byKind: KindCount[];
  /** Most frequent places first. Only places that were written down. */
  places: PlaceCount[];
  /** Oldest month first, so a chart reads left to right. */
  byMonth: MonthCount[];
  /** Null when nothing has been logged. */
  daysSinceLast: number | null;
  /** Distinct days with at least one entry. */
  activeDays: number;
}

function monthKey(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}`;
}

export function summarise(
  entries: readonly IntimacyEntry[],
  today: CalendarDate,
): IntimacySummary {
  const byKind = new Map<IntimacyKind, number>();
  const byPlace = new Map<string, number>();
  const byMonth = new Map<string, MonthCount>();
  const days = new Set<string>();

  let thisMonth = 0;
  let lastThirtyDays = 0;
  let mostRecent: CalendarDate | null = null;

  for (const entry of entries) {
    byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + 1);

    const place = entry.place?.trim();
    if (place) byPlace.set(place, (byPlace.get(place) ?? 0) + 1);

    const key = monthKey(entry.date);
    const bucket = byMonth.get(key);
    if (bucket) bucket.count += 1;
    else byMonth.set(key, { key, year: entry.date.year, month: entry.date.month, count: 1 });

    days.add(`${key}-${String(entry.date.day).padStart(2, '0')}`);

    if (entry.date.year === today.year && entry.date.month === today.month) thisMonth += 1;

    const elapsed = daysBetween(entry.date, today);
    if (elapsed >= 0 && elapsed < 30) lastThirtyDays += 1;

    if (!mostRecent || compareDates(entry.date, mostRecent) > 0) mostRecent = entry.date;
  }

  return {
    total: entries.length,
    thisMonth,
    lastThirtyDays,
    byKind: INTIMACY_KINDS.map((kind) => ({ kind, count: byKind.get(kind) ?? 0 })).filter(
      (entry) => entry.count > 0,
    ),
    places: [...byPlace.entries()]
      .map(([place, count]) => ({ place, count }))
      .sort((a, b) => b.count - a.count || a.place.localeCompare(b.place)),
    byMonth: [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)),
    daysSinceLast: mostRecent ? Math.max(0, daysBetween(mostRecent, today)) : null,
    activeDays: days.size,
  };
}

/** Entries on one day, for the calendar cell. */
export function entriesOn(
  entries: readonly IntimacyEntry[],
  date: CalendarDate,
): IntimacyEntry[] {
  return entries.filter(
    (entry) =>
      entry.date.year === date.year &&
      entry.date.month === date.month &&
      entry.date.day === date.day,
  );
}
