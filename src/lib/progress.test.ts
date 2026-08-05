import { describe, expect, it } from 'vitest';
import { budgetStatus, checklistProgress, learnedProgress, progressOf } from './progress';

describe('progressOf', () => {
  it('is zero, not NaN, when there is nothing yet', () => {
    expect(progressOf(0, 0)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it('rounds to a whole percent', () => {
    expect(progressOf(1, 3).percent).toBe(33);
    expect(progressOf(2, 3).percent).toBe(67);
  });

  it('never exceeds the total', () => {
    expect(progressOf(9, 4)).toEqual({ done: 4, total: 4, percent: 100 });
  });

  it('never goes negative', () => {
    expect(progressOf(-3, 4).done).toBe(0);
  });
});

describe('checklistProgress', () => {
  it('counts what is done', () => {
    expect(checklistProgress([{ done: true }, { done: false }, { done: true }])).toEqual({
      done: 2,
      total: 3,
      percent: 67,
    });
  });
});

describe('learnedProgress', () => {
  it('counts learned phrases', () => {
    expect(learnedProgress([{ learned: true }, { learned: false }]).percent).toBe(50);
  });

  it('handles an empty phrasebook', () => {
    expect(learnedProgress([]).percent).toBe(0);
  });
});

describe('budgetStatus', () => {
  it('reports what is left', () => {
    const status = budgetStatus(40000, 100000);
    expect(status.remainingCents).toBe(60000);
    expect(status.percent).toBe(40);
    expect(status.over).toBe(false);
  });

  it('caps the bar at 100 but still reports the overspend', () => {
    const status = budgetStatus(150000, 100000);
    expect(status.percent).toBe(100);
    expect(status.over).toBe(true);
    expect(status.remainingCents).toBe(-50000);
  });

  it('does not divide by zero when no budget was set', () => {
    const status = budgetStatus(5000, null);
    expect(status.percent).toBe(0);
    expect(status.over).toBe(false);
  });
});
