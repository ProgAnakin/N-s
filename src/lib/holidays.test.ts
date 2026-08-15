import { describe, expect, it } from 'vitest';
import {
  carnivalTuesday,
  coupleCountries,
  COUNTRIES,
  easterSunday,
  holidaysIn,
  lunarTableCovers,
  LUNAR_TABLE_FROM,
  LUNAR_TABLE_TO,
  SUPPORTED_COUNTRIES,
  upcomingHolidays,
} from './holidays';
import { WEEKDAY_NAMES, weekdayOf, type CalendarDate } from './calendar';

const BR_CN = ['BR', 'CN'];

describe('easterSunday', () => {
  it('matches known dates', () => {
    expect(easterSunday(2025)).toEqual({ year: 2025, month: 4, day: 20 });
    expect(easterSunday(2026)).toEqual({ year: 2026, month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ year: 2027, month: 3, day: 28 });
  });

  it('always lands on a Sunday', () => {
    for (let year = 2020; year <= 2060; year += 1) {
      expect(weekdayOf(easterSunday(year))).toBe('sunday');
    }
  });

  it('stays inside the range Easter can occupy', () => {
    for (let year = 2020; year <= 2060; year += 1) {
      const { month, day } = easterSunday(year);
      const afterMarch21 = month > 3 || day >= 22;
      const beforeApril26 = month < 4 || day <= 25;
      expect(afterMarch21 && beforeApril26).toBe(true);
    }
  });
});

describe('carnivalTuesday', () => {
  it('is a Tuesday, every year', () => {
    for (let year = 2024; year <= 2035; year += 1) {
      expect(WEEKDAY_NAMES).toContain(weekdayOf(carnivalTuesday(year)));
      expect(weekdayOf(carnivalTuesday(year))).toBe('tuesday');
    }
  });

  it('matches known Brazilian carnivals', () => {
    expect(carnivalTuesday(2025)).toEqual({ year: 2025, month: 3, day: 4 });
    expect(carnivalTuesday(2026)).toEqual({ year: 2026, month: 2, day: 17 });
  });
});

describe('the registry', () => {
  it('knows more than the one couple it was written for', () => {
    // The whole point of the rewrite: this file used to be Brazil and China.
    expect(SUPPORTED_COUNTRIES.length).toBeGreaterThan(6);
    expect(SUPPORTED_COUNTRIES).toEqual([...SUPPORTED_COUNTRIES].sort());
  });

  it('gives every country at least one romantic date', () => {
    // A country with no lovers' day contributes nothing to the feature this
    // module exists for.
    for (const [code, rules] of Object.entries(COUNTRIES)) {
      expect(
        rules.some((rule) => rule.weight === 'romantic'),
        code,
      ).toBe(true);
    }
  });

  it('has no duplicate rule ids inside one country', () => {
    for (const [code, rules] of Object.entries(COUNTRIES)) {
      const ids = rules.map((rule) => rule.id);
      expect(new Set(ids).size, code).toBe(ids.length);
    }
  });
});

