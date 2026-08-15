import { compareDates, daysBetween, type CalendarDate } from './calendar';

/**
 * This time last year.
 *
 * Everything else in this app is something you have to go and look at. This
 * is the one thing that comes to you: on the second of April you are told,
 * without asking, that a year ago today it rained in Porto and you missed
 * the tram twice.
 *
 * It is the closest thing here to a reason to open the app on a day when
 * nothing is happening — and it costs no new data at all, because a keepsake
 * app is already full of dated things nobody ever scrolls back to.
 *
 * Three rules it keeps.
 *
 * **Only whole years.** Six months ago is not an anniversary of anything;
 * saying so would be the app manufacturing an occasion, which is the habit
 * that turns a keepsake into a slot machine. A year, two years, five.
 *
 * **A window, not a day.** Nothing may exist on the exact date, and a
 * strictly-exact match means the feature is silent for most of the year and
 * then shouts. Two days either side is close enough to say "around this time
 * last year" honestly, and the caller is told how far off it was so it can
 * say which.
 *
 * **Never a comparison.** These are things the two of you did. There is no
 * per-person count here and there never should be.
 */

export interface DatedThing {
  id: string;
  /** What it is, so the caller can route and label it. */
  kind: string;
  title: string;
  /** The exact words, when there are any. Quoted, never summarised. */
  note?: string | null;
  date: CalendarDate;
  href: string;
}

export interface Recollection<T extends DatedThing> {
  thing: T;
  /** Whole years between then and now. Always at least one. */
  yearsAgo: number;
  /**
   * Days between the anniversary and today, signed: negative when the
   * anniversary has just gone, positive when it is a day or two away. Zero
   * on the day itself.
   */
  dayOffset: number;
}

/** How far either side of the exact date still counts as "around now". */
const WINDOW_DAYS = 2;

/**
 * The same day of the year as `date`, in the year that puts it nearest today.
 *
 * A date in late December looked at from early January belongs to *last*
 * year's anniversary, not this year's — which is the whole reason this is a
 * function rather than a field swap. The 29th of February resolves to the
 * 1st of March in a common year, matching how the rest of the app rolls
 * recurring dates forward.
 */
export function anniversaryNear(date: CalendarDate, today: CalendarDate): CalendarDate {
  const candidates = [today.year - 1, today.year, today.year + 1].map((year) =>
    normalise({ year, month: date.month, day: date.day }),
  );

  let best = candidates[0];
  let bestDistance = Math.abs(daysBetween(today, best));
  for (const candidate of candidates.slice(1)) {
    const distance = Math.abs(daysBetween(today, candidate));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** February the 29th in a year that has no such day becomes the 1st of March. */
function normalise(date: CalendarDate): CalendarDate {
  if (date.month === 2 && date.day === 29 && !isLeapYear(date.year)) {
    return { year: date.year, month: 3, day: 1 };
  }
  return date;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * What happened around this time in an earlier year, most recent first.
 *
 * Returns an empty list on most days, and that is correct: a section that
 * always has something in it is a section nobody believes.
 */
export function onThisDay<T extends DatedThing>(
  things: readonly T[],
  today: CalendarDate,
  options: { windowDays?: number; limit?: number } = {},
): Recollection<T>[] {
  const window = options.windowDays ?? WINDOW_DAYS;
  const found: Recollection<T>[] = [];

  for (const thing of things) {
    // Only the past. A plan for next April is not a memory of one.
    if (compareDates(thing.date, today) >= 0) continue;

    const anniversary = anniversaryNear(thing.date, today);
    const dayOffset = daysBetween(today, anniversary);
    if (Math.abs(dayOffset) > window) continue;

    const yearsAgo = anniversary.year - thing.date.year;
    // Something from three weeks ago is not an anniversary of itself.
    if (yearsAgo < 1) continue;

    found.push({ thing, yearsAgo, dayOffset });
  }

  found.sort((a, b) => {
    // Nearest the actual day first, then the most recent year, then by id so
    // two things from the same day never swap places between renders.
    const nearness = Math.abs(a.dayOffset) - Math.abs(b.dayOffset);
    if (nearness !== 0) return nearness;
    if (a.yearsAgo !== b.yearsAgo) return a.yearsAgo - b.yearsAgo;
    return a.thing.id.localeCompare(b.thing.id);
  });

  return options.limit === undefined ? found : found.slice(0, options.limit);
}
