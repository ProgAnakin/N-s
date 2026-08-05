/**
 * The boundary between database rows and the domain types in /src/lib.
 *
 * Rows use ISO date strings and nullable columns; the domain uses
 * `CalendarDate` and non-null defaults. Converting in one place means no
 * component ever parses a date string, and the pure logic never sees a null
 * it did not ask for.
 */

import { parseISODate, type CalendarDate } from '@/lib/calendar';
import type { Expense, SplitRule } from '@/lib/money';
import type { ImportantDateLike } from '@/lib/dates';
import type { Fact } from '@/lib/vault';
import type { FactLike, GiftLike } from '@/lib/reminders';
import type {
  ExpenseRow,
  GiftIdeaRow,
  ImportantDateRow,
  RememberFactRow,
} from './database.types';

function toDate(value: string | null | undefined): CalendarDate | null {
  return parseISODate(value);
}

function toSplitRule(row: Pick<ExpenseRow, 'split_rule' | 'partner_a_percent'>): SplitRule {
  if (row.split_rule === 'custom_pct') {
    return { kind: 'custom_pct', partnerAPercent: row.partner_a_percent ?? 50 };
  }
  return { kind: row.split_rule };
}

/**
 * Rows with an unreadable date are dropped rather than defaulted. A memory
 * silently filed under today would be worse than one that does not appear.
 */
function toExpense(row: ExpenseRow): Expense | null {
  const date = toDate(row.date);
  if (!date) return null;
  return {
    id: row.id,
    label: row.label,
    amountCents: row.amount_cents,
    currency: row.currency,
    paidBy: row.paid_by,
    splitRule: toSplitRule(row),
    category: row.category,
    date,
    tripId: row.trip_id,
  };
}

export function toExpenses(rows: readonly ExpenseRow[]): Expense[] {
  const result: Expense[] = [];
  for (const row of rows) {
    const expense = toExpense(row);
    if (expense) result.push(expense);
  }
  return result;
}

function toImportantDate(row: ImportantDateRow): ImportantDateLike | null {
  const date = toDate(row.date);
  if (!date) return null;
  return {
    id: row.id,
    label: row.label,
    date,
    type: row.type,
    recurring: row.recurring,
  };
}

export function toImportantDates(rows: readonly ImportantDateRow[]): ImportantDateLike[] {
  const result: ImportantDateLike[] = [];
  for (const row of rows) {
    const mapped = toImportantDate(row);
    if (mapped) result.push(mapped);
  }
  return result;
}

export function toFact(row: RememberFactRow): Fact {
  return {
    id: row.id,
    category: row.category,
    question: row.question,
    answer: row.answer,
    visibility: row.visibility,
    authorId: row.author_id,
  };
}

export function toFactLike(row: RememberFactRow): FactLike {
  return { id: row.id, question: row.question, remindOn: toDate(row.remind_on) };
}

export function toGiftLike(row: GiftIdeaRow): GiftLike {
  return { id: row.id, idea: row.idea, occasion: row.occasion, used: row.used };
}

