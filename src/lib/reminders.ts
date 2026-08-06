/**
 * Smart reminders.
 *
 * These are the app's one piece of initiative, so the bar is high: a reminder
 * has to be something a thoughtful person would actually want surfaced, on a
 * day when it is still useful. Reminders are returned as *data*, never as
 * sentences — the UI translates them, which keeps this module portable and
 * keeps the wording in one place.
 *
 * Tone rules encoded here:
 *   - Nothing fires more than three weeks out. Anxiety is not a feature.
 *   - Nothing repeats a nag. Each reminder is one clear, actionable thing.
 *   - Nothing about the app itself ("you haven't logged in!"). Only about her.
 */

import type { CalendarDate } from './calendar';
import { compareDates, daysBetween } from './calendar';
import type { ImportantDateLike, ImportantDateType } from './dates';
import { nextMonthiversary, nextRoundDayMilestone, upcomingOccurrences } from './dates';

const DATE_HORIZON_DAYS = 14;
const TRIP_HORIZON_DAYS = 21;
const REUNION_HORIZON_DAYS = 21;
const FOLLOW_UP_WINDOW_DAYS = 3;

export interface FactLike {
  id: string;
  question: string;
  /** Set when a note is time-sensitive: "her exam is on the 14th". */
  remindOn: CalendarDate | null;
}

export interface GiftLike {
  id: string;
  idea: string;
  occasion: string | null;
  used: boolean;
}

export interface TripLike {
  id: string;
  destination: string;
  startDate: CalendarDate | null;
  openItemCount: number;
}

export interface ReminderContext {
  today: CalendarDate;
  anniversary: CalendarDate | null;
  dates: readonly ImportantDateLike[];
  facts: readonly FactLike[];
  gifts: readonly GiftLike[];
  trips: readonly TripLike[];
  /** Distance mode only. */
  reunionDate: CalendarDate | null;
}

/**
 * The next small step, named specifically.
 *
 * A reminder that only says "this is in seven days" hands the work straight
 * back to the person who already knew. What turns a notification into an
 * assistant is naming what to do about it — and naming it *specifically*,
 * because "plan something" is not advice, it is a shrug with a button on it.
 *
 * Which step depends almost entirely on how much time is left, which is why
 * this is computed here from `daysUntil` rather than written into each
 * string. Three weeks before a birthday the useful sentence is about
 * booking; three days before, it is about not panicking.
 */
export type ReminderAction =
  | 'book'
  | 'gift_ship'
  | 'gift_look'
  | 'gift_soon'
  | 'ask'
  | 'trip_pack'
  | 'say_it'
  | null;

/** Past this, a present that has to arrive by post is still comfortable. */
export const POSTING_HORIZON_DAYS = 10;
/** Inside this, the useful advice stops being "look" and starts being "small". */
export const LAST_MINUTE_DAYS = 3;

export function actionFor(reminder: Reminder): ReminderAction {
  switch (reminder.kind) {
    case 'upcoming_date': {
      if (!reminder.giftWorthy) return reminder.daysUntil <= 7 ? 'say_it' : null;
      if (reminder.daysUntil <= LAST_MINUTE_DAYS) return 'gift_soon';
      if (reminder.daysUntil <= POSTING_HORIZON_DAYS) return 'gift_ship';
      return 'gift_look';
    }
    case 'fact_followup':
      // Only once it has happened. Before it, the note itself is the point.
      return reminder.daysUntil < 0 ? 'ask' : null;
    case 'trip_open_items':
      return 'trip_pack';
    case 'monthiversary':
      // Deliberately not a gift. A monthiversary that costs money every
      // month becomes an obligation, which is the opposite of what it is.
      return 'say_it';
    case 'reunion':
      return reminder.daysUntil <= 21 ? 'book' : null;
    case 'day_milestone':
      return 'say_it';
  }
}

export type Reminder =
  | {
      id: string;
      kind: 'upcoming_date';
      daysUntil: number;
      label: string;
      dateType: ImportantDateType;
      ordinal: number | null;
      /** Unused ideas already saved for this occasion. */
      giftIdeaCount: number;
      /**
       * Whether this is an occasion where turning up empty-handed would sting.
       * Combined with `giftIdeaCount === 0`, it lets the card add a quiet
       * "nothing saved yet" line — rather than firing a second reminder about
       * the same birthday, which would read as nagging.
       */
      giftWorthy: boolean;
    }
  | { id: string; kind: 'fact_followup'; daysUntil: number; question: string }
  | { id: string; kind: 'trip_open_items'; daysUntil: number; destination: string; openItems: number }
  | { id: string; kind: 'monthiversary'; daysUntil: number; months: number }
  | { id: string; kind: 'day_milestone'; daysUntil: number; days: number }
  | { id: string; kind: 'reunion'; daysUntil: number };

