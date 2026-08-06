import { describe, expect, it } from 'vitest';
import type { CalendarDate } from './calendar';
import type { ImportantDateLike } from './dates';
import { buildReminders, giftsForOccasion, type ReminderContext, actionFor, POSTING_HORIZON_DAYS, LAST_MINUTE_DAYS } from './reminders';

const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });
const TODAY = d(2026, 3, 14);

function context(overrides: Partial<ReminderContext> = {}): ReminderContext {
  return {
    today: TODAY,
    anniversary: null,
    dates: [],
    facts: [],
    gifts: [],
    trips: [],
    reunionDate: null,
    ...overrides,
  };
}

const birthday: ImportantDateLike = {
  id: 'bd',
  label: 'Her birthday',
  date: d(1996, 3, 20),
  type: 'birthday',
  recurring: true,
};

describe('buildReminders', () => {
  it('says nothing when there is nothing worth saying', () => {
    expect(buildReminders(context())).toEqual([]);
  });

  it('surfaces a date inside the fortnight', () => {
    const reminders = buildReminders(context({ dates: [birthday] }));
    const upcoming = reminders.find((r) => r.kind === 'upcoming_date');
    expect(upcoming).toBeDefined();
    expect(upcoming).toMatchObject({ label: 'Her birthday', daysUntil: 6, ordinal: 30 });
  });

  it('stays quiet about a date that is still months away', () => {
    const far: ImportantDateLike = { ...birthday, date: d(1996, 11, 2) };
    expect(buildReminders(context({ dates: [far] }))).toEqual([]);
  });

  it('flags a close birthday with nothing saved in the gift radar', () => {
    const reminders = buildReminders(context({ dates: [birthday] }), 5);
    expect(reminders[0]).toMatchObject({ giftWorthy: true, giftIdeaCount: 0 });
  });

  it('counts ideas already saved rather than nudging again', () => {
    const reminders = buildReminders(
      context({
        dates: [birthday],
        gifts: [{ id: 'g1', idea: 'the ceramics class she mentioned', occasion: 'birthday', used: false }],
      }),
      5,
    );
    expect(reminders[0]).toMatchObject({ giftWorthy: true, giftIdeaCount: 1 });
  });

  it('ignores gift ideas that have already been used', () => {
    const reminders = buildReminders(
      context({
        dates: [birthday],
        gifts: [{ id: 'g1', idea: 'last year', occasion: 'birthday', used: true }],
      }),
      5,
    );
    expect(reminders[0]).toMatchObject({ giftIdeaCount: 0 });
  });

  it('does not raise the gift question on the eve of the day', () => {
    // One day's notice is too late to be useful and only makes you feel bad.
    const tomorrow: ImportantDateLike = { ...birthday, date: d(1996, 3, 15) };
    const reminders = buildReminders(context({ dates: [tomorrow] }), 5);
    expect(reminders[0]).toMatchObject({ daysUntil: 1, giftWorthy: false });
  });

  it('does not raise the gift question for a monthiversary', () => {
    const monthly: ImportantDateLike = {
      id: 'mv',
      label: 'Monthiversary',
      date: d(2025, 9, 18),
      type: 'monthiversary',
      recurring: true,
    };
    const reminders = buildReminders(context({ dates: [monthly] }), 5);
    expect(reminders[0]).toMatchObject({ kind: 'upcoming_date', giftWorthy: false });
  });

  it('reminds about something she mentioned, before and after the day', () => {
    const before = buildReminders(
      context({ facts: [{ id: 'f1', question: 'Her exam', remindOn: d(2026, 3, 16) }] }),
    );
    expect(before[0]).toMatchObject({ kind: 'fact_followup', daysUntil: 2 });

    const after = buildReminders(
      context({ facts: [{ id: 'f1', question: 'Her exam', remindOn: d(2026, 3, 12) }] }),
    );
    expect(after[0]).toMatchObject({ kind: 'fact_followup', daysUntil: -2 });
  });

  it('lets a follow-up go once the moment has passed', () => {
    const reminders = buildReminders(
      context({ facts: [{ id: 'f1', question: 'Her exam', remindOn: d(2026, 2, 1) }] }),
    );
    expect(reminders).toEqual([]);
  });

  it('ignores notes with no date on them', () => {
    const reminders = buildReminders(
      context({ facts: [{ id: 'f1', question: 'She likes jasmine tea', remindOn: null }] }),
    );
    expect(reminders).toEqual([]);
  });

  it('mentions a trip with loose ends', () => {
    const reminders = buildReminders(
      context({
        trips: [{ id: 't1', destination: 'Lisbon', startDate: d(2026, 3, 28), openItemCount: 3 }],
      }),
    );
    expect(reminders[0]).toMatchObject({
      kind: 'trip_open_items',
      destination: 'Lisbon',
      openItems: 3,
    });
  });

  it('says nothing about a trip that is fully packed', () => {
    const reminders = buildReminders(
      context({
        trips: [{ id: 't1', destination: 'Lisbon', startDate: d(2026, 3, 28), openItemCount: 0 }],
      }),
    );
    expect(reminders).toEqual([]);
  });

  it('says nothing about a trip already under way', () => {
    const reminders = buildReminders(
      context({
        trips: [{ id: 't1', destination: 'Lisbon', startDate: d(2026, 3, 1), openItemCount: 3 }],
      }),
    );
    expect(reminders).toEqual([]);
  });

  it('counts down to seeing each other again', () => {
    const reminders = buildReminders(context({ reunionDate: d(2026, 3, 20) }));
    expect(reminders[0]).toMatchObject({ kind: 'reunion', daysUntil: 6 });
  });

  it('notices an upcoming monthiversary', () => {
    const reminders = buildReminders(context({ anniversary: d(2025, 9, 15) }));
    expect(reminders.some((r) => r.kind === 'monthiversary' && r.months === 6)).toBe(true);
  });

  it('puts the most urgent thing first', () => {
    const reminders = buildReminders(
      context({
        dates: [{ ...birthday, date: d(1996, 3, 15) }],
        trips: [{ id: 't1', destination: 'Lisbon', startDate: d(2026, 3, 28), openItemCount: 2 }],
      }),
    );
    expect(reminders[0]!.kind).toBe('upcoming_date');
  });

  it('keeps the list short', () => {
    const dates: ImportantDateLike[] = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`,
      label: `Date ${i}`,
      date: d(2026, 3, 15 + i),
      type: 'custom',
      recurring: false,
    }));
    expect(buildReminders(context({ dates }))).toHaveLength(3);
  });

  it('never repeats itself about the same subject', () => {
    const reminders = buildReminders(
      context({
        dates: [birthday, { ...birthday, id: 'bd2', label: 'His birthday', date: d(1994, 3, 22) }],
        facts: [{ id: 'f1', question: 'Her exam', remindOn: d(2026, 3, 15) }],
        reunionDate: d(2026, 3, 25),
      }),
      10,
    );
    const ids = reminders.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(reminders.length).toBeGreaterThan(2);
  });
});

describe('giftsForOccasion', () => {
  const gifts = [
    { id: '1', idea: 'ceramics class', occasion: 'Birthday', used: false },
    { id: '2', idea: 'scarf', occasion: 'her birthday 2026', used: false },
    { id: '3', idea: 'a book', occasion: 'Christmas', used: false },
    { id: '4', idea: 'nothing yet', occasion: null, used: false },
  ];

  it('matches loosely, the way people actually type occasions', () => {
    const matched = giftsForOccasion(gifts, 'Her birthday', 'birthday');
    expect(matched.map((g) => g.id).sort()).toEqual(['1', '2']);
  });

  it('does not match an unrelated occasion', () => {
    expect(giftsForOccasion(gifts, 'Her birthday', 'birthday').some((g) => g.id === '3')).toBe(false);
  });

  it('skips ideas with no occasion set', () => {
    expect(giftsForOccasion(gifts, 'Her birthday', 'birthday').some((g) => g.id === '4')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The step, not just the fact
// ---------------------------------------------------------------------------

describe('actionFor', () => {
  function birthday(daysUntil: number, giftWorthy = true): Reminder {
    return {
      id: 'r1',
      kind: 'upcoming_date',
      daysUntil,
      label: 'Their birthday',
      dateType: 'birthday',
      ordinal: 30,
      giftWorthy,
      giftIdeaCount: 0,
    };
  }

  it('says look, then post, then keep it small, as the day approaches', () => {
    // Which step depends almost entirely on how much time is left. Three
    // weeks out the useful sentence is about booking; three days out it is
    // about not panicking.
    expect(actionFor(birthday(21))).toBe('gift_look');
    expect(actionFor(birthday(POSTING_HORIZON_DAYS))).toBe('gift_ship');
    expect(actionFor(birthday(LAST_MINUTE_DAYS))).toBe('gift_soon');
  });

  it('never suggests buying anything for a date where a present is not the point', () => {
    expect(actionFor(birthday(21, false))).toBeNull();
    expect(actionFor(birthday(3, false))).toBe('say_it');
  });

  it('asks how it went only once it has happened', () => {
    const before: Reminder = { id: 'r', kind: 'fact_followup', daysUntil: 2, question: 'exam' };
    const after: Reminder = { id: 'r', kind: 'fact_followup', daysUntil: -1, question: 'exam' };
    expect(actionFor(before)).toBeNull();
    expect(actionFor(after)).toBe('ask');
  });

  it('never turns a monthiversary into a shopping trip', () => {
    // A monthiversary that costs money every month becomes an obligation,
    // which is the opposite of what it is.
    const monthly: Reminder = { id: 'r', kind: 'monthiversary', daysUntil: 2, months: 18 };
    expect(actionFor(monthly)).toBe('say_it');
  });

  it('stays quiet about a reunion that is still months away', () => {
    const far: Reminder = { id: 'r', kind: 'reunion', daysUntil: 90 };
    const near: Reminder = { id: 'r', kind: 'reunion', daysUntil: 14 };
    expect(actionFor(far)).toBeNull();
    expect(actionFor(near)).toBe('book');
  });

  it('has a step for every kind it claims to handle', () => {
    const kinds: Reminder[] = [
      birthday(5),
      { id: 'r', kind: 'fact_followup', daysUntil: -1, question: 'x' },
      { id: 'r', kind: 'trip_open_items', daysUntil: 5, destination: 'Porto', openItems: 2 },
      { id: 'r', kind: 'monthiversary', daysUntil: 1, months: 6 },
      { id: 'r', kind: 'day_milestone', daysUntil: 1, days: 1000 },
      { id: 'r', kind: 'reunion', daysUntil: 5 },
    ];
    expect(kinds.every((reminder) => actionFor(reminder) !== undefined)).toBe(true);
  });
});
