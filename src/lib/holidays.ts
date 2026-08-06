/**
 * The dates each of them grew up with.
 *
 * A cross-cultural relationship has a specific, avoidable failure: the
 * holidays that carry weight for one person are invisible to the other,
 * because they are not on their calendar and were never on their calendar.
 * Missing 春节 is not like forgetting a bank holiday — it is the family
 * holiday, and being wished well on it lands accordingly.
 *
 * There is a matching trap in the other direction: in Brazil, lovers'
 * day is 12 June, not 14 February. Turning up with flowers in February and
 * nothing in June is a classic and entirely preventable miss.
 *
 * Two kinds of date live here:
 *
 * - **Computed.** Carnaval and Easter are derived, exactly, by algorithm.
 * - **Tabulated.** The Chinese festivals follow the lunisolar calendar,
 *   which cannot be honestly reduced to a formula in a few lines. They are
 *   a lookup table with a stated horizon, and the app degrades to silence
 *   past it rather than to a confident wrong answer. Verify the table
 *   before extending it — a wrong date here is worse than no date.
 */

import type { CalendarDate } from './calendar';
import { addDays, compareDates, daysBetween } from './calendar';

export type HolidayCulture = 'chinese' | 'brazilian' | 'shared';

export interface Holiday {
  id: string;
  culture: HolidayCulture;
  date: CalendarDate;
  /** True when the date came from the lookup table rather than an algorithm. */
  tabulated: boolean;
}

/* ------------------------------------------------------------------ *
 * Computed: Easter, and everything hanging off it
 * ------------------------------------------------------------------ */

/**
 * Gregorian Easter Sunday, by the anonymous Gregorian algorithm.
 * Exact for every year in the Gregorian calendar.
 */
export function easterSunday(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

/** Carnaval Tuesday: 47 days before Easter. */
export function carnivalTuesday(year: number): CalendarDate {
  return addDays(easterSunday(year), -47);
}

/* ------------------------------------------------------------------ *
 * Tabulated: the lunisolar festivals
 * ------------------------------------------------------------------ */

/** The years the table covers. Past this, these festivals are simply absent. */
export const LUNAR_TABLE_FROM = 2025;
export const LUNAR_TABLE_TO = 2030;

/** `[month, day]` in the Gregorian calendar, by year. */
const CHINESE_NEW_YEAR: Record<number, [number, number]> = {
  2025: [1, 29],
  2026: [2, 17],
  2027: [2, 6],
  2028: [1, 26],
  2029: [2, 13],
  2030: [2, 3],
};

const MID_AUTUMN: Record<number, [number, number]> = {
  2025: [10, 6],
  2026: [9, 25],
  2027: [9, 15],
  2028: [10, 3],
  2029: [9, 22],
  2030: [9, 12],
};

function tabulated(
  table: Record<number, [number, number]>,
  year: number,
): CalendarDate | null {
  const entry = table[year];
  return entry ? { year, month: entry[0], day: entry[1] } : null;
}

/* ------------------------------------------------------------------ *
 * The year's list
 * ------------------------------------------------------------------ */

export function holidaysIn(year: number): Holiday[] {
  const list: Holiday[] = [];
  const push = (
    id: string,
    culture: HolidayCulture,
    date: CalendarDate | null,
    isTabulated = false,
  ) => {
    if (date) list.push({ id, culture, date, tabulated: isTabulated });
  };

  // --- Hers ----------------------------------------------------------
  push('chinese_new_year', 'chinese', tabulated(CHINESE_NEW_YEAR, year), true);
  push('mid_autumn', 'chinese', tabulated(MID_AUTUMN, year), true);
  // Fixed in the Gregorian calendar.
  push('national_day_cn', 'chinese', { year, month: 10, day: 1 });

  // --- His -----------------------------------------------------------
  push('carnival', 'brazilian', carnivalTuesday(year));
  // The one that catches people out: Brazil's lovers' day is in June.
  push('dia_dos_namorados', 'brazilian', { year, month: 6, day: 12 });
  push('sao_joao', 'brazilian', { year, month: 6, day: 24 });
  push('independencia', 'brazilian', { year, month: 9, day: 7 });

  // --- Both ----------------------------------------------------------
  push('new_year', 'shared', { year, month: 1, day: 1 });
  push('christmas', 'shared', { year, month: 12, day: 25 });

  return list.sort((a, b) => compareDates(a.date, b.date));
}

/**
 * The next holidays from a given day, looking across the year boundary so
 * that Chinese New Year in late January is still visible in December.
 */
export function upcomingHolidays(
  from: CalendarDate,
  withinDays = 45,
  limit = 3,
): (Holiday & { daysUntil: number })[] {
  const candidates = [...holidaysIn(from.year), ...holidaysIn(from.year + 1)];

  return candidates
    .map((holiday) => ({ ...holiday, daysUntil: daysBetween(from, holiday.date) }))
    .filter((holiday) => holiday.daysUntil >= 0 && holiday.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, limit);
}

/** Whether the lunisolar table still covers a year. */
export function lunarTableCovers(year: number): boolean {
  return year >= LUNAR_TABLE_FROM && year <= LUNAR_TABLE_TO;
}
