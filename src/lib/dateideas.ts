import type { CalendarDate } from './calendar';
import { daysBetween } from './calendar';

/**
 * What to do on a Friday.
 *
 * The problem this exists for is not "we have no ideas". Every couple has
 * ideas; they have them on a Sunday afternoon and cannot retrieve one at
 * seven o'clock on a Friday when they are tired, one of them is broke
 * until payday, and it is raining. A list does not solve that, because a
 * list of forty things is the same paralysis in a different shape.
 *
 * So an idea carries the things that actually rule it in or out — what it
 * costs, when it is good, how it tends to feel, whether it needs booking,
 * and whether the weather can cancel it — and this module answers the real
 * question: *given tonight, which of these are still on the table?*
 *
 * Two rules that are easy to get wrong and matter more than the scoring:
 *
 *   1. **Nothing is ever hidden by a filter it did not fail.** A rejected
 *      idea comes back with the reason it was rejected, so the screen can
 *      say "three more if you can wait until the weekend" instead of
 *      silently showing four things out of twenty.
 *   2. **Never ordered by who suggested it.** The shelf is the couple's.
 *      An idea knows who wrote it down for the sake of the "you added
 *      this" line and for nothing else, and there is no per-person tally
 *      anywhere in this file.
 *
 * Pure and framework-agnostic, like everything in /src/lib.
 */

export const COSTS = ['free', 'cheap', 'modest', 'splash'] as const;
export type Cost = (typeof COSTS)[number];

export const TIMES = ['morning', 'afternoon', 'evening', 'night', 'allday'] as const;
export type TimeOfDay = (typeof TIMES)[number];

export const FEELINGS = [
  'calm',
  'playful',
  'romantic',
  'adventurous',
  'cultured',
  'easy',
] as const;
export type Feeling = (typeof FEELINGS)[number];

export const BOOKINGS = ['none', 'advised', 'required'] as const;
export type Booking = (typeof BOOKINGS)[number];

export interface DateIdea {
  id: string;
  title: string;
  note?: string | null;
  cost: Cost;
  typicalCents?: number | null;
  times: readonly TimeOfDay[];
  feeling: Feeling;
  bring?: string | null;
  booking: Booking;
  bookDaysAhead?: number | null;
  outdoors: boolean;
  minutes?: number | null;
  favourite: boolean;
  lastDoneOn?: CalendarDate | null;
  doneCount: number;
}

/**
 * How much of a budget each band is assumed to want.
 *
 * Ordering, not amounts. Comparing "cheap" against "modest" has to work
 * with no currency in sight, because the four this app supports do not
 * share a sense of what a number means.
 */
export const COST_ORDER: Record<Cost, number> = {
  free: 0,
  cheap: 1,
  modest: 2,
  splash: 3,
};

// ---------------------------------------------------------------------
// Does it fit?
// ---------------------------------------------------------------------

export interface Tonight {
  /** The day being planned for. */
  date: CalendarDate;
  /** The most anyone wants to spend. Everything at or below it fits. */
  budget?: Cost | null;
  /** When in the day. `allday` ideas always fit. */
  time?: TimeOfDay | null;
  /** How it should feel. One at a time — asking for two is asking for none. */
  feeling?: Feeling | null;
  /** Minutes available, if that is the constraint. */
  minutes?: number | null;
  /** True when outdoor ideas should be set aside. */
  wet?: boolean;
  /** Today, for judging whether there is still time to book. */
  today?: CalendarDate | null;
}

export type Mismatch =
  | 'too_expensive'
  | 'wrong_time'
  | 'wrong_feeling'
  | 'too_long'
  | 'weather'
  | 'too_late_to_book';

export interface Fit {
  idea: DateIdea;
  fits: boolean;
  /** Every reason it does not fit, not just the first. */
  misses: readonly Mismatch[];
}

/**
 * Whether one idea survives tonight's constraints.
 *
 * Collects every mismatch rather than returning on the first. "Too
 * expensive" alone invites you to raise the budget and find the idea is
 * also outdoors in the rain; being told both at once is the difference
 * between one decision and three.
 */
export function fitsTonight(idea: DateIdea, tonight: Tonight): Fit {
  const misses: Mismatch[] = [];

  if (tonight.budget && COST_ORDER[idea.cost] > COST_ORDER[tonight.budget]) {
    misses.push('too_expensive');
  }

  // An idea with no times listed is one nobody has thought about yet, and
  // is assumed to fit rather than being quietly excluded from everything.
  if (
    tonight.time &&
    idea.times.length > 0 &&
    !idea.times.includes(tonight.time) &&
    !idea.times.includes('allday')
  ) {
    misses.push('wrong_time');
  }

  if (tonight.feeling && idea.feeling !== tonight.feeling) misses.push('wrong_feeling');

  if (tonight.minutes != null && idea.minutes != null && idea.minutes > tonight.minutes) {
    misses.push('too_long');
  }

  if (tonight.wet && idea.outdoors) misses.push('weather');

  if (bookingIsTooLate(idea, tonight)) misses.push('too_late_to_book');

  return { idea, fits: misses.length === 0, misses };
}

