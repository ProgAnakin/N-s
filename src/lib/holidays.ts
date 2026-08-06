import { compareDates, daysBetween, type CalendarDate } from './calendar';

/**
 * The dates each of you grew up with.
 *
 * This used to hardcode Brazil and China, because it was written for one
 * couple. It is now a registry: a country contributes a list of rules, and
 * the app asks for the two (or one, or three) countries that actually apply.
 * Adding Poland is an entry in `COUNTRIES`, not a change to any function.
 *
 * Three kinds of rule, because holidays are computed three different ways:
 *
 *   - **fixed** — the same Gregorian date every year. Most national days.
 *   - **easter** — an offset from Easter Sunday, which is itself exactly
 *     computable. Carnaval is Easter minus 47.
 *   - **nth weekday** — "the fourth Thursday in November". Thanksgiving.
 *   - **table** — lunisolar, and genuinely not reducible to a short formula.
 *     Chinese New Year needs the position of the new moon; any formula short
 *     enough to put here would be wrong somewhere in the next decade.
 *
 * Tabulated dates carry a horizon and the module goes **silent** past it
 * rather than guessing. A missing holiday is a gap somebody notices; a wrong
 * one is a partner wished a happy new year on the wrong day.
 */

/* ------------------------------------------------------------------ *
 * Easter, exactly
 * ------------------------------------------------------------------ */

/**
 * The anonymous Gregorian algorithm. Exact for every year the app will see.
 * Carnaval, Good Friday and Corpus Christi all hang off it.
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

/** Carnaval Tuesday: Easter minus 47 days. */
export function carnivalTuesday(year: number): CalendarDate {
  return addDaysTo(easterSunday(year), -47);
}

