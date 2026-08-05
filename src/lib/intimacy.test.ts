import { describe, expect, it } from 'vitest';
import type { CalendarDate } from './calendar';
import { entriesOn, summarise, type IntimacyEntry, type IntimacyKind } from './intimacy';

const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });
const TODAY = d(2026, 3, 14);

let counter = 0;
function entry(
  date: CalendarDate,
  kind: IntimacyKind = 'sex',
  place: string | null = null,
): IntimacyEntry {
  counter += 1;
  return { id: `i${counter}`, date, kind, place };
}

describe('summarise', () => {
  it('is all zeros and no scolding when nothing is logged', () => {
    const summary = summarise([], TODAY);
    expect(summary.total).toBe(0);
    expect(summary.thisMonth).toBe(0);
    expect(summary.byKind).toEqual([]);
    expect(summary.places).toEqual([]);
    expect(summary.daysSinceLast).toBeNull();
  });

  it('counts the calendar month, not the last thirty days', () => {
    const summary = summarise(
      [entry(d(2026, 3, 1)), entry(d(2026, 3, 14)), entry(d(2026, 2, 28))],
      TODAY,
    );
    expect(summary.thisMonth).toBe(2);
    expect(summary.total).toBe(3);
  });

  it('counts a rolling thirty days separately', () => {
    const summary = summarise(
      [entry(d(2026, 3, 14)), entry(d(2026, 2, 20)), entry(d(2026, 1, 1))],
      TODAY,
    );
    // 14 March and 20 February are inside the window; 1 January is not.
    expect(summary.lastThirtyDays).toBe(2);
  });

  it('ignores entries dated in the future rather than counting them backwards', () => {
    const summary = summarise([entry(d(2026, 4, 1))], TODAY);
    expect(summary.lastThirtyDays).toBe(0);
  });

  it('lists only the kinds that actually happened', () => {
    const summary = summarise([entry(TODAY, 'kiss'), entry(TODAY, 'kiss'), entry(TODAY, 'massage')], TODAY);
    expect(summary.byKind).toEqual([
      { kind: 'kiss', count: 2 },
      { kind: 'massage', count: 1 },
    ]);
  });

  it('ranks places by how often, ignoring blank ones', () => {
    const summary = summarise(
      [
        entry(TODAY, 'sex', 'the kitchen'),
        entry(TODAY, 'sex', 'the kitchen'),
        entry(TODAY, 'sex', 'Lisbon, that hotel'),
        entry(TODAY, 'sex', '   '),
        entry(TODAY, 'sex', null),
      ],
      TODAY,
    );
    expect(summary.places).toEqual([
      { place: 'the kitchen', count: 2 },
      { place: 'Lisbon, that hotel', count: 1 },
    ]);
  });

  it('buckets by month, oldest first so a chart reads left to right', () => {
    const summary = summarise(
      [entry(d(2026, 3, 2)), entry(d(2026, 1, 9)), entry(d(2026, 2, 4)), entry(d(2026, 1, 20))],
      TODAY,
    );
    expect(summary.byMonth.map((m) => m.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(summary.byMonth[0]!.count).toBe(2);
  });

  it('counts distinct days, not entries', () => {
    const summary = summarise([entry(TODAY), entry(TODAY), entry(d(2026, 3, 10))], TODAY);
    expect(summary.total).toBe(3);
    expect(summary.activeDays).toBe(2);
  });

  it('measures from the most recent entry, whatever order they arrive in', () => {
    const summary = summarise([entry(d(2026, 3, 1)), entry(d(2026, 3, 11)), entry(d(2026, 2, 2))], TODAY);
    expect(summary.daysSinceLast).toBe(3);
  });

  it('reports zero, not a negative, on the day itself', () => {
    expect(summarise([entry(TODAY)], TODAY).daysSinceLast).toBe(0);
  });
});

describe('entriesOn', () => {
  it('finds the entries for one day', () => {
    const entries = [entry(d(2026, 3, 14)), entry(d(2026, 3, 14)), entry(d(2026, 3, 15))];
    expect(entriesOn(entries, d(2026, 3, 14))).toHaveLength(2);
    expect(entriesOn(entries, d(2026, 3, 16))).toEqual([]);
  });

  it('does not confuse the same day number in another month', () => {
    expect(entriesOn([entry(d(2026, 2, 14))], d(2026, 3, 14))).toEqual([]);
  });
});