interface Scored {
  reminder: Reminder;
  score: number;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Loose match between a saved gift idea and an upcoming occasion. People type
 * "bday" and "her birthday" and "Birthday 🎂", so exact matching would make
 * the feature feel broken.
 */
export function giftsForOccasion(
  gifts: readonly GiftLike[],
  dateLabel: string,
  dateType: ImportantDateType,
): GiftLike[] {
  const label = normalise(dateLabel);
  const type = normalise(dateType);
  return gifts.filter((gift) => {
    if (gift.used) return false;
    const occasion = normalise(gift.occasion ?? '');
    if (!occasion) return false;
    return (
      occasion === label ||
      occasion === type ||
      occasion.includes(label) ||
      label.includes(occasion) ||
      occasion.includes(type)
    );
  });
}

/** Occasions where arriving empty-handed would genuinely sting. */
function expectsAGift(type: ImportantDateType): boolean {
  return type === 'birthday' || type === 'anniversary';
}

export function buildReminders(context: ReminderContext, limit = 3): Reminder[] {
  const { today } = context;
  const scored: Scored[] = [];

  // --- Dates coming up ------------------------------------------------
  const upcoming = upcomingOccurrences(context.dates, today, DATE_HORIZON_DAYS);
  for (const occurrence of upcoming) {
    const matches = giftsForOccasion(
      context.gifts,
      occurrence.source.label,
      occurrence.source.type,
    );
    scored.push({
      score: occurrence.daysUntil <= 3 ? 0 : 20 + occurrence.daysUntil,
      reminder: {
        id: `date:${occurrence.source.id}`,
        kind: 'upcoming_date',
        daysUntil: occurrence.daysUntil,
        label: occurrence.source.label,
        dateType: occurrence.source.type,
        ordinal: occurrence.ordinal,
        giftIdeaCount: matches.length,
        // Two days' notice at minimum: telling someone their gift radar is
        // empty on the morning of the birthday is not help, it is a jab.
        giftWorthy: expectsAGift(occurrence.source.type) && occurrence.daysUntil >= 2,
      },
    });
  }

  // --- Something she mentioned that has a date on it ------------------
  for (const fact of context.facts) {
    if (!fact.remindOn) continue;
    const daysUntil = daysBetween(today, fact.remindOn);
    // A few days either side: enough warning to remember, and enough grace to
    // still ask how it went afterwards.
    if (daysUntil > FOLLOW_UP_WINDOW_DAYS || daysUntil < -FOLLOW_UP_WINDOW_DAYS) continue;
    scored.push({
      score: daysUntil >= 0 ? 5 + daysUntil : 10 + Math.abs(daysUntil),
      reminder: {
        id: `fact:${fact.id}`,
        kind: 'fact_followup',
        daysUntil,
        question: fact.question,
      },
    });
  }

  // --- Monthiversary --------------------------------------------------
  if (context.anniversary) {
    const monthiversary = nextMonthiversary(context.anniversary, today);
    if (monthiversary && monthiversary.daysUntil <= 3) {
      scored.push({
        score: 30 + monthiversary.daysUntil,
        reminder: {
          id: `monthiversary:${monthiversary.months}`,
          kind: 'monthiversary',
          daysUntil: monthiversary.daysUntil,
          months: monthiversary.months,
        },
      });
    }

    const milestone = nextRoundDayMilestone(context.anniversary, today, 10);
    if (milestone) {
      scored.push({
        score: 25 + milestone.daysUntil,
        reminder: {
          id: `milestone:${milestone.days}`,
          kind: 'day_milestone',
          daysUntil: milestone.daysUntil,
          days: milestone.days,
        },
      });
    }
  }

  // --- Trips with loose ends ------------------------------------------
  for (const trip of context.trips) {
    if (!trip.startDate || trip.openItemCount <= 0) continue;
    if (compareDates(trip.startDate, today) < 0) continue;
    const daysUntil = daysBetween(today, trip.startDate);
    if (daysUntil > TRIP_HORIZON_DAYS) continue;
    scored.push({
      score: 50 + daysUntil,
      reminder: {
        id: `trip:${trip.id}`,
        kind: 'trip_open_items',
        daysUntil,
        destination: trip.destination,
        openItems: trip.openItemCount,
      },
    });
  }

  // --- Seeing each other again ----------------------------------------
  if (context.reunionDate) {
    const daysUntil = daysBetween(today, context.reunionDate);
    if (daysUntil >= 0 && daysUntil <= REUNION_HORIZON_DAYS) {
      scored.push({
        score: 15 + daysUntil,
        reminder: { id: 'reunion', kind: 'reunion', daysUntil },
      });
    }
  }

  scored.sort((a, b) => a.score - b.score || a.reminder.id.localeCompare(b.reminder.id));

  // One reminder per subject: if her birthday is already the headline, the
  // "no gift saved" nudge can wait its turn.
  const seen = new Set<string>();
  const result: Reminder[] = [];
  for (const { reminder } of scored) {
    const subject = reminder.id.split(':').slice(1).join(':') || reminder.id;
    if (seen.has(subject)) continue;
    seen.add(subject);
    result.push(reminder);
    if (result.length >= limit) break;
  }
  return result;
}
