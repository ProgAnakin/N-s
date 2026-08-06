import { describe, expect, it } from 'vitest';
import {
  computeMetrics,
  metricsWorthShowing,
  RHYTHM_WINDOW_DAYS,
  type MetricInput,
} from './metrics';
import type { CalendarDate } from './calendar';
import { addDays } from './calendar';

const TODAY: CalendarDate = { year: 2026, month: 6, day: 1 };

function input(over: Partial<MetricInput> = {}): MetricInput {
  return {
    today: TODAY,
    anniversary: null,
    planDays: [],
    planWentWell: [],
    memoryDays: [],
    letterDays: [],
    answers: [],
    bankSize: 54,
    countries: [],
    phrases: [],
    ...over,
  };
}

function idsOf(over: Partial<MetricInput> = {}) {
  return computeMetrics(input(over)).map((metric) => metric.id);
}

function valueOf(id: string, over: Partial<MetricInput> = {}) {
  return computeMetrics(input(over)).find((metric) => metric.id === id)?.value;
}

describe('the rule that cannot be broken', () => {
  // The app refuses to say who owes whom about money. Doing it with
  // affection instead would be worse: money at least has an objective
  // quantity behind it.
  it('takes no per-person input at all, so it cannot compare them', () => {
    const keys = Object.keys(input());
    expect(keys.some((key) => /partner|author|byPerson|mine|theirs/i.test(key))).toBe(false);
  });

  it('counts letters as one figure regardless of who wrote them', () => {
    const bothWrote = valueOf('wordsKept', {
      letterDays: [addDays(TODAY, -3), addDays(TODAY, -5), addDays(TODAY, -9)],
    });
    expect(bothWrote).toBe(3);
  });

  it('exposes no metric that could read as a comparison', () => {
    const all = computeMetrics(
      input({
        anniversary: addDays(TODAY, -400),
        planDays: [addDays(TODAY, -3)],
        letterDays: [addDays(TODAY, -3)],
        answers: [{ answered: true, actionable: true }],
        phrases: [{ learned: true }],
      }),
    );
    expect(
      all.some((metric) => /ratio|score|rank|balance|effort/i.test(metric.id)),
    ).toBe(false);
  });
});

describe('nothing is a score out of a hundred', () => {
  it('reports counts and spans, never a percentage', () => {
    const all = computeMetrics(
      input({ anniversary: addDays(TODAY, -400), answers: [{ answered: true, actionable: true }] }),
    );
    // Every value is a whole count; the interface may say "3 of 12" but the
    // module never computes 25%.
    expect(all.every((metric) => Number.isInteger(metric.value))).toBe(true);
  });

  it('frames the bank as still to ask, not as a completion bar', () => {
    const metrics = computeMetrics(input({ answers: [{ answered: true, actionable: false }] }));
    const stillToAsk = metrics.find((metric) => metric.id === 'stillToAsk');
    // Fifty questions you have not asked is an invitation; "2% complete" is
    // homework.
    expect(stillToAsk?.value).toBe(53);
    expect(stillToAsk?.outOf).toBe(54);
  });

  it('never reports more still to ask than the bank holds', () => {
    const answers = Array.from({ length: 80 }, () => ({ answered: true, actionable: false }));
    expect(valueOf('stillToAsk', { answers })).toBe(0);
  });
});

describe('a rhythm recovers; a gap only grows', () => {
  it('counts what happened in the last season, not the days since', () => {
    // "Days since your last date" climbing forever is a machine for making
    // somebody feel bad on a quiet month.
    const value = valueOf('timeTogether', {
      planDays: [addDays(TODAY, -2), addDays(TODAY, -40)],
      memoryDays: [addDays(TODAY, -10)],
    });
    expect(value).toBe(3);
  });

  it('forgets what fell out of the window', () => {
    const old = addDays(TODAY, -(RHYTHM_WINDOW_DAYS + 1));
    expect(valueOf('timeTogether', { planDays: [old] })).toBeUndefined();
  });

  it('ignores something dated in the future', () => {
    expect(valueOf('timeTogether', { planDays: [addDays(TODAY, 5)] })).toBeUndefined();
  });

  it('recovers the moment something happens', () => {
    const quiet = valueOf('wordsKept', { letterDays: [addDays(TODAY, -200)] });
    const after = valueOf('wordsKept', {
      letterDays: [addDays(TODAY, -200), addDays(TODAY, -1)],
    });
    expect(quiet).toBeUndefined();
    expect(after).toBe(1);
  });
});

describe('what appears and when', () => {
  it('shows nothing but the invitation to a brand new couple', () => {
    // Eight zeroes teaches a new couple nothing except that they are behind.
    expect(idsOf()).toEqual(['stillToAsk']);
  });

  it('adds each metric as it becomes true', () => {
    expect(idsOf({ phrases: [{ learned: true }] })).toContain('languageCrossed');
    expect(idsOf({ phrases: [{ learned: false }] })).not.toContain('languageCrossed');
  });

  it('puts the day count first when there is one', () => {
    const ids = idsOf({ anniversary: addDays(TODAY, -400) });
    expect(ids[0]).toBe('daysTogether');
  });

  it('leaves the day count out when nobody set a start date', () => {
    expect(idsOf({ answers: [{ answered: true, actionable: true }] })).not.toContain(
      'daysTogether',
    );
  });

  it('never counts backwards from an anniversary in the future', () => {
    expect(valueOf('daysTogether', { anniversary: addDays(TODAY, 30) })).toBeUndefined();
  });
});

describe('worthRepeating', () => {
  it('counts only what somebody actually judged', () => {
    const metrics = computeMetrics(input({ planWentWell: [true, true, false] }));
    const found = metrics.find((metric) => metric.id === 'worthRepeating');
    expect(found?.value).toBe(2);
    expect(found?.outOf).toBe(3);
  });
});

describe('metricsWorthShowing', () => {
  it('stays hidden until there is a picture rather than a stat block', () => {
    expect(metricsWorthShowing(computeMetrics(input()))).toBe(false);
  });

  it('appears once three things are true', () => {
    const metrics = computeMetrics(
      input({
        anniversary: addDays(TODAY, -400),
        answers: [{ answered: true, actionable: true }],
        letterDays: [addDays(TODAY, -2)],
      }),
    );
    expect(metricsWorthShowing(metrics)).toBe(true);
  });
});
