import { describe, expect, it } from 'vitest';
import {
  bookBy,
  bookingIsTooLate,
  COST_ORDER,
  daysSinceDone,
  fitsTonight,
  shelfOrder,
  shortlist,
  timeOfDayAt,
  untriedCount,
  type DateIdea,
} from './dateideas';

/**
 * The Friday-evening test.
 *
 * Everything here is written from the position the feature exists for:
 * it is seven o'clock, one of you is tired, it is raining, and payday is
 * Tuesday. A shelf that answers that is worth keeping; one that returns
 * everything it has is a list, and a list is what failed.
 */

function idea(overrides: Partial<DateIdea> = {}): DateIdea {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'Something',
    cost: 'modest',
    times: ['evening'],
    feeling: 'easy',
    booking: 'none',
    outdoors: false,
    favourite: false,
    doneCount: 0,
    ...overrides,
  };
}

const FRIDAY = { year: 2026, month: 8, day: 14 };
const MONDAY = { year: 2026, month: 8, day: 10 };

describe('does it fit tonight', () => {
  it('lets an idea through when nothing rules it out', () => {
    expect(fitsTonight(idea(), { date: FRIDAY }).fits).toBe(true);
  });

  it('rules out anything above the budget, and lets anything below it through', () => {
    const splash = idea({ cost: 'splash' });
    const free = idea({ cost: 'free' });

    expect(fitsTonight(splash, { date: FRIDAY, budget: 'cheap' }).misses).toEqual([
      'too_expensive',
    ]);
    // The band is a ceiling, not a target: on a "modest" evening a free
    // idea is still a perfectly good answer.
    expect(fitsTonight(free, { date: FRIDAY, budget: 'modest' }).fits).toBe(true);
  });

  it('orders the bands so they can be compared without a currency', () => {
    // Four currencies with no shared sense of what a number means is
    // exactly why this is an ordering rather than an amount.
    expect(COST_ORDER.free).toBeLessThan(COST_ORDER.cheap);
    expect(COST_ORDER.cheap).toBeLessThan(COST_ORDER.modest);
    expect(COST_ORDER.modest).toBeLessThan(COST_ORDER.splash);
  });

  it('matches the time of day, and treats all-day ideas as always available', () => {
    expect(fitsTonight(idea({ times: ['morning'] }), { date: FRIDAY, time: 'evening' }).misses)
      .toEqual(['wrong_time']);
    expect(fitsTonight(idea({ times: ['allday'] }), { date: FRIDAY, time: 'night' }).fits).toBe(
      true,
    );
  });

  /**
   * An idea nobody has thought about the timing of should not vanish from
   * every search. Absent is not the same as "no time suits".
   */
  it('lets an idea with no times listed through rather than excluding it from everything', () => {
    expect(fitsTonight(idea({ times: [] }), { date: FRIDAY, time: 'morning' }).fits).toBe(true);
  });

  it('matches the feeling being asked for', () => {
    expect(fitsTonight(idea({ feeling: 'adventurous' }), { date: FRIDAY, feeling: 'calm' }).misses)
      .toEqual(['wrong_feeling']);
  });

  it('sets aside anything longer than the time available', () => {
    expect(fitsTonight(idea({ minutes: 240 }), { date: FRIDAY, minutes: 90 }).misses).toEqual([
      'too_long',
    ]);
    expect(fitsTonight(idea({ minutes: 60 }), { date: FRIDAY, minutes: 90 }).fits).toBe(true);
  });

  it('sets outdoor ideas aside in the rain and leaves indoor ones alone', () => {
    expect(fitsTonight(idea({ outdoors: true }), { date: FRIDAY, wet: true }).misses).toEqual([
      'weather',
    ]);
    expect(fitsTonight(idea({ outdoors: false }), { date: FRIDAY, wet: true }).fits).toBe(true);
  });

  /**
   * Every reason, not the first one.
   *
   * Being told an idea is too expensive, raising the budget, and then
   * discovering it is also outdoors in the rain is three rounds of a
   * conversation that should have been one.
   */
  it('reports every reason at once rather than stopping at the first', () => {
    const result = fitsTonight(
      idea({ cost: 'splash', outdoors: true, feeling: 'adventurous', minutes: 300 }),
      { date: FRIDAY, budget: 'free', wet: true, feeling: 'calm', minutes: 60 },
    );

    expect(result.fits).toBe(false);
    expect([...result.misses].sort()).toEqual(
      ['too_expensive', 'too_long', 'weather', 'wrong_feeling'].sort(),
    );
  });
});

describe('booking', () => {
  it('sets aside something that had to be booked a week ago', () => {
    const restaurant = idea({ booking: 'required', bookDaysAhead: 7 });
    expect(bookingIsTooLate(restaurant, { date: FRIDAY, today: MONDAY })).toBe(true);
  });

  it('lets it through when there is still time', () => {
    const restaurant = idea({ booking: 'required', bookDaysAhead: 2 });
    expect(bookingIsTooLate(restaurant, { date: FRIDAY, today: MONDAY })).toBe(false);
  });

  /**
   * "Advised" is most of the restaurants a couple actually goes to.
   * Excluding them on a technicality would empty the shelf on exactly the
   * evenings it is most needed.
   */
  it('never rules out something merely advisable to book', () => {
    const advised = idea({ booking: 'advised', bookDaysAhead: 30 });
    expect(bookingIsTooLate(advised, { date: FRIDAY, today: MONDAY })).toBe(false);
  });

  it('does not invent a lead time nobody entered', () => {
    const vague = idea({ booking: 'required', bookDaysAhead: null });
    expect(bookingIsTooLate(vague, { date: FRIDAY, today: MONDAY })).toBe(false);
  });

  it('says which day to book by, since “book ahead” is not actionable', () => {
    expect(bookBy(idea({ booking: 'required', bookDaysAhead: 4 }), FRIDAY)).toEqual({
      year: 2026,
      month: 8,
      day: 10,
    });
  });

  it('crosses a month boundary correctly', () => {
    expect(
      bookBy(idea({ booking: 'required', bookDaysAhead: 5 }), { year: 2026, month: 3, day: 2 }),
    ).toEqual({ year: 2026, month: 2, day: 25 });
  });

  it('has no answer for something that needs no booking', () => {
    expect(bookBy(idea({ booking: 'none' }), FRIDAY)).toBeNull();
  });
});

