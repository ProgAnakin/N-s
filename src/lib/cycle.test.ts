import { describe, expect, it } from 'vitest';
import {
  MAX_PLAUSIBLE_GAP,
  MIN_OBSERVATIONS,
  predictionIsUsable,
  summariseCycle,
} from './cycle';
import { addDays, type CalendarDate } from './calendar';

const TODAY: CalendarDate = { year: 2026, month: 6, day: 1 };

/** Starts every `gap` days, oldest first, ending `sinceLast` days ago. */
function starts(gap: number, count: number, sinceLast = 0): CalendarDate[] {
  const out: CalendarDate[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    out.push(addDays(TODAY, -(sinceLast + i * gap)));
  }
  return out;
}

describe('when it refuses to guess', () => {
  it('says nothing at all with no records', () => {
    const summary = summariseCycle([], TODAY);
    expect(summary.lastStart).toBeNull();
    expect(summary.nextExpected).toBeNull();
    expect(summary.dayOfCycle).toBeNull();
  });

  it('still says what day it is with one record, but predicts nothing', () => {
    // Two observations is not a cycle length, it is a gap.
    const summary = summariseCycle([addDays(TODAY, -10)], TODAY);
    expect(summary.dayOfCycle).toBe(10);
    expect(summary.nextExpected).toBeNull();
    expect(summary.averageLength).toBeNull();
  });

  it('refuses below the stated threshold', () => {
    expect(summariseCycle(starts(28, MIN_OBSERVATIONS - 1), TODAY).nextExpected).toBeNull();
  });

  it('refuses when the records have holes in them', () => {
    // Three starts but the gaps are implausible, which means an entry was
    // missed. Averaging around a hole produces a confident lie.
    const gappy = [addDays(TODAY, -200), addDays(TODAY, -120), TODAY];
    expect(summariseCycle(gappy, TODAY).nextExpected).toBeNull();
  });
});

describe('when it does predict', () => {
  it('averages the observed gaps', () => {
    const summary = summariseCycle(starts(30, 4), TODAY);
    expect(summary.averageLength).toBe(30);
    expect(summary.observations).toBe(3);
  });

  it('predicts one average length after the last start', () => {
    const summary = summariseCycle(starts(28, 4, 7), TODAY);
    expect(summary.dayOfCycle).toBe(7);
    expect(summary.daysUntilNext).toBe(21);
  });

  it('drops an implausible gap rather than letting it drag the average', () => {
    // A forgotten entry produces a 62-day "cycle" that would make every
    // future prediction wrong.
    const withHole = [
      addDays(TODAY, -118),
      addDays(TODAY, -90),
      addDays(TODAY, -28),
      TODAY,
    ];
    const summary = summariseCycle(withHole, TODAY);
    expect(summary.averageLength).toBe(28);
    // The 62-day gap is discarded, so the average is the truth rather than
    // the average of a truth and a hole.
    expect(summary.observations).toBe(2);
    // It still predicts: two believable gaps is exactly the evidence three
    // consecutive starts would have given, and a missed entry in the middle
    // does not make the surrounding records less true.
    expect(summary.nextExpected).not.toBeNull();
  });

  it('does not mind what order the records arrive in', () => {
    const ordered = starts(28, 4);
    const shuffled = [ordered[2]!, ordered[0]!, ordered[3]!, ordered[1]!];
    expect(summariseCycle(shuffled, TODAY)).toEqual(summariseCycle(ordered, TODAY));
  });

  it('reports a late cycle as a negative countdown rather than resetting', () => {
    // Being five days late is information. Silently rolling to the next
    // expected date would hide it.
    const late = starts(28, 4, 33);
    expect(summariseCycle(late, TODAY).daysUntilNext).toBe(-5);
  });

  it('never reports a negative day of cycle', () => {
    expect(summariseCycle([addDays(TODAY, 3)], TODAY).dayOfCycle).toBe(0);
  });
});

describe('predictionIsUsable', () => {
  it('is false without enough behind it', () => {
    expect(predictionIsUsable(summariseCycle(starts(28, 2), TODAY))).toBe(false);
  });

  it('is true once there is', () => {
    expect(predictionIsUsable(summariseCycle(starts(28, 5), TODAY))).toBe(true);
  });
});

describe('the bounds are honest', () => {
  it('accepts a genuinely irregular but plausible cycle', () => {
    const irregular = [
      addDays(TODAY, -100),
      addDays(TODAY, -68),
      addDays(TODAY, -33),
      TODAY,
    ];
    const summary = summariseCycle(irregular, TODAY);
    expect(summary.observations).toBe(3);
    expect(summary.averageLength).toBeGreaterThan(30);
    expect(summary.averageLength).toBeLessThanOrEqual(MAX_PLAUSIBLE_GAP);
  });
});

describe('what it never does', () => {
  it('exposes nothing about mood, behaviour or advice', () => {
    // A partner's body is not a weather report to be managed around, and
    // that framing is easy to miss when it is phrased helpfully.
    const summary = summariseCycle(starts(28, 5), TODAY);
    const keys = Object.keys(summary).join(' ');
    expect(keys).not.toMatch(/mood|fertile|pms|symptom|advice|warn/i);
  });
});
