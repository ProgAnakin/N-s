import type { CurrencyCode } from './money';
import { CURRENCIES } from './money';

/**
 * Converting between the four currencies, without losing the past.
 *
 * The rule this module exists to hold: **a rate is frozen the moment an
 * expense is written down, and never revisited.** If she pays ¥500 today and
 * the yuan moves ten percent next month, what she carried does not change.
 * Recomputing history at today's rate would silently rewrite who paid for
 * what — the same class of harm as letting somebody flip their partner role,
 * arrived at by arithmetic instead.
 *
 * So each expense stores its own snapshot: what one unit of *its* currency
 * was worth in each of the four, on the day it happened. Converting is then
 * a multiplication with no lookup, no network, and no drift. Four numbers is
 * a small price for a total that still means the same thing in a year.
 *
 * When an expense has no snapshot — written down offline, or before the app
 * knew how to take one — today's rate stands in so the expense still counts,
 * and every place it appears says that it is an estimate. It is replaced by
 * the real rate for its own date as soon as one can be fetched. What is
 * never done is quietly leaving it out: a total that skips rows answers the
 * reader's question with a number that isn't the answer.
 *
 * Everything here is integer minor units in and integer minor units out.
 * Floats exist only inside the multiplication.
 */

/** What one unit of the snapshot's own currency was worth in each currency. */
export type RateSnapshot = Record<CurrencyCode, number>;

/**
 * A rate table is only usable if every currency is present and sane.
 *
 * A partial snapshot is worse than none: it would convert three currencies
 * and silently drop the fourth out of the total.
 */
export function isRateSnapshot(value: unknown): value is RateSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const table = value as Record<string, unknown>;
  return CURRENCIES.every((code) => {
    const rate = table[code];
    return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
  });
}

/**
 * Converts minor units using a frozen snapshot.
 *
 * Rounds half away from zero, so 0.5 of a cent never disappears in a
 * direction that depends on whether the number happened to be even.
 */
export function convertCents(
  cents: number,
  snapshot: RateSnapshot,
  to: CurrencyCode,
): number {
  const rate = snapshot[to];
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  const converted = cents * rate;
  return converted < 0 ? -Math.round(-converted) : Math.round(converted);
}

/**
 * Turns a table quoted against one base into a snapshot for `from`.
 *
 * Rate providers quote everything against a single base — one euro is 6.2
 * reais and 7.9 yuan. An expense in reais needs the reverse and the cross:
 * one real is 1/6.2 euros, and 7.9/6.2 yuan. Doing that here, once, keeps
 * the arithmetic out of the fetch code and under test.
 */
export function snapshotFrom(
  base: CurrencyCode,
  perBase: Partial<Record<CurrencyCode, number>>,
  from: CurrencyCode,
): RateSnapshot | null {
  const table: Partial<Record<CurrencyCode, number>> = { ...perBase, [base]: 1 };
  const fromRate = table[from];
  if (!fromRate || !Number.isFinite(fromRate) || fromRate <= 0) return null;

  const snapshot: Partial<Record<CurrencyCode, number>> = {};
  for (const code of CURRENCIES) {
    const rate = table[code];
    if (!rate || !Number.isFinite(rate) || rate <= 0) return null;
    snapshot[code] = rate / fromRate;
  }
  return isRateSnapshot(snapshot) ? snapshot : null;
}

/** The snapshot for an expense already in the currency being asked about. */
export function identitySnapshot(currency: CurrencyCode): RateSnapshot {
  const snapshot: Partial<Record<CurrencyCode, number>> = {};
  for (const code of CURRENCIES) snapshot[code] = code === currency ? 1 : 0;
  return snapshot as RateSnapshot;
}

export interface ConvertibleExpense {
  amountCents: number;
  currency: CurrencyCode;
  /** Frozen at the moment it was written down. Null when rates were unreachable. */
  fx: RateSnapshot | null;
}

/**
 * Where the number in front of you came from.
 *
 * - `same`      — no conversion happened; it is the amount as it was paid.
 * - `frozen`    — the expense's own snapshot, from the day it was written
 *                 down. The one this module exists to protect.
 * - `estimated` — no snapshot existed, so today's rate stood in. Counted,
 *                 and *said out loud* wherever it appears.
 *
 * The third tier is the whole reason this type exists. An expense with no
 * snapshot used to be left out of the total, which is defensible in the
 * abstract and useless in the hand: it means the one number the page exists
 * to give you silently isn't the answer. Being approximately right and
 * saying so beats being exactly incomplete.
 */
export type ConversionBasis = 'same' | 'frozen' | 'estimated';

export interface ConversionResult {
  /** The amount in the requested currency, in minor units. */
  cents: number;
  basis: ConversionBasis;
}

/**
 * Today's rates, one snapshot per currency, for expenses that have none.
 *
 * A stand-in, never a replacement: the moment the real rate for the day an
 * expense happened can be fetched, it is written onto the expense and this
 * stops being consulted for it.
 */
export type RateBook = Partial<Record<CurrencyCode, RateSnapshot>>;

/**
 * One expense in the currency being displayed, or null if it cannot be.
 *
 * An expense already in the target currency needs no snapshot at all, which
 * matters: a couple who never leaves one currency should never be told a
 * total is incomplete because a rate fetch failed.
 *
 * Null is now genuinely rare — it needs an expense with no snapshot *and* no
 * rates available at all, i.e. the first ever visit while offline.
 */
export function convertExpense(
  expense: ConvertibleExpense,
  to: CurrencyCode,
  fallback?: RateBook,
): ConversionResult | null {
  if (expense.currency === to) return { cents: expense.amountCents, basis: 'same' };
  if (expense.fx) {
    return { cents: convertCents(expense.amountCents, expense.fx, to), basis: 'frozen' };
  }
  const standIn = fallback?.[expense.currency];
  if (standIn) {
    return { cents: convertCents(expense.amountCents, standIn, to), basis: 'estimated' };
  }
  return null;
}

export interface ConvertedEntry<T> {
  expense: T;
  cents: number;
  basis: ConversionBasis;
}

export interface ConvertedSet<T> {
  /** Expenses that could be expressed in the target currency. */
  converted: ConvertedEntry<T>[];
  /**
   * Expenses with no usable rate at all, kept apart rather than dropped.
   *
   * Silently omitting them would make the total quietly wrong, which is the
   * one thing a money page cannot do.
   */
  unconvertible: T[];
}

export function convertAll<T extends ConvertibleExpense>(
  expenses: readonly T[],
  to: CurrencyCode,
  fallback?: RateBook,
): ConvertedSet<T> {
  const converted: ConvertedEntry<T>[] = [];
  const unconvertible: T[] = [];

  for (const expense of expenses) {
    const result = convertExpense(expense, to, fallback);
    if (result === null) unconvertible.push(expense);
    else converted.push({ expense, cents: result.cents, basis: result.basis });
  }

  return { converted, unconvertible };
}
