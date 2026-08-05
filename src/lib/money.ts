/**
 * Money.
 *
 * Two rules govern this file.
 *
 * 1. **No floats, ever.** Every amount is an integer number of minor units
 *    (cents, centavos, fēn). Floats are introduced exactly once, at the edge,
 *    when parsing what a human typed — and immediately rounded away. This is
 *    why the UI never does arithmetic inline.
 *
 * 2. **No debt.** There is no `owed` value in this module and there never
 *    should be. We compute what each person has *contributed* and what each
 *    person's *fair share* was, and from the gap we derive a forward-looking
 *    suggestion: who could comfortably pick up the next one. Nobody is ever
 *    described as owing anybody anything. A couple splitting fairly over time
 *    is not a ledger of grievances.
 *
 * Framework-agnostic on purpose — this is the module a Flutter port reuses
 * almost line for line.
 */

import type { CalendarDate } from './calendar';
import { compareDates } from './calendar';

export type CurrencyCode = 'EUR' | 'BRL' | 'CNY' | 'USD';

export const CURRENCIES: readonly CurrencyCode[] = ['EUR', 'BRL', 'CNY', 'USD'];

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  EUR: '€',
  BRL: 'R$',
  CNY: '¥',
  USD: '$',
};

/** Minor units per major unit. All four currencies happen to use 100. */
export const MINOR_UNITS = 100;

export type PartnerRole = 'partner_a' | 'partner_b';

export const PARTNER_ROLES: readonly PartnerRole[] = ['partner_a', 'partner_b'];

export function otherPartner(role: PartnerRole): PartnerRole {
  return role === 'partner_a' ? 'partner_b' : 'partner_a';
}

export type SplitRuleKind = '50_50' | 'custom_pct' | 'treat';

/**
 * How a cost is carried.
 *
 * - `50_50`   — down the middle.
 * - `custom_pct` — partner A carries `partnerAPercent`, B carries the rest.
 *   Used when incomes differ, which is the honest case here.
 * - `treat`   — intentionally one-sided. A gift is a gift: it is recorded,
 *   it is visible, and it is *excluded* from the rebalance maths entirely.
 *   Nothing given freely should quietly turn into leverage.
 */
export interface SplitRule {
  kind: SplitRuleKind;
  /** 0–100, only meaningful when kind is `custom_pct`. */
  partnerAPercent?: number;
}

export const SPLIT_EVEN: SplitRule = { kind: '50_50' };
export const SPLIT_TREAT: SplitRule = { kind: 'treat' };

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'stay'
  | 'activity'
  | 'gift'
  | 'home'
  | 'health'
  | 'other';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'food',
  'transport',
  'stay',
  'activity',
  'gift',
  'home',
  'health',
  'other',
];

export interface Expense {
  id: string;
  label: string;
  /** Integer minor units, always positive. */
  amountCents: number;
  currency: CurrencyCode;
  paidBy: PartnerRole;
  splitRule: SplitRule;
  category: ExpenseCategory;
  date: CalendarDate;
  tripId?: string | null;
}

export type PartnerTotals = Record<PartnerRole, number>;

function emptyTotals(): PartnerTotals {
  return { partner_a: 0, partner_b: 0 };
}

/* ------------------------------------------------------------------ *
 * Splitting
 * ------------------------------------------------------------------ */

export function normalisePercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * How much of a cost each partner is responsible for.
 *
 * When an amount does not divide evenly, the leftover minor unit stays with
 * whoever paid. It is a single cent, and quietly handing it to the other
 * person is the kind of pettiness this app exists to avoid. The rule is
 * deterministic, which is what matters for the totals to stay exact.
 */
export function shareOf(
  amountCents: number,
  rule: SplitRule,
  paidBy: PartnerRole,
): PartnerTotals {
  const amount = Math.max(0, Math.round(amountCents));
  if (rule.kind === 'treat' || amount === 0) return emptyTotals();

  const percentForA =
    rule.kind === 'custom_pct' ? normalisePercent(rule.partnerAPercent ?? 50) : 50;

  // Round toward the non-payer first, then give the remainder to the payer,
  // so the two shares always sum back to exactly `amount`.
  const nonPayer = otherPartner(paidBy);
  const percentForNonPayer = nonPayer === 'partner_a' ? percentForA : 100 - percentForA;
  const nonPayerShare = Math.floor((amount * percentForNonPayer) / 100);

  const totals = emptyTotals();
  totals[nonPayer] = nonPayerShare;
  totals[paidBy] = amount - nonPayerShare;
  return totals;
}

/* ------------------------------------------------------------------ *
 * Balance
 * ------------------------------------------------------------------ */

