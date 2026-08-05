/**
 * Small progress calculations shared across features.
 *
 * All of them clamp and round in one place so no component ever renders
 * "33.33333333%" or a bar that overflows its track.
 */

export interface Progress {
  done: number;
  total: number;
  /** 0–100, integer. */
  percent: number;
}

export function progressOf(done: number, total: number): Progress {
  const safeTotal = Math.max(0, Math.round(total));
  const safeDone = Math.min(safeTotal, Math.max(0, Math.round(done)));
  return {
    done: safeDone,
    total: safeTotal,
    percent: safeTotal === 0 ? 0 : Math.round((safeDone / safeTotal) * 100),
  };
}

function countWhere<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  let count = 0;
  for (const item of items) if (predicate(item)) count += 1;
  return count;
}

export function checklistProgress<T extends { done: boolean }>(items: readonly T[]): Progress {
  return progressOf(
    countWhere(items, (item) => item.done),
    items.length,
  );
}

export function learnedProgress<T extends { learned: boolean }>(phrases: readonly T[]): Progress {
  return progressOf(
    countWhere(phrases, (phrase) => phrase.learned),
    phrases.length,
  );
}

export interface BudgetStatus {
  spentCents: number;
  budgetCents: number;
  remainingCents: number;
  /** 0–100 for the bar; clamped, so an overspend fills it rather than overflowing. */
  percent: number;
  over: boolean;
}

export function budgetStatus(spentCents: number, budgetCents: number | null): BudgetStatus {
  const budget = Math.max(0, Math.round(budgetCents ?? 0));
  const spent = Math.max(0, Math.round(spentCents));
  return {
    spentCents: spent,
    budgetCents: budget,
    remainingCents: budget - spent,
    percent: budget === 0 ? 0 : Math.min(100, Math.round((spent / budget) * 100)),
    over: budget > 0 && spent > budget,
  };
}