function addDaysTo(date: CalendarDate, days: number): CalendarDate {
  const utc = Date.UTC(date.year, date.month - 1, date.day + days);
  const moved = new Date(utc);
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

/** The nth given weekday of a month. `nth = -1` means the last one. */
function nthWeekdayOf(year: number, month: number, weekday: number, nth: number): CalendarDate {
  if (nth > 0) {
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const offset = (weekday - firstWeekday + 7) % 7;
    return { year, month, day: 1 + offset + (nth - 1) * 7 };
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastWeekday = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  const back = (lastWeekday - weekday + 7) % 7;
  return { year, month, day: lastDay - back };
}

/* ------------------------------------------------------------------ *
 * Lunisolar tables
 *
 * Checked by hand against published calendars. The horizon is stated so
 * the interface can say so rather than quietly stopping.
 * ------------------------------------------------------------------ */

export const LUNAR_TABLE_FROM = 2025;
export const LUNAR_TABLE_TO = 2030;

type LunarTable = Record<number, [month: number, day: number]>;

const CHINESE_NEW_YEAR: LunarTable = {
  2025: [1, 29], 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3],
};

/** 端午节 — Dragon Boat, the fifth day of the fifth lunar month. */
const DRAGON_BOAT: LunarTable = {
  2025: [5, 31], 2026: [6, 19], 2027: [6, 9], 2028: [5, 28], 2029: [6, 16], 2030: [6, 5],
};

/** 七夕 — the seventh night. China's own lovers' day, and not 14 February. */
const QIXI: LunarTable = {
  2025: [8, 29], 2026: [8, 19], 2027: [8, 8], 2028: [8, 26], 2029: [8, 16], 2030: [8, 5],
};

/** 中秋节 / 추석 — the same lunar date, so China and Korea share the table. */
const MID_AUTUMN: LunarTable = {
  2025: [10, 6], 2026: [9, 25], 2027: [9, 15], 2028: [10, 3], 2029: [9, 22], 2030: [9, 12],
};

/* ------------------------------------------------------------------ *
 * The registry
 * ------------------------------------------------------------------ */

/**
 * How loudly the app should say it.
 *
 * `romantic` is its own weight rather than a flavour of `major` because it
 * is the one the app exists to catch. Missing your partner's national day is
 * a small embarrassment; missing the day their whole country treats as the
 * day for couples is a different order of mistake — and the whole trap is
 * that it lands on a different date in each country.
 */
export type HolidayWeight = 'romantic' | 'major' | 'notable';

type HolidayRule =
  | { id: string; weight: HolidayWeight; kind: 'fixed'; month: number; day: number }
  | { id: string; weight: HolidayWeight; kind: 'easter'; offsetDays: number }
  | {
      id: string;
      weight: HolidayWeight;
      kind: 'nth-weekday';
      month: number;
      /** 0 = Sunday. */
      weekday: number;
      /** 1-based, or -1 for the last one in the month. */
      nth: number;
    }
  | { id: string; weight: HolidayWeight; kind: 'table'; table: LunarTable };

/** Everybody's, regardless of where they are from. */
const UNIVERSAL: HolidayRule[] = [
  { id: 'new_year', weight: 'major', kind: 'fixed', month: 1, day: 1 },
  { id: 'christmas', weight: 'major', kind: 'fixed', month: 12, day: 25 },
];

/**
 * Countries this app knows about.
 *
 * Adding one is an entry here and a matching block of strings in the i18n
 * file — nothing else. Entries are deliberately short: the two or three
 * dates a partner would actually be hurt to have forgotten, not a public
 * holiday calendar. A long list nobody reads is the same as no list.
 */
export const COUNTRIES: Record<string, HolidayRule[]> = {
  BR: [
    { id: 'carnaval', weight: 'major', kind: 'easter', offsetDays: -47 },
    // The one that catches every foreign partner out.
    { id: 'dia_dos_namorados', weight: 'romantic', kind: 'fixed', month: 6, day: 12 },
    { id: 'sao_joao', weight: 'notable', kind: 'fixed', month: 6, day: 24 },
    { id: 'independencia_br', weight: 'notable', kind: 'fixed', month: 9, day: 7 },
  ],
  CN: [
    { id: 'chinese_new_year', weight: 'major', kind: 'table', table: CHINESE_NEW_YEAR },
    { id: 'qixi', weight: 'romantic', kind: 'table', table: QIXI },
    { id: 'dragon_boat', weight: 'notable', kind: 'table', table: DRAGON_BOAT },
    { id: 'mid_autumn', weight: 'major', kind: 'table', table: MID_AUTUMN },
    { id: 'national_day_cn', weight: 'notable', kind: 'fixed', month: 10, day: 1 },
  ],
  IT: [
    { id: 'san_valentino', weight: 'romantic', kind: 'fixed', month: 2, day: 14 },
    { id: 'epifania', weight: 'notable', kind: 'fixed', month: 1, day: 6 },
    { id: 'festa_repubblica', weight: 'notable', kind: 'fixed', month: 6, day: 2 },
    { id: 'ferragosto', weight: 'major', kind: 'fixed', month: 8, day: 15 },
  ],
  PT: [
    { id: 'dia_dos_namorados_pt', weight: 'romantic', kind: 'fixed', month: 2, day: 14 },
    { id: 'dia_de_portugal', weight: 'notable', kind: 'fixed', month: 6, day: 10 },
    { id: 'santo_antonio', weight: 'notable', kind: 'fixed', month: 6, day: 13 },
  ],
  US: [
    { id: 'valentines', weight: 'romantic', kind: 'fixed', month: 2, day: 14 },
    { id: 'independence_us', weight: 'major', kind: 'fixed', month: 7, day: 4 },
    { id: 'thanksgiving_us', weight: 'major', kind: 'nth-weekday', month: 11, weekday: 4, nth: 4 },
  ],
  ES: [
    { id: 'san_valentin', weight: 'romantic', kind: 'fixed', month: 2, day: 14 },
    { id: 'reyes', weight: 'major', kind: 'fixed', month: 1, day: 6 },
    { id: 'hispanidad', weight: 'notable', kind: 'fixed', month: 10, day: 12 },
  ],
  FR: [
    { id: 'saint_valentin', weight: 'romantic', kind: 'fixed', month: 2, day: 14 },
    { id: 'bastille', weight: 'major', kind: 'fixed', month: 7, day: 14 },
    { id: 'fete_musique', weight: 'notable', kind: 'fixed', month: 6, day: 21 },
  ],
  DE: [
    { id: 'valentinstag', weight: 'romantic', kind: 'fixed', month: 2, day: 14 },
    { id: 'nikolaus', weight: 'notable', kind: 'fixed', month: 12, day: 6 },
    { id: 'einheit', weight: 'notable', kind: 'fixed', month: 10, day: 3 },
  ],
  GB: [
    { id: 'valentines', weight: 'romantic', kind: 'fixed', month: 2, day: 14 },
    { id: 'bonfire_night', weight: 'notable', kind: 'fixed', month: 11, day: 5 },
    { id: 'boxing_day', weight: 'notable', kind: 'fixed', month: 12, day: 26 },
  ],
  MX: [
    { id: 'valentines_mx', weight: 'romantic', kind: 'fixed', month: 2, day: 14 },
    { id: 'independencia_mx', weight: 'major', kind: 'fixed', month: 9, day: 16 },
    { id: 'dia_de_muertos', weight: 'major', kind: 'fixed', month: 11, day: 2 },
  ],
  JP: [
    // Two halves of one custom: she gives on the 14th of February, he gives
    // back a month later. Forgetting the second half is the classic mistake.
    { id: 'white_day', weight: 'romantic', kind: 'fixed', month: 3, day: 14 },
    { id: 'tanabata', weight: 'romantic', kind: 'fixed', month: 7, day: 7 },
    { id: 'golden_week', weight: 'major', kind: 'fixed', month: 4, day: 29 },
  ],
  KR: [
    { id: 'white_day', weight: 'romantic', kind: 'fixed', month: 3, day: 14 },
    { id: 'pepero_day', weight: 'romantic', kind: 'fixed', month: 11, day: 11 },
    { id: 'chuseok', weight: 'major', kind: 'table', table: MID_AUTUMN },
  ],
};

/** Country codes the app has holidays for, for a settings picker. */
export const SUPPORTED_COUNTRIES: string[] = Object.keys(COUNTRIES).sort();

export interface Holiday {
  id: string;
  date: CalendarDate;
  weight: HolidayWeight;
  /** Which of the couple's countries it came from. Empty means universal. */
  countries: string[];
  /** True when the date came from the lookup table rather than an algorithm. */
  tabulated: boolean;
}

function resolve(rule: HolidayRule, year: number): CalendarDate | null {
  switch (rule.kind) {
    case 'fixed':
      return { year, month: rule.month, day: rule.day };
    case 'easter':
      return addDaysTo(easterSunday(year), rule.offsetDays);
    case 'nth-weekday':
      return nthWeekdayOf(year, rule.month, rule.weekday, rule.nth);
    case 'table': {
      const entry = rule.table[year];
      // Silence past the horizon, never a guess.
      return entry ? { year, month: entry[0], day: entry[1] } : null;
    }
  }
}

/**
 * Every holiday in a year for the given countries.
 *
 * A holiday claimed by both countries — White Day in Japan and Korea, and
 * every flavour of Valentine's — appears once, listing both. Two identical
 * entries side by side would read as a bug.
 */
export function holidaysIn(year: number, countries: readonly string[] = []): Holiday[] {
  const byId = new Map<string, Holiday>();

  const add = (rule: HolidayRule, country: string | null) => {
    const existing = byId.get(rule.id);
    if (existing) {
      if (country && !existing.countries.includes(country)) existing.countries.push(country);
      return;
    }
    const date = resolve(rule, year);
    if (!date) return;
    byId.set(rule.id, {
      id: rule.id,
      date,
      weight: rule.weight,
      countries: country ? [country] : [],
      tabulated: rule.kind === 'table',
    });
  };

  for (const rule of UNIVERSAL) add(rule, null);
  for (const country of countries) {
    for (const rule of COUNTRIES[country] ?? []) add(rule, country);
  }

  return [...byId.values()].sort((a, b) => compareDates(a.date, b.date));
}

export interface UpcomingHoliday extends Holiday {
  daysUntil: number;
}

/**
 * The next holidays from a given day.
 *
 * Looks across the year boundary so Chinese New Year in late January is
 * still visible in December — which is exactly when somebody would need the
 * warning, and exactly what a naive same-year filter gets wrong.
 */
export function upcomingHolidays(
  from: CalendarDate,
  countries: readonly string[] = [],
  { withinDays = 45, limit = 3 }: { withinDays?: number; limit?: number } = {},
): UpcomingHoliday[] {
  const candidates = [...holidaysIn(from.year, countries), ...holidaysIn(from.year + 1, countries)];

  return candidates
    .map((holiday) => ({ ...holiday, daysUntil: daysBetween(from, holiday.date) }))
    .filter((holiday) => holiday.daysUntil >= 0 && holiday.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil || weightRank(a.weight) - weightRank(b.weight))
    .slice(0, limit);
}

function weightRank(weight: HolidayWeight): number {
  return weight === 'romantic' ? 0 : weight === 'major' ? 1 : 2;
}

/** Whether the lunisolar tables still cover a year. */
export function lunarTableCovers(year: number): boolean {
  return year >= LUNAR_TABLE_FROM && year <= LUNAR_TABLE_TO;
}

/**
 * The countries a couple's holidays should be drawn from.
 *
 * Both people's, deduplicated, and only ones the registry knows — an
 * unrecognised code contributes nothing rather than throwing, because the
 * value comes from a text column somebody could have typed into.
 */
export function coupleCountries(
  a: string | null | undefined,
  b: string | null | undefined,
): string[] {
  const seen = new Set<string>();
  for (const code of [a, b]) {
    if (code && code in COUNTRIES) seen.add(code);
  }
  return [...seen].sort();
}