describe('holidaysIn', () => {
  it('returns the year in date order', () => {
    const list = holidaysIn(2026, BR_CN);
    const days = list.map((holiday) => holiday.date.month * 100 + holiday.date.day);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it('gives universal dates to everybody, with no country attached', () => {
    const newYear = holidaysIn(2026, []).find((holiday) => holiday.id === 'new_year');
    expect(newYear?.date).toEqual({ year: 2026, month: 1, day: 1 });
    expect(newYear?.countries).toEqual([]);
  });

  it('only returns what the given countries actually celebrate', () => {
    const italian = holidaysIn(2026, ['IT']);
    expect(italian.some((holiday) => holiday.id === 'ferragosto')).toBe(true);
    expect(italian.some((holiday) => holiday.id === 'carnaval')).toBe(false);
  });

  it('puts Brazil’s lovers’ day in June, not February', () => {
    const namorados = holidaysIn(2026, BR_CN).find(
      (holiday) => holiday.id === 'dia_dos_namorados',
    );
    expect(namorados?.date).toEqual({ year: 2026, month: 6, day: 12 });
    expect(namorados?.weight).toBe('romantic');
  });

  it('puts China’s lovers’ day on Qixi, not 14 February', () => {
    const qixi = holidaysIn(2026, ['CN']).find((holiday) => holiday.id === 'qixi');
    expect(qixi?.weight).toBe('romantic');
    expect(qixi?.date.month).toBe(8);
    // And 14 February is not in a Chinese-only list at all.
    expect(
      holidaysIn(2026, ['CN']).some((h) => h.date.month === 2 && h.date.day === 14),
    ).toBe(false);
  });

  it('lists a shared holiday once, naming both countries', () => {
    // Japan and Korea both keep White Day. Two identical rows side by side
    // would read as a bug.
    const list = holidaysIn(2026, ['JP', 'KR']);
    const whiteDays = list.filter((holiday) => holiday.id === 'white_day');
    expect(whiteDays).toHaveLength(1);
    expect(whiteDays[0]?.countries.slice().sort()).toEqual(['JP', 'KR']);
  });

  it('computes an nth-weekday rule', () => {
    // American Thanksgiving: the fourth Thursday in November.
    const thanksgiving = holidaysIn(2026, ['US']).find(
      (holiday) => holiday.id === 'thanksgiving_us',
    );
    expect(thanksgiving?.date).toEqual({ year: 2026, month: 11, day: 26 });
    expect(weekdayOf(thanksgiving!.date)).toBe('thursday');
  });

  it('computes an easter-relative rule', () => {
    const carnaval = holidaysIn(2026, ['BR']).find((holiday) => holiday.id === 'carnaval');
    expect(carnaval?.date).toEqual(carnivalTuesday(2026));
  });

  it('flags which dates came from the lookup table', () => {
    const list = holidaysIn(2026, BR_CN);
    expect(list.find((holiday) => holiday.id === 'chinese_new_year')?.tabulated).toBe(true);
    expect(list.find((holiday) => holiday.id === 'carnaval')?.tabulated).toBe(false);
  });

  it('goes quiet on the lunisolar dates past the table, rather than guessing', () => {
    const beyond = holidaysIn(LUNAR_TABLE_TO + 1, BR_CN);
    expect(beyond.some((holiday) => holiday.id === 'chinese_new_year')).toBe(false);
    // Everything computable still works, so the section is not empty.
    expect(beyond.some((holiday) => holiday.id === 'carnaval')).toBe(true);
  });

  it('covers every year it claims to', () => {
    for (let year = LUNAR_TABLE_FROM; year <= LUNAR_TABLE_TO; year += 1) {
      const list = holidaysIn(year, ['CN']);
      for (const id of ['chinese_new_year', 'qixi', 'dragon_boat', 'mid_autumn']) {
        expect(
          list.some((holiday) => holiday.id === id),
          `${id} ${year}`,
        ).toBe(true);
      }
    }
  });

  it('ignores a country code it does not know', () => {
    expect(() => holidaysIn(2026, ['ZZ'])).not.toThrow();
    expect(holidaysIn(2026, ['ZZ'])).toEqual(holidaysIn(2026, []));
  });
});

describe('upcomingHolidays', () => {
  const march = { year: 2026, month: 3, day: 1 } satisfies CalendarDate;

  it('finds what is close', () => {
    const list = upcomingHolidays(march, BR_CN, { withinDays: 120 });
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].daysUntil).toBeGreaterThanOrEqual(0);
  });

  it('looks across the year boundary', () => {
    // Chinese New Year is in February; from December it must still be found,
    // which is exactly when the warning is worth anything.
    const december = { year: 2025, month: 12, day: 20 };
    const list = upcomingHolidays(december, ['CN'], { withinDays: 90, limit: 10 });
    expect(list.some((holiday) => holiday.id === 'chinese_new_year')).toBe(true);
  });

  it('never looks backwards', () => {
    const list = upcomingHolidays(march, BR_CN, { withinDays: 365, limit: 50 });
    expect(list.every((holiday) => holiday.daysUntil >= 0)).toBe(true);
  });

  it('respects the horizon and the limit', () => {
    const list = upcomingHolidays(march, BR_CN, { withinDays: 10, limit: 2 });
    expect(list.length).toBeLessThanOrEqual(2);
    expect(list.every((holiday) => holiday.daysUntil <= 10)).toBe(true);
  });
});

describe('coupleCountries', () => {
  it('takes both, sorted and deduplicated', () => {
    expect(coupleCountries('BR', 'CN')).toEqual(['BR', 'CN']);
    expect(coupleCountries('CN', 'BR')).toEqual(['BR', 'CN']);
    expect(coupleCountries('IT', 'IT')).toEqual(['IT']);
  });

  it('copes with somebody who has not said yet', () => {
    expect(coupleCountries('BR', null)).toEqual(['BR']);
    expect(coupleCountries(null, null)).toEqual([]);
    expect(coupleCountries(undefined, 'CN')).toEqual(['CN']);
  });

  it('drops a code the registry does not know, rather than throwing', () => {
    // The value comes from a text column somebody could have typed into.
    expect(coupleCountries('BR', 'ZZ')).toEqual(['BR']);
  });
});

describe('lunarTableCovers', () => {
  it('is honest about its horizon', () => {
    expect(lunarTableCovers(LUNAR_TABLE_FROM)).toBe(true);
    expect(lunarTableCovers(LUNAR_TABLE_TO)).toBe(true);
    expect(lunarTableCovers(LUNAR_TABLE_TO + 1)).toBe(false);
    expect(lunarTableCovers(LUNAR_TABLE_FROM - 1)).toBe(false);
  });
});