/**
 * Whether the booking window has already closed.
 *
 * Only ever true for `required`. "Advised" means you will probably get in,
 * and removing those from tonight's list would throw away most of the
 * restaurants a couple actually goes to over a technicality.
 *
 * An idea that must be booked but says nothing about how far ahead is
 * treated as bookable today: guessing a lead time would rule out things
 * on no evidence, and the screen shows the "book it" flag either way.
 */
export function bookingIsTooLate(idea: DateIdea, tonight: Tonight): boolean {
  if (idea.booking !== 'required') return false;
  if (idea.bookDaysAhead == null) return false;
  if (!tonight.today) return false;

  return daysBetween(tonight.today, tonight.date) < idea.bookDaysAhead;
}

// ---------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------

/**
 * The shelf, in the order it should be read.
 *
 * Favourites first, then things never done, then things not done for
 * longest. The middle rule is the one that earns its place: an idea
 * written down and never tried is the one the shelf exists to surface,
 * and any ordering by date-added buries it under whatever was added last.
 *
 * Ties break on title so the order is stable between renders — a list
 * that reshuffles when nothing changed reads as a glitch.
 */
export function shelfOrder(
  ideas: readonly DateIdea[],
  today: CalendarDate,
): DateIdea[] {
  return [...ideas].sort((a, b) => {
    if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;

    const aNever = a.doneCount === 0;
    const bNever = b.doneCount === 0;
    if (aNever !== bNever) return aNever ? -1 : 1;

    const aSince = a.lastDoneOn ? daysBetween(a.lastDoneOn, today) : Number.MAX_SAFE_INTEGER;
    const bSince = b.lastDoneOn ? daysBetween(b.lastDoneOn, today) : Number.MAX_SAFE_INTEGER;
    if (aSince !== bSince) return bSince - aSince;

    return a.title.localeCompare(b.title);
  });
}

export interface Shortlist {
  /** Everything that survived, in shelf order. */
  fits: DateIdea[];
  /** What was set aside, and why. */
  setAside: Fit[];
  /**
   * The single loosening that would return the most ideas.
   *
   * A screen showing nothing is a dead end. Naming the one constraint
   * doing the most damage — "four more if you'd go outdoors" — turns it
   * back into a choice.
   */
  loosen: { reason: Mismatch; count: number } | null;
}

/**
 * Tonight's shortlist, plus what it cost to make it.
 *
 * The `setAside` half is not diagnostics: it is what stops the feature
 * lying. A filter that quietly drops sixteen of twenty ideas leaves you
 * believing you have four, and next Friday you will not trust the shelf.
 */
export function shortlist(
  ideas: readonly DateIdea[],
  tonight: Tonight,
): Shortlist {
  const judged = ideas.map((idea) => fitsTonight(idea, tonight));
  const fits = shelfOrder(
    judged.filter((entry) => entry.fits).map((entry) => entry.idea),
    tonight.date,
  );
  const setAside = judged.filter((entry) => !entry.fits);

  // Only ideas held back by exactly one thing can be recovered by
  // loosening one thing. Counting the rest would promise more than
  // relaxing that constraint would actually deliver.
  const counts = new Map<Mismatch, number>();
  for (const entry of setAside) {
    if (entry.misses.length !== 1) continue;
    const only = entry.misses[0];
    counts.set(only, (counts.get(only) ?? 0) + 1);
  }

  let loosen: Shortlist['loosen'] = null;
  for (const [reason, count] of counts) {
    if (!loosen || count > loosen.count) loosen = { reason, count };
  }

  return { fits, setAside, loosen };
}

// ---------------------------------------------------------------------
// Small helpers the screen would otherwise do by hand
// ---------------------------------------------------------------------

/**
 * Which part of the day it is, for defaulting the filter.
 *
 * The boundaries are domestic rather than astronomical: "evening" starts
 * when people finish work, not at sunset, and 22:00 is when what is open
 * changes rather than when it gets dark.
 */
export function timeOfDayAt(hour: number): TimeOfDay {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

/** How long ago an idea was last done, in days. Null if never. */
export function daysSinceDone(idea: DateIdea, today: CalendarDate): number | null {
  if (!idea.lastDoneOn) return null;
  return daysBetween(idea.lastDoneOn, today);
}

/**
 * The last day it is still worth booking something for a given date.
 *
 * Returned rather than a boolean so the screen can say *when* — "book by
 * Thursday" is actionable in a way that "book ahead" is not.
 */
export function bookBy(idea: DateIdea, date: CalendarDate): CalendarDate | null {
  if (idea.booking === 'none' || idea.bookDaysAhead == null) return null;
  return addDaysTo(date, -idea.bookDaysAhead);
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

/**
 * A tidy count of the ideas nobody has tried yet.
 *
 * About the pair, never about either person: there is deliberately no
 * "ideas you added" anywhere in this module, because a count per person
 * is a scoreboard with extra steps.
 */
export function untriedCount(ideas: readonly DateIdea[]): number {
  return ideas.filter((idea) => idea.doneCount === 0).length;
}
