import { describe, expect, it } from 'vitest';
import type { CalendarDate } from './calendar';
import {
  cadenceFor,
  daysTogether,
  describeCountdown,
  formatDate,
  groupByMonth,
  monthsTogether,
  nextMonthiversary,
  nextOccurrence,
  nextRoundDayMilestone,
  occurrenceFor,
  pastOccurrences,
  upcomingOccurrences,
  type ImportantDateLike,
} from './dates';

const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });

function importantDate(partial: Partial<ImportantDateLike> & { date: CalendarDate }): ImportantDateLike {
  return {
    id: partial.id ?? 'x',
    label: partial.label ?? 'Something',
    type: partial.type ?? 'custom',
    recurring: partial.recurring ?? false,
    date: partial.date,
  };
}

describe('cadenceFor', () => {
  it('makes a monthiversary monthly and a birthday yearly', () => {
    expect(cadenceFor('monthiversary', true)).toBe('monthly');
    expect(cadenceFor('birthday', true)).toBe('yearly');
    expect(cadenceFor('anniversary', true)).toBe('yearly');
  });

  it('respects a date that was marked as not recurring', () => {
    expect(cadenceFor('birthday', false)).toBe('none');
    expect(cadenceFor('milestone', false)).toBe('none');
  });
});

describe('nextOccurrence', () => {
  it('returns this year when the day is still ahead', () => {
    expect(nextOccurrence(d(1996, 5, 20), 'yearly', d(2026, 3, 14))).toEqual(d(2026, 5, 20));
  });

  it('rolls to next year once the day has passed', () => {
    expect(nextOccurrence(d(1996, 5, 20), 'yearly', d(2026, 6, 1))).toEqual(d(2027, 5, 20));
  });

  it('counts the day itself as upcoming, not missed', () => {
    expect(nextOccurrence(d(1996, 5, 20), 'yearly', d(2026, 5, 20))).toEqual(d(2026, 5, 20));
  });

  it('handles a 29 February birthday in a common year', () => {
    expect(nextOccurrence(d(2000, 2, 29), 'yearly', d(2026, 1, 1))).toEqual(d(2026, 2, 28));
    expect(nextOccurrence(d(2000, 2, 29), 'yearly', d(2028, 1, 1))).toEqual(d(2028, 2, 29));
  });

  it('steps a monthiversary month by month', () => {
    expect(nextOccurrence(d(2025, 9, 12), 'monthly', d(2026, 3, 14))).toEqual(d(2026, 4, 12));
    expect(nextOccurrence(d(2025, 9, 12), 'monthly', d(2026, 3, 12))).toEqual(d(2026, 3, 12));
  });

  it('does not let a month-end monthiversary drift', () => {
    // The 31st clamps to 28/30 where it must, then returns to the 31st.
    expect(nextOccurrence(d(2025, 12, 31), 'monthly', d(2026, 2, 1))).toEqual(d(2026, 2, 28));
    expect(nextOccurrence(d(2025, 12, 31), 'monthly', d(2026, 3, 1))).toEqual(d(2026, 3, 31));
  });

  it('returns a future one-off unchanged and a past one-off as null', () => {
    expect(nextOccurrence(d(2026, 8, 1), 'none', d(2026, 3, 14))).toEqual(d(2026, 8, 1));
    expect(nextOccurrence(d(2025, 8, 1), 'none', d(2026, 3, 14))).toBeNull();
  });
});

describe('occurrenceFor', () => {
  it('reports which birthday it will be', () => {
    const occurrence = occurrenceFor(
      importantDate({ date: d(1996, 5, 20), type: 'birthday', recurring: true, label: 'Her birthday' }),
      d(2026, 3, 14),
    );
    expect(occurrence?.date).toEqual(d(2026, 5, 20));
    expect(occurrence?.ordinal).toBe(30);
    expect(occurrence?.daysUntil).toBe(67);
  });

  it('reports which monthiversary it will be', () => {
    const occurrence = occurrenceFor(
      importantDate({ date: d(2025, 9, 12), type: 'monthiversary', recurring: true }),
      d(2026, 3, 14),
    );
    expect(occurrence?.ordinal).toBe(7);
  });

  it('has no ordinal for a one-off', () => {
    const occurrence = occurrenceFor(
      importantDate({ date: d(2026, 8, 1), type: 'milestone', recurring: false }),
      d(2026, 3, 14),
    );
    expect(occurrence?.ordinal).toBeNull();
  });
});