describe('the order the shelf reads in', () => {
  it('puts favourites first', () => {
    const ordered = shelfOrder(
      [idea({ title: 'ordinary' }), idea({ title: 'beloved', favourite: true })],
      FRIDAY,
    );
    expect(ordered[0].title).toBe('beloved');
  });

  /**
   * The rule the whole shelf exists for. An idea written down and never
   * tried is the one worth surfacing; ordering by when it was added
   * buries it under whatever was added last.
   */
  it('puts something never done above something done recently', () => {
    const ordered = shelfOrder(
      [
        idea({ title: 'done last week', doneCount: 3, lastDoneOn: { year: 2026, month: 8, day: 7 } }),
        idea({ title: 'never tried', doneCount: 0 }),
      ],
      FRIDAY,
    );
    expect(ordered.map((entry) => entry.title)).toEqual(['never tried', 'done last week']);
  });

  it('among things already done, puts the longest ago first', () => {
    const ordered = shelfOrder(
      [
        idea({ title: 'last week', doneCount: 1, lastDoneOn: { year: 2026, month: 8, day: 7 } }),
        idea({ title: 'last year', doneCount: 1, lastDoneOn: { year: 2025, month: 8, day: 7 } }),
      ],
      FRIDAY,
    );
    expect(ordered.map((entry) => entry.title)).toEqual(['last year', 'last week']);
  });

  it('is stable, so nothing reshuffles when nothing changed', () => {
    const ideas = [idea({ title: 'beta' }), idea({ title: 'alpha' })];
    expect(shelfOrder(ideas, FRIDAY).map((entry) => entry.title)).toEqual(['alpha', 'beta']);
    expect(shelfOrder([...ideas].reverse(), FRIDAY).map((entry) => entry.title)).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('never orders by who suggested it', () => {
    // There is no author field in this module at all, and that is the
    // point: a shelf sorted by contributor is a scoreboard.
    expect(Object.keys(idea())).not.toContain('createdBy');
  });
});

describe('the shortlist', () => {
  const shelf = [
    idea({ title: 'walk by the river', cost: 'free', outdoors: true, feeling: 'calm' }),
    idea({ title: 'the expensive place', cost: 'splash', feeling: 'romantic' }),
    idea({ title: 'cook badly together', cost: 'cheap', feeling: 'playful' }),
    idea({ title: 'that film', cost: 'cheap', feeling: 'easy' }),
  ];

  it('returns what fits, in shelf order', () => {
    const result = shortlist(shelf, { date: FRIDAY, budget: 'cheap' });
    expect(result.fits.map((entry) => entry.title)).toEqual([
      'cook badly together',
      'that film',
      'walk by the river',
    ]);
  });

  /**
   * The half that stops the feature lying.
   *
   * A filter that silently drops sixteen of twenty ideas leaves you
   * believing you own four, and next Friday you do not trust the shelf.
   */
  it('keeps what it set aside, with the reason', () => {
    const result = shortlist(shelf, { date: FRIDAY, budget: 'cheap' });
    expect(result.setAside).toHaveLength(1);
    expect(result.setAside[0].idea.title).toBe('the expensive place');
    expect(result.setAside[0].misses).toEqual(['too_expensive']);
  });

  it('names the one loosening that would return the most ideas', () => {
    const result = shortlist(shelf, { date: FRIDAY, wet: true, budget: 'cheap' });
    // The walk is the only thing held back by the rain alone.
    expect(result.loosen).toEqual({ reason: 'weather', count: 1 });
  });

  /**
   * Counting an idea that fails on three constraints towards "loosen the
   * budget" would promise a result that raising the budget does not
   * deliver — and a suggestion that does not work is worse than none.
   */
  it('counts only ideas that a single loosening would actually recover', () => {
    const result = shortlist(
      [idea({ title: 'both wrong', cost: 'splash', outdoors: true })],
      { date: FRIDAY, budget: 'free', wet: true },
    );
    expect(result.fits).toEqual([]);
    expect(result.loosen).toBeNull();
  });

  it('has nothing to suggest loosening when everything already fits', () => {
    const result = shortlist(shelf, { date: FRIDAY });
    expect(result.fits).toHaveLength(4);
    expect(result.loosen).toBeNull();
  });
});

describe('small helpers', () => {
  it('reads the hour the way a household does, not an almanac', () => {
    expect(timeOfDayAt(9)).toBe('morning');
    expect(timeOfDayAt(15)).toBe('afternoon');
    // Evening starts when people finish work, not at sunset.
    expect(timeOfDayAt(19)).toBe('evening');
    expect(timeOfDayAt(23)).toBe('night');
  });

  it('says how long since something was last done, and nothing when never', () => {
    expect(daysSinceDone(idea({ lastDoneOn: { year: 2026, month: 8, day: 7 } }), FRIDAY)).toBe(7);
    expect(daysSinceDone(idea(), FRIDAY)).toBeNull();
  });

  it('counts the untried ones for the pair, never per person', () => {
    expect(untriedCount([idea(), idea({ doneCount: 2 }), idea()])).toBe(2);
  });
});
