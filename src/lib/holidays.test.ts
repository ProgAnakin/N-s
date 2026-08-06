import { describe, expect, it } from 'vitest';
import {
  carnivalTuesday,
  easterSunday,
  holidaysIn,
  lunarTableCovers,
  LUNAR_TABLE_FROM,
  LUNAR_TABLE_TO,
  upcomingHolidays,
} from './holidays';
import { daysBetween, weekdayOf } from './calendar';

describe('easterSunday', () => {
  it('matches known dates', () => {
    expect(easterSunday(2024)).toEqual({ year: 2024, month: 3, day: 31 });
    expect(easterSunday(2025)).toEqual({ year: 2025, month: 4, day: 20 });
    expect(easterSunday(2026)).toEqual({ year: 2026, month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ year: 2027, month: 3, day: 28 });
    expect(easterSunday(2030)).toEqual({ year: 2030, month: 4, day: 21 });
  });

  it('always lands on a Sunday', () => {
    for (let year = 2020; year <= 2060; year += 1) {
      expect(weekdayOf(easterSunday(year))).toBe('sunday');
    }
  });

  it('stays inside the range Easter can occupy', () => {
    for (let year = 1900; year <= 2200; year += 1) {
      const easter = easterSunday(year);
      const early = daysBetween({ year, month: 3, day: 22 }, easter);
      const late = daysBetween(easter, { year, month: 4, day: 25 });
      expect(early).toBeGreaterThanOrEqual(0);
      expect(late).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('carnivalTuesday', () => {
  it('is 47 days before Easter, and a Tuesday', () => {
    for (let year = 2024; year <= 2035; year += 1) {
      const carnival = carnivalTuesday(year);
      expect(daysBetween(carnival, easterSunday(year))).toBe(47);
      expect(weekdayOf(carnival)).toBe('tuesday');
    }
  });

  it('matches known Brazilian carnivals', () => {
    expect(carnivalTuesday(2025)).toEqual({ year: 2025, month: 3, day: 4 });
    expect(carnivalTuesday(2026)).toEqual({ year: 2026, month: 2, day: 17 });
  });
});

describe('holidaysIn', () => {
  it('returns the year in date order', () => {
    const list = holidaysIn(2026);
    for (let i = 1; i < list.length; i += 1) {
      expect(daysBetween(list[i - 1]!.date, list[i]!.date)).toBeGreaterThanOrEqual(0);
    }
  });

  it('carries both cultures', () => {
    const cultures = new Set(holidaysIn(2026).map((holiday) => holiday.culture));
    expect(cultures.has('chinese')).toBe(true);
    expect(cultures.has('brazilian')).toBe(true);
  });

  it('puts lovers’ day in June, not February', () => {
    const namorados = holidaysIn(2026).find((h) => h.id === 'dia_dos_namorados');
    expect(namorados?.date).toEqual({ year: 2026, month: 6, day: 12 });
  });

  it('flags which dates came from the lookup table', () => {
    const list = holidaysIn(2026);
    expect(list.find((h) => h.id === 'chinese_new_year')?.tabulated).toBe(true);
    expect(list.find((h) => h.id === 'carnival')?.tabulated).toBe(false);
  });

  it('goes quiet on the lunisolar dates past the table, rather than guessing', () => {
    const beyond = holidaysIn(LUNAR_TABLE_TO + 5);
    expect(beyond.some((h) => h.id === 'chinese_new_year')).toBe(false);
    // The computed and fixed dates keep working forever.
    expect(beyond.some((h) => h.id === 'carnival')).toBe(true);
    expect(beyond.some((h) => h.id === 'dia_dos_namorados')).toBe(true);
  });

  it('covers every year it claims to', () => {
    for (let year = LUNAR_TABLE_FROM; year <= LUNAR_TABLE_TO; year += 1) {
      expect(lunarTableCovers(year)).toBe(true);
      const list = holidaysIn(year);
      expect(list.some((h) => h.id === 'chinese_new_year')).toBe(true);
      expect(list.some((h) => h.id === 'mid_autumn')).toBe(true);
    }
  });
});

describe('upcomingHolidays', () => {
  it('finds what is close', () => {
    const soon = upcomingHolidays({ year: 2026, month: 6, day: 1 }, 30);
    expect(soon.map((h) => h.id)).toContain('dia_dos_namorados');
  });

  it('looks across the year boundary', () => {
    // Chinese New Year 2027 falls in February; from mid-December it should
    // already be visible.
    const soon = upcomingHolidays({ year: 2026, month: 12, day: 20 }, 60);
    expect(soon.some((h) => h.id === 'new_year' || h.id === 'christmas')).toBe(true);
    const wide = upcomingHolidays({ year: 2027, month: 1, day: 10 }, 45);
    expect(wide.some((h) => h.id === 'chinese_new_year')).toBe(true);
  });

  it('never looks backwards', () => {
    const soon = upcomingHolidays({ year: 2026, month: 6, day: 20 }, 45);
    expect(soon.every((holiday) => holiday.daysUntil >= 0)).toBe(true);
  });

  it('respects the horizon and the limit', () => {
    expect(upcomingHolidays({ year: 2026, month: 1, day: 1 }, 3).length).toBeLessThanOrEqual(1);
    expect(upcomingHolidays({ year: 2026, month: 1, day: 1 }, 365, 2)).toHaveLength(2);
  });
});