describe('upcomingOccurrences', () => {
  const today = d(2026, 3, 14);
  const dates: ImportantDateLike[] = [
    importantDate({ id: 'b', date: d(1996, 5, 20), type: 'birthday', recurring: true, label: 'Birthday' }),
    importantDate({ id: 'm', date: d(2025, 9, 12), type: 'monthiversary', recurring: true, label: 'Monthiversary' }),
    importantDate({ id: 'p', date: d(2020, 1, 1), type: 'milestone', recurring: false, label: 'Past thing' }),
  ];

  it('sorts by how soon they are', () => {
    const result = upcomingOccurrences(dates, today);
    expect(result.map((o) => o.source.id)).toEqual(['m', 'b']);
  });

  it('drops one-offs that have already happened', () => {
    expect(upcomingOccurrences(dates, today).some((o) => o.source.id === 'p')).toBe(false);
  });

  it('respects a horizon', () => {
    // The monthiversary is 29 days out, the birthday 67.
    expect(upcomingOccurrences(dates, today, 30).map((o) => o.source.id)).toEqual(['m']);
    expect(upcomingOccurrences(dates, today, 14)).toEqual([]);
  });

  it('respects a limit', () => {
    expect(upcomingOccurrences(dates, today, null, 1)).toHaveLength(1);
  });

  it('lists past one-offs separately, newest first', () => {
    const past = pastOccurrences(dates, today);
    expect(past.map((p) => p.id)).toEqual(['p']);
  });
});

describe('time together', () => {
  const anniversary = d(2025, 9, 12);

  it('counts days since the anniversary', () => {
    expect(daysTogether(anniversary, d(2026, 3, 14))).toBe(183);
  });

  it('never goes negative for a future anniversary', () => {
    expect(daysTogether(d(2027, 1, 1), d(2026, 3, 14))).toBe(0);
  });

  it('counts whole months', () => {
    expect(monthsTogether(anniversary, d(2026, 3, 11))).toBe(5);
    expect(monthsTogether(anniversary, d(2026, 3, 12))).toBe(6);
  });

  it('finds the next monthiversary and its number', () => {
    const next = nextMonthiversary(anniversary, d(2026, 3, 14));
    expect(next?.date).toEqual(d(2026, 4, 12));
    expect(next?.months).toBe(7);
    expect(next?.daysUntil).toBe(29);
  });

  it('surfaces a round day-count only when it is close', () => {
    // Day 183 of the relationship: 200 days is 17 away.
    expect(nextRoundDayMilestone(anniversary, d(2026, 3, 14), 30)?.days).toBe(200);
    expect(nextRoundDayMilestone(anniversary, d(2026, 3, 14), 10)).toBeNull();
  });
});

describe('describeCountdown', () => {
  it('names the near days', () => {
    expect(describeCountdown(0)).toEqual({ kind: 'today' });
    expect(describeCountdown(1)).toEqual({ kind: 'tomorrow' });
    expect(describeCountdown(-1)).toEqual({ kind: 'yesterday' });
  });

  it('switches to weeks past a fortnight', () => {
    expect(describeCountdown(9)).toEqual({ kind: 'inDays', days: 9 });
    expect(describeCountdown(30)).toEqual({ kind: 'inWeeks', weeks: 4, days: 30 });
  });

  it('handles the past', () => {
    expect(describeCountdown(-5)).toEqual({ kind: 'daysAgo', days: 5 });
  });
});

describe('formatDate', () => {
  it('formats in UTC so the day never shifts', () => {
    expect(formatDate(d(2026, 3, 14), 'long', 'en-GB')).toBe('14 March 2026');
  });

  it('falls back rather than throwing on a bad locale', () => {
    expect(formatDate(d(2026, 3, 14), 'long', 'not-a-locale!!')).toContain('2026');
  });
});

describe('groupByMonth', () => {
  it('buckets by month, newest first', () => {
    const items = [
      { id: 'a', date: d(2026, 1, 5) },
      { id: 'b', date: d(2026, 3, 2) },
      { id: 'c', date: d(2026, 3, 20) },
    ];
    const groups = groupByMonth(items, (item) => item.date);
    expect(groups.map((g) => g.key)).toEqual(['2026-03', '2026-01']);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['b', 'c']);
  });
});
