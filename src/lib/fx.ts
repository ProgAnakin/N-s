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

export interface ConversionResult {
  /** The amount in the requested currency, in minor units. */
  cents: number;
  /**
   * True when the expense was already in the requested currency, so no
   * conversion happened and no rate was needed.
   */
  exact: boolean;
}

/**
 * One expense in the currency being displayed, or null if it cannot be.
 *
 * An expense already in the target currency needs no snapshot at all, which
 * matters: a couple who never leaves one currency should never be told a
 * total is incomplete because a rate fetch failed.
 */
export function convertExpense(
  expense: ConvertibleExpense,
  to: CurrencyCode,
): ConversionResult | null {
  if (expense.currency === to) return { cents: expense.amountCents, exact: true };
  if (!expense.fx) return null;
  return { cents: convertCents(expense.amountCents, expense.fx, to), exact: false };
}

export interface ConvertedSet<T> {
  /** Expenses that could be expressed in the target currency. */
  converted: { expense: T; cents: number }[];
  /**
   * Expenses with no usable rate, kept apart rather than dropped.
   *
   * Silently omitting them would make the total quietly wrong, which is the
   * one thing a money page cannot do.
   */
  unconvertible: T[];
}

export function convertAll<T extends ConvertibleExpense>(
  expenses: readonly T[],
  to: CurrencyCode,
): ConvertedSet<T> {
  const converted: { expense: T; cents: number }[] = [];
  const unconvertible: T[] = [];

  for (const expense of expenses) {
    const result = convertExpense(expense, to);
    if (result === null) unconvertible.push(expense);
    else converted.push({ expense, cents: result.cents });
  }

  return { converted, unconvertible };
}
