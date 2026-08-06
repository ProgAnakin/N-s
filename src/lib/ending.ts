import { addDays, compareDates, daysBetween, parseISODate, type CalendarDate } from './calendar';

/**
 * Ending it.
 *
 * A couple has to be able to stop being one, and an app that only knows how
 * to begin is dishonest about what it is for. But the moment somebody
 * reaches for this is the worst moment to hand them an irreversible button,
 * so this module exists to make three things true:
 *
 *   1. **You are shown what you built before you are asked to confirm.**
 *      Not to manipulate anybody into staying — that would be contemptible,
 *      and a person leaving a bad relationship deserves to leave cleanly.
 *      It is because a decision taken at two in the morning after one fight
 *      is a different decision from the same one taken in daylight, and the
 *      only honest thing an app can do is make sure the person is looking
 *      at the whole thing rather than at the last week of it.
 *
 *   2. **Nothing is destroyed on the first press.** Ending is a state with
 *      a date on it. For a grace period the space is closed but intact, and
 *      either of them can reopen it — either, not just whoever ended it,
 *      because making one person the gatekeeper of the other's memories is
 *      its own small cruelty.
 *
 *   3. **The data belongs to two people.** One person pressing a button
 *      must not silently destroy the other's copy of eight years. So the
 *      grace period is also the window in which the other person finds out
 *      and takes what is theirs.
 *
 * After the grace period the space stays readable and stops being live.
 * Actual deletion is a separate, deliberate act — and it is *personal*: each
 * of them deletes their own account, and neither can delete the other's.
 */

/**
 * How long a couple stays reopenable.
 *
 * Thirty days is chosen against the two failure modes rather than for a
 * round number. Too short and a reconciliation two weeks later finds the
 * space gone. Too long and somebody who has genuinely left is still being
 * asked about it months on, which is its own kind of unkind.
 */
export const GRACE_PERIOD_DAYS = 30;

export type EndingStage =
  /** Together. Nothing to show. */
  | 'active'
  /** Ended, and still reopenable by either of them. */
  | 'grace'
  /** Ended long enough ago that the space is now an archive. */
  | 'closed';

export interface EndingState {
  stage: EndingStage;
  endedOn: CalendarDate | null;
  /** Days left to change your mind. Zero once the window has passed. */
  daysToReopen: number;
}

export function endingState(
  endedOnIso: string | null | undefined,
  today: CalendarDate,
): EndingState {
  const endedOn = parseISODate(endedOnIso ?? null);
  if (!endedOn) return { stage: 'active', endedOn: null, daysToReopen: 0 };

  const reopenUntil = addDays(endedOn, GRACE_PERIOD_DAYS);
  const daysLeft = daysBetween(today, reopenUntil);

  // A date in the future is somebody's clock being wrong, not a couple who
  // will end next week. Treat it as ended now rather than as not ended.
  if (compareDates(endedOn, today) > 0) {
    return { stage: 'grace', endedOn, daysToReopen: GRACE_PERIOD_DAYS };
  }

  return {
    stage: daysLeft > 0 ? 'grace' : 'closed',
    endedOn,
    daysToReopen: Math.max(0, daysLeft),
  };
}

/**
 * What the two of you actually built, in numbers.
 *
 * Shown once, on the screen before the confirmation. Every figure here is a
 * count of something the couple did rather than a score — there is no
 * "relationship health" in this, and there must never be. The point is not
 * to argue; it is to make sure the person is looking at four years rather
 * than at Tuesday.
 */
export interface Ledger {
  days: number | null;
  memories: number;
  photos: number;
  letters: number;
  plans: number;
  places: number;
}

export function buildLedger(input: {
  anniversary: CalendarDate | null;
  today: CalendarDate;
  memories: number;
  photos: number;
  letters: number;
  plans: number;
  places: number;
}): Ledger {
  const { anniversary, today, ...counts } = input;
  return {
    days: anniversary ? Math.max(0, daysBetween(anniversary, today)) : null,
    ...counts,
  };
}

/**
 * Whether the ledger is worth showing at all.
 *
 * A couple who paired last week and are undoing a mistake should not be
 * handed a solemn page about their three days together. That is the app
 * being self-important, and it makes the whole gesture ring false — which
 * would also cheapen it for the couple who genuinely needs it.
 */
export function ledgerWorthShowing(ledger: Ledger): boolean {
  const kept = ledger.memories + ledger.photos + ledger.letters + ledger.plans;
  return kept >= 3 || (ledger.days ?? 0) >= 60;
}