export interface Balance {
  currency: CurrencyCode;
  /** Total shared spending (treats excluded). */
  totalCents: number;
  /** What each partner actually paid out, on shared costs. */
  contributed: PartnerTotals;
  /** What each partner was responsible for, given the split rules. */
  fairShare: PartnerTotals;
  /** Share of total contribution, 0–100, rounded to one decimal, summing to 100. */
  contributionPercent: Record<PartnerRole, number>;
  /** The gap between contribution and fair share, in minor units. Never negative. */
  differenceCents: number;
  /** Who has been carrying more than their share. Null when perfectly level. */
  aheadPartner: PartnerRole | null;
  /** Treats given by each partner. Recorded, celebrated, never netted off. */
  treatedCents: PartnerTotals;
  sharedCount: number;
  treatCount: number;
}

export function emptyBalance(currency: CurrencyCode): Balance {
  return {
    currency,
    totalCents: 0,
    contributed: emptyTotals(),
    fairShare: emptyTotals(),
    contributionPercent: { partner_a: 50, partner_b: 50 },
    differenceCents: 0,
    aheadPartner: null,
    treatedCents: emptyTotals(),
    sharedCount: 0,
    treatCount: 0,
  };
}

/**
 * Percentages that always sum to exactly 100, using the largest-remainder
 * method on a one-decimal grid. Without this, two 33.333% halves render as
 * "66.7% / 33.3%" one day and "66.6% / 33.3%" the next.
 */
function contributionSplit(totals: PartnerTotals): Record<PartnerRole, number> {
  const sum = totals.partner_a + totals.partner_b;
  if (sum <= 0) return { partner_a: 50, partner_b: 50 };
  const exactA = (totals.partner_a * 1000) / sum;
  const tenthsA = Math.round(exactA);
  return { partner_a: tenthsA / 10, partner_b: (1000 - tenthsA) / 10 };
}

export function computeBalance(expenses: readonly Expense[], currency: CurrencyCode): Balance {
  const balance = emptyBalance(currency);

  for (const expense of expenses) {
    if (expense.currency !== currency) continue;
    const amount = Math.max(0, Math.round(expense.amountCents));
    if (amount === 0) continue;

    if (expense.splitRule.kind === 'treat') {
      balance.treatedCents[expense.paidBy] += amount;
      balance.treatCount += 1;
      continue;
    }

    const share = shareOf(amount, expense.splitRule, expense.paidBy);
    balance.contributed[expense.paidBy] += amount;
    balance.fairShare.partner_a += share.partner_a;
    balance.fairShare.partner_b += share.partner_b;
    balance.totalCents += amount;
    balance.sharedCount += 1;
  }

  balance.contributionPercent = contributionSplit(balance.contributed);

  const gap = balance.contributed.partner_a - balance.fairShare.partner_a;
  balance.differenceCents = Math.abs(gap);
  balance.aheadPartner = gap === 0 ? null : gap > 0 ? 'partner_a' : 'partner_b';

  return balance;
}

/** Every currency that appears in a set of expenses, in a stable order. */
export function currenciesUsed(expenses: readonly Expense[]): CurrencyCode[] {
  const seen = new Set<CurrencyCode>();
  for (const expense of expenses) seen.add(expense.currency);
  return CURRENCIES.filter((code) => seen.has(code));
}

/**
 * Balances grouped by currency. We never convert between currencies: made-up
 * exchange rates would turn an honest number into a guess, and a couple who
 * travels genuinely does spend in two currencies at once.
 */
export function computeBalancesByCurrency(
  expenses: readonly Expense[],
  primary: CurrencyCode,
): Balance[] {
  const codes = currenciesUsed(expenses);
  if (!codes.includes(primary)) codes.unshift(primary);
  const ordered = [primary, ...codes.filter((code) => code !== primary)];
  return ordered.map((code) => computeBalance(expenses, code));
}

/* ------------------------------------------------------------------ *
 * Rebalancing — forward-looking only
 * ------------------------------------------------------------------ */

export interface RebalanceSuggestion {
  /** Whoever is behind, and could naturally pick up the next one. */
  partner: PartnerRole;
  /**
   * The size of the next *shared* expense that would bring the two level.
   *
   * Note this is twice the gap, not the gap itself, and that surprises
   * people. If A is €50 ahead and B pays for a €50 dinner that they split
   * evenly, B has only moved €25 of the gap — half of what B paid was B's own
   * share to begin with. Covering €100 is what actually squares it.
   */
  amountCents: number;
}

/**
 * How far the split can drift before it is worth mentioning. Two people who
 * are 1% apart are, for every human purpose, even — and saying otherwise
 * turns a fair arrangement into a scoreboard.
 */
export const BALANCE_TOLERANCE_PERCENT = 2;

export function isLevel(
  balance: Balance,
  tolerancePercent: number = BALANCE_TOLERANCE_PERCENT,
): boolean {
  if (balance.totalCents === 0) return true;
  if (balance.differenceCents === 0) return true;
  return (balance.differenceCents * 100) / balance.totalCents < tolerancePercent;
}

