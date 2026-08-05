import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addYears,
  compareDates,
  daysBetween,
  daysInMonth,
  fromEpochDay,
  isLeapYear,
  isValidDate,
  monthsBetween,
  parseISODate,
  toEpochDay,
  toISODate,
  today,
  weekdayOf,
  yearsBetween,
  type CalendarDate,
} from './calendar';

const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });

describe('parsing and formatting', () => {
  it('reads a plain ISO date', () => {
    expect(parseISODate('2026-03-14')).toEqual(d(2026, 3, 14));
  });

  it('reads only the date part of a timestamp, ignoring time and zone', () => {
    // The classic bug: a birthday drifting a day because of a timezone.
    expect(parseISODate('2026-03-14T23:30:00+09:00')).toEqual(d(2026, 3, 14));
    expect(parseISODate('2026-03-14T00:30:00Z')).toEqual(d(2026, 3, 14));
  });

  it('returns null for junk rather than throwing', () => {
    expect(parseISODate('')).toBeNull();
    expect(parseISODate(null)).toBeNull();
    expect(parseISODate(undefined)).toBeNull();
    expect(parseISODate('not a date')).toBeNull();
    expect(parseISODate('2026-02-30')).toBeNull();
    expect(parseISODate('2026-13-01')).toBeNull();
  });

  it('round-trips', () => {
    expect(toISODate(d(2026, 3, 4))).toBe('2026-03-04');
    expect(parseISODate(toISODate(d(1999, 12, 31)))).toEqual(d(1999, 12, 31));
  });

  it('reads today from the local clock', () => {
    const now = new Date(2026, 6, 9, 23, 45);
    expect(today(now)).toEqual(d(2026, 7, 9));
  });
});

describe('leap years', () => {
  it('follows the Gregorian rule, including the century exceptions', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('gives February the right length', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('accepts 29 February only in a leap year', () => {
    expect(isValidDate(d(2024, 2, 29))).toBe(true);
    expect(isValidDate(d(2026, 2, 29))).toBe(false);
  });
});

describe('epoch day conversion', () => {
  it('anchors on the Unix epoch', () => {
    expect(toEpochDay(d(1970, 1, 1))).toBe(0);
    expect(fromEpochDay(0)).toEqual(d(1970, 1, 1));
  });

  it('round-trips across a long span of dates', () => {
    for (let day = -30000; day <= 30000; day += 137) {
      expect(toEpochDay(fromEpochDay(day))).toBe(day);
    }
  });

  it('agrees with UTC Date arithmetic', () => {
    for (const date of [d(2026, 3, 14), d(2000, 2, 29), d(1969, 7, 20), d(2100, 1, 1)]) {
      const utc = Date.UTC(date.year, date.month - 1, date.day) / 86400000;
      expect(toEpochDay(date)).toBe(utc);
    }
  });
});

describe('arithmetic', () => {
  it('counts days between dates, in both directions', () => {
    expect(daysBetween(d(2026, 3, 1), d(2026, 3, 14))).toBe(13);
    expect(daysBetween(d(2026, 3, 14), d(2026, 3, 1))).toBe(-13);
    expect(daysBetween(d(2026, 3, 14), d(2026, 3, 14))).toBe(0);
  });

  it('crosses a leap day correctly', () => {
    expect(daysBetween(d(2024, 2, 28), d(2024, 3, 1))).toBe(2);
    expect(daysBetween(d(2026, 2, 28), d(2026, 3, 1))).toBe(1);
  });

  it('adds days across a year boundary', () => {
    expect(addDays(d(2026, 12, 30), 3)).toEqual(d(2027, 1, 2));
    expect(addDays(d(2026, 1, 2), -3)).toEqual(d(2025, 12, 30));
  });

  it('clamps to the end of the month when adding months', () => {
    expect(addMonths(d(2026, 1, 31), 1)).toEqual(d(2026, 2, 28));
    expect(addMonths(d(2024, 1, 31), 1)).toEqual(d(2024, 2, 29));
    expect(addMonths(d(2026, 1, 31), 3)).toEqual(d(2026, 4, 30));
    expect(addMonths(d(2026, 3, 15), -3)).toEqual(d(2025, 12, 15));
  });

  it('does not let a clamped month drift permanently', () => {
    // Computed from the anchor each time: the 31st stays the 31st.
    expect(addMonths(d(2026, 1, 31), 2)).toEqual(d(2026, 3, 31));
  });

  it('clamps 29 February when adding years', () => {
    expect(addYears(d(2024, 2, 29), 1)).toEqual(d(2025, 2, 28));
    expect(addYears(d(2024, 2, 29), 4)).toEqual(d(2028, 2, 29));
  });

  it('counts whole months only once the day of month is reached', () => {
    expect(monthsBetween(d(2026, 1, 15), d(2026, 3, 14))).toBe(1);
    expect(monthsBetween(d(2026, 1, 15), d(2026, 3, 15))).toBe(2);
    expect(monthsBetween(d(2026, 3, 15), d(2026, 1, 15))).toBe(-2);
  });

  it('counts whole years the way ages work', () => {
    expect(yearsBetween(d(1996, 5, 20), d(2026, 5, 19))).toBe(29);
    expect(yearsBetween(d(1996, 5, 20), d(2026, 5, 20))).toBe(30);
  });

  it('orders dates', () => {
    expect(compareDates(d(2026, 1, 1), d(2026, 1, 2))).toBeLessThan(0);
    expect(compareDates(d(2026, 2, 1), d(2026, 1, 2))).toBeGreaterThan(0);
    expect(compareDates(d(2026, 1, 1), d(2026, 1, 1))).toBe(0);
  });

  it('knows the weekday', () => {
    expect(weekdayOf(d(1970, 1, 1))).toBe('thursday');
    expect(weekdayOf(d(2026, 3, 14))).toBe('saturday');
  });
});
