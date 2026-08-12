import { describe, expect, it } from 'vitest';
import type { CalendarDate } from './calendar';
import { anniversaryNear, onThisDay, type DatedThing } from './onthisday';

/**
 * This time last year.
 *
 * The one thing in the app that comes to you rather than waiting to be
 * looked at, so the rules about restraint matter more here than the ones
 * about coverage. It must say nothing on most days, it must never
 * manufacture an occasion out of six months, and it must never turn into a
 * comparison between the two people.
 */

function thing(over: Partial<DatedThing> = {}): DatedThing {
  return {
    id: `t-${Math.random().toString(36).slice(2)}`,
    kind: 'memory',
    title: 'The night it rained in Porto',
    note: 'We ran for the tram and missed it, twice.',
    date: { year: 2025, month: 4, day: 2 },
    href: '/memories',
    ...over,
  };
}

const APRIL_2 = { year: 2026, month: 4, day: 2 } satisfies CalendarDate;

describe('anniversaryNear', () => {
  it('is this year’s when this year’s is the nearest', () => {
    expect(anniversaryNear({ year: 2020, month: 4, day: 2 }, APRIL_2)).toEqual({
      year: 2026,
      month: 4,
      day: 2,
    });
  });

  /**
   * The reason this is a function rather than a field swap: on the 2nd of
   * January, a date in late December belongs to *last* year's anniversary.
   */
  it('reaches back across new year rather than forward eleven months', () => {
    const nearlyNewYear = { year: 2019, month: 12, day: 28 };
    const earlyJanuary = { year: 2026, month: 1, day: 2 };
    expect(anniversaryNear(nearlyNewYear, earlyJanuary)).toEqual({
      year: 2025,
      month: 12,
      day: 28,
    });
  });

  it('reaches forward across new year too', () => {
    const earlyJanuary = { year: 2019, month: 1, day: 2 };
    const nearlyNewYear = { year: 2025, month: 12, day: 30 };
    expect(anniversaryNear(earlyJanuary, nearlyNewYear)).toEqual({
      year: 2026,
      month: 1,
      day: 2,
    });
  });

  it('moves the 29th of February to the 1st of March in a common year', () => {
    expect(anniversaryNear({ year: 2024, month: 2, day: 29 }, { year: 2026, month: 3, day: 1 }))
      .toEqual({ year: 2026, month: 3, day: 1 });
  });

  it('leaves it alone in a leap year', () => {
    expect(anniversaryNear({ year: 2024, month: 2, day: 29 }, { year: 2028, month: 2, day: 28 }))
      .toEqual({ year: 2028, month: 2, day: 29 });
  });
});

describe('what comes back', () => {
  it('finds something from exactly a year ago', () => {
    const [found] = onThisDay([thing()], APRIL_2);
    expect(found?.yearsAgo).toBe(1);
    expect(found?.dayOffset).toBe(0);
  });

  it('counts whole years, however many there are', () => {
    const [found] = onThisDay([thing({ date: { year: 2019, month: 4, day: 2 } })], APRIL_2);
    expect(found?.yearsAgo).toBe(7);
  });

  /**
   * Nothing may have happened on the exact date, and a strictly-exact match
   * means the feature is silent for most of the year and then shouts.
   */
  it('reaches a couple of days either side, and says how far', () => {
    const justGone = thing({ id: 'gone', date: { year: 2025, month: 3, day: 31 } });
    const justAhead = thing({ id: 'ahead', date: { year: 2025, month: 4, day: 4 } });

    const found = onThisDay([justGone, justAhead], APRIL_2);
    expect(found.map((one) => one.thing.id).sort()).toEqual(['ahead', 'gone']);
    expect(found.find((one) => one.thing.id === 'gone')?.dayOffset).toBe(-2);
    expect(found.find((one) => one.thing.id === 'ahead')?.dayOffset).toBe(2);
  });

  it('stops at the edge of the window', () => {
    expect(onThisDay([thing({ date: { year: 2025, month: 4, day: 6 } })], APRIL_2)).toEqual([]);
  });

  /**
   * Six months ago is not an anniversary of anything, and saying it is would
   * be the app manufacturing an occasion — the habit that turns a keepsake
   * into a slot machine.
   */
  it('says nothing about something from earlier this year', () => {
    expect(onThisDay([thing({ date: { year: 2026, month: 1, day: 2 } })], APRIL_2)).toEqual([]);
  });

  it('says nothing about something from three weeks ago', () => {
    expect(onThisDay([thing({ date: { year: 2026, month: 3, day: 12 } })], APRIL_2)).toEqual([]);
  });

  it('says nothing about the future', () => {
    expect(onThisDay([thing({ date: { year: 2027, month: 4, day: 2 } })], APRIL_2)).toEqual([]);
  });

  it('says nothing about today itself', () => {
    expect(onThisDay([thing({ date: APRIL_2 })], APRIL_2)).toEqual([]);
  });

  /** A section that always has something in it is a section nobody believes. */
  it('is empty on an ordinary day', () => {
    const scattered = [
      thing({ date: { year: 2024, month: 7, day: 19 } }),
      thing({ date: { year: 2023, month: 11, day: 3 } }),
    ];
    expect(onThisDay(scattered, APRIL_2)).toEqual([]);
  });
});

describe('the order', () => {
  it('puts the exact day above the near miss', () => {
    const exact = thing({ id: 'exact', date: { year: 2024, month: 4, day: 2 } });
    const near = thing({ id: 'near', date: { year: 2025, month: 4, day: 3 } });

    expect(onThisDay([near, exact], APRIL_2).map((one) => one.thing.id)).toEqual(['exact', 'near']);
  });

  it('puts the most recent year first among equals', () => {
    const older = thing({ id: 'older', date: { year: 2020, month: 4, day: 2 } });
    const newer = thing({ id: 'newer', date: { year: 2025, month: 4, day: 2 } });

    expect(onThisDay([older, newer], APRIL_2).map((one) => one.thing.id)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('lands the same way however the rows arrived', () => {
    const a = thing({ id: 'a', date: { year: 2025, month: 4, day: 2 } });
    const b = thing({ id: 'b', date: { year: 2025, month: 4, day: 2 } });

    const once = onThisDay([a, b], APRIL_2).map((one) => one.thing.id);
    const again = onThisDay([b, a], APRIL_2).map((one) => one.thing.id);
    expect(once).toEqual(['a', 'b']);
    expect(again).toEqual(once);
  });

  it('takes only as many as were asked for', () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      thing({ id: `t${index}`, date: { year: 2025 - index, month: 4, day: 2 } }),
    );
    expect(onThisDay(many, APRIL_2, { limit: 3 })).toHaveLength(3);
  });

  it('widens or narrows the window on request', () => {
    const wayOff = thing({ date: { year: 2025, month: 4, day: 8 } });
    expect(onThisDay([wayOff], APRIL_2, { windowDays: 7 })).toHaveLength(1);
    expect(onThisDay([wayOff], APRIL_2, { windowDays: 0 })).toEqual([]);
  });
});
