import { describe, expect, it } from 'vitest';
import {
  buildLedger,
  endingState,
  GRACE_PERIOD_DAYS,
  ledgerWorthShowing,
} from './ending';
import type { CalendarDate } from './calendar';

const TODAY: CalendarDate = { year: 2026, month: 6, day: 1 };

describe('endingState', () => {
  it('is active while the couple is a couple', () => {
    expect(endingState(null, TODAY)).toEqual({
      stage: 'active',
      endedOn: null,
      daysToReopen: 0,
    });
    expect(endingState(undefined, TODAY).stage).toBe('active');
  });

  it('is reopenable on the day it ends', () => {
    const state = endingState('2026-06-01', TODAY);
    expect(state.stage).toBe('grace');
    expect(state.daysToReopen).toBe(GRACE_PERIOD_DAYS);
  });

  it('counts down through the grace period', () => {
    // Ended ten days ago: twenty left.
    expect(endingState('2026-05-22', TODAY).daysToReopen).toBe(20);
  });

  it('is still reopenable on the last day', () => {
    const lastDay = endingState('2026-05-03', TODAY);
    expect(lastDay.daysToReopen).toBe(1);
    expect(lastDay.stage).toBe('grace');
  });

  it('closes once the window has passed', () => {
    const state = endingState('2026-05-02', TODAY);
    expect(state.stage).toBe('closed');
    expect(state.daysToReopen).toBe(0);
  });

  it('never reports a negative countdown', () => {
    expect(endingState('2020-01-01', TODAY).daysToReopen).toBe(0);
  });

  it('treats a date in the future as a wrong clock, not a future break-up', () => {
    // Somebody's device being a day ahead must not read as "not ended yet".
    const state = endingState('2026-06-05', TODAY);
    expect(state.stage).toBe('grace');
  });

  it('ignores a date it cannot parse', () => {
    expect(endingState('not a date', TODAY).stage).toBe('active');
  });
});

describe('buildLedger', () => {
  const counts = { memories: 12, photos: 40, letters: 7, plans: 20, places: 3 };

  it('counts the days when there is an anniversary', () => {
    const ledger = buildLedger({
      anniversary: { year: 2024, month: 6, day: 1 },
      today: TODAY,
      ...counts,
    });
    expect(ledger.days).toBe(730);
    expect(ledger.memories).toBe(12);
  });

  it('leaves the day count out when nobody set a start date', () => {
    const ledger = buildLedger({ anniversary: null, today: TODAY, ...counts });
    expect(ledger.days).toBeNull();
  });

  it('never counts backwards from an anniversary in the future', () => {
    const ledger = buildLedger({
      anniversary: { year: 2027, month: 1, day: 1 },
      today: TODAY,
      ...counts,
    });
    expect(ledger.days).toBe(0);
  });
});

describe('ledgerWorthShowing', () => {
  const empty = { days: 0, memories: 0, photos: 0, letters: 0, plans: 0, places: 0 };

  it('stays quiet for a pairing made by mistake last week', () => {
    // A solemn page about three days together is the app being
    // self-important, and it cheapens the gesture for whoever needs it.
    expect(ledgerWorthShowing({ ...empty, days: 3 })).toBe(false);
  });

  it('speaks up once there is something to look at', () => {
    expect(ledgerWorthShowing({ ...empty, memories: 3 })).toBe(true);
    expect(ledgerWorthShowing({ ...empty, photos: 1, letters: 1, plans: 1 })).toBe(true);
  });

  it('speaks up for a long relationship even with little written down', () => {
    expect(ledgerWorthShowing({ ...empty, days: 400 })).toBe(true);
  });

  it('copes with no anniversary at all', () => {
    expect(ledgerWorthShowing({ ...empty, days: null, memories: 5 })).toBe(true);
    expect(ledgerWorthShowing({ ...empty, days: null })).toBe(false);
  });
});
