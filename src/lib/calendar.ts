/**
 * Timezone-safe calendar arithmetic.
 *
 * Everything in this app that is a *date* (an anniversary, a birthday, the
 * day a memory happened) is a calendar date, not an instant. Storing those as
 * `Date` objects invites the classic bug where an anniversary quietly shifts a
 * day depending on the user's timezone or DST. So we model a calendar date as
 * three integers and do the arithmetic ourselves.
 *
 * The day-count conversion is the standard civil-from-days / days-from-civil
 * pair (Howard Hinnant's algorithm) — exact integer maths, valid across the
 * proleptic Gregorian calendar, and trivial to port to Dart later.
 *
 * No imports. No framework. No `Date` except when reading "what is today".
 */

export interface CalendarDate {
  /** Full year, e.g. 2026. */
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

export function isValidDate(date: CalendarDate): boolean {
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) {
    return false;
  }
  if (date.month < 1 || date.month > 12) return false;
  return date.day >= 1 && date.day <= daysInMonth(date.year, date.month);
}

/**
 * Parses `YYYY-MM-DD`. Also tolerates a full ISO timestamp by reading only the
 * date part — deliberately ignoring the time and zone, because a birthday has
 * neither. Returns null rather than throwing: bad data in a personal app
 * should degrade quietly, not blank the screen.
 */
export function parseISODate(input: string | null | undefined): CalendarDate | null {
  if (!input) return null;
  const match = ISO_DATE.exec(input);
  if (!match) return null;
  const date: CalendarDate = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  return isValidDate(date) ? date : null;
}

export function toISODate(date: CalendarDate): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}

/** Today in the runtime's local timezone. The only place we touch `Date`. */
export function today(now: Date = new Date()): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Days since 1970-01-01. */
export function toEpochDay(date: CalendarDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const monthShift = date.month + (date.month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthShift + 2) / 5) + date.day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export function fromEpochDay(epochDay: number): CalendarDate {
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const y = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: month <= 2 ? y + 1 : y, month, day };
}

/** Positive when `b` is later than `a`. */
export function daysBetween(a: CalendarDate, b: CalendarDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return toEpochDay(a) - toEpochDay(b);
}

export function isSameDay(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/**
 * Adds months, clamping to the end of the target month. 31 Jan + 1 month is
 * 28 Feb, not 3 March — which is what a human means by "the monthly one".
 */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/** Adds years, clamping 29 Feb to 28 Feb in a common year. */
export function addYears(date: CalendarDate, years: number): CalendarDate {
  const year = date.year + years;
  return { year, month: date.month, day: Math.min(date.day, daysInMonth(year, date.month)) };
}

/** Whole months elapsed between two dates (the day-of-month must be reached). */
export function monthsBetween(from: CalendarDate, to: CalendarDate): number {
  let months = (to.year - from.year) * 12 + (to.month - from.month);
  if (months > 0 && compareDates(addMonths(from, months), to) > 0) months -= 1;
  if (months < 0 && compareDates(addMonths(from, months), to) < 0) months += 1;
  return months;
}

/** Whole years elapsed — i.e. someone's age on a given day. */
export function yearsBetween(from: CalendarDate, to: CalendarDate): number {
  let years = to.year - from.year;
  if (years > 0 && compareDates(addYears(from, years), to) > 0) years -= 1;
  if (years < 0 && compareDates(addYears(from, years), to) < 0) years += 1;
  return years;
}

export const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

export function weekdayOf(date: CalendarDate): WeekdayName {
  // 1970-01-01 was a Thursday (index 4).
  const index = (((toEpochDay(date) + 4) % 7) + 7) % 7;
  return WEEKDAY_NAMES[index];
}