/**
 * Returns null when the two are level — deliberately, so the UI's happy path
 * is "you're even" rather than a permanent outstanding figure.
 */
export function rebalanceSuggestion(
  balance: Balance,
  tolerancePercent: number = BALANCE_TOLERANCE_PERCENT,
): RebalanceSuggestion | null {
  if (balance.aheadPartner === null) return null;
  if (isLevel(balance, tolerancePercent)) return null;
  return {
    partner: otherPartner(balance.aheadPartner),
    amountCents: balance.differenceCents * 2,
  };
}

/* ------------------------------------------------------------------ *
 * Breakdowns
 * ------------------------------------------------------------------ */

export function totalsByCategory(
  expenses: readonly Expense[],
  currency: CurrencyCode,
): { category: ExpenseCategory; totalCents: number }[] {
  const totals = new Map<ExpenseCategory, number>();
  for (const expense of expenses) {
    if (expense.currency !== currency) continue;
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + Math.max(0, expense.amountCents));
  }
  return [...totals.entries()]
    .map(([category, totalCents]) => ({ category, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents || a.category.localeCompare(b.category));
}

/** Total spent against a trip, for the budget bar. Treats included: money left the account either way. */
export function tripSpend(
  expenses: readonly Expense[],
  tripId: string,
  currency: CurrencyCode,
): number {
  let total = 0;
  for (const expense of expenses) {
    if (expense.tripId === tripId && expense.currency === currency) {
      total += Math.max(0, expense.amountCents);
    }
  }
  return total;
}

export function sortExpensesByDate(expenses: readonly Expense[]): Expense[] {
  return [...expenses].sort((a, b) => compareDates(b.date, a.date) || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------ *
 * Parsing and formatting
 * ------------------------------------------------------------------ */

/**
 * Turns what a human typed into integer minor units.
 *
 * Handles the separators all four of this app's locales use — "1.234,56",
 * "1,234.56", "12,5", "12.5" — plus stray currency symbols and spaces.
 * Returns null for anything it cannot read, so callers can show a quiet
 * validation message instead of silently logging a wrong number.
 */
export function parseAmountToCents(input: string): number | null {
  if (typeof input !== 'string') return null;

  const cleaned = input.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned || cleaned === '-') return null;

  const negative = cleaned.startsWith('-');
  const digitsOnly = cleaned.replace(/-/g, '');
  if (!/\d/.test(digitsOnly)) return null;

  const lastComma = digitsOnly.lastIndexOf(',');
  const lastDot = digitsOnly.lastIndexOf('.');
  const lastSeparator = Math.max(lastComma, lastDot);

  let normalised: string;
  if (lastSeparator === -1) {
    normalised = digitsOnly;
  } else {
    const decimals = digitsOnly.length - lastSeparator - 1;
    // A trailing group of exactly 1 or 2 digits is a decimal fraction;
    // a group of 3 is a thousands separator ("1.234" is one thousand).
    if (decimals === 1 || decimals === 2) {
      const whole = digitsOnly.slice(0, lastSeparator).replace(/[.,]/g, '');
      const fraction = digitsOnly.slice(lastSeparator + 1);
      normalised = `${whole || '0'}.${fraction}`;
    } else {
      normalised = digitsOnly.replace(/[.,]/g, '');
    }
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;

  // The one and only float in this module, rounded away immediately.
  const cents = Math.round(value * MINOR_UNITS);
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Minor units back to a plain editable string, e.g. 1250 -> "12.50". */
export function centsToInputValue(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / MINOR_UNITS)}.${String(abs % MINOR_UNITS).padStart(2, '0')}`;
}

export interface FormatMoneyOptions {
  locale?: string;
  /** Drop the decimals when the amount is whole — for headline figures. */
  compactWhole?: boolean;
}

export function formatMoney(
  cents: number,
  currency: CurrencyCode,
  options: FormatMoneyOptions = {},
): string {
  const { locale = 'en-GB', compactWhole = false } = options;
  const rounded = Math.round(cents);
  const value = rounded / MINOR_UNITS;
  const fractionDigits = compactWhole && rounded % MINOR_UNITS === 0 ? 0 : 2;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    // Intl is present everywhere we ship, but a personal app should never
    // white-screen over a formatting detail.
    return `${CURRENCY_SYMBOLS[currency]}${value.toFixed(fractionDigits)}`;
  }
}

/** "62.5%" without float noise like "62.50000000000001%". */
export function formatPercent(value: number, locale = 'en-GB'): string {
  const rounded = Math.round(value * 10) / 10;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    }).format(rounded / 100);
  } catch {
    return `${rounded}%`;
  }
}
