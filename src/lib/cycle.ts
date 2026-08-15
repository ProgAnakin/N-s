import { addDays, compareDates, daysBetween, type CalendarDate } from './calendar';

/**
 * Cycle tracking, for whoever wants it.
 *
 * Three decisions shape this module, and all three are about restraint.
 *
 * **It predicts from what was observed, and stores nothing derived.** A
 * predicted date written into the database goes stale the moment the next
 * period is late, and then the app is confidently telling somebody
 * something untrue about their own body. Only observed starts are stored;
 * everything else is computed on read.
 *
 * **It says how confident it is, and refuses when it is not.** Two
 * observations is not a cycle length, it is a gap. Below the threshold this
 * returns no prediction at all rather than a number with a shrug attached —
 * an app that guesses here is worse than an app that says nothing, because
 * the guess gets planned around.
 *
 * **It never interprets.** No mood forecasts, no "she may be irritable", no
 * advice about how to behave. That framing turns a partner's body into a
 * weather report to be managed around, which is degrading in a way that is
 * easy to miss when it is phrased helpfully. The app shows a date and stops.
 */

/** Below this many observed starts, no prediction is offered. */
export const MIN_OBSERVATIONS = 3;

/**
 * Gaps outside this range are dropped before averaging.
 *
 * A forgotten entry produces a 62-day "cycle" that would drag the average
 * far enough to make every future prediction wrong. The bounds are wide
 * enough to cover genuinely irregular cycles and narrow enough to catch a
 * missed record.
 */
const MIN_PLAUSIBLE_GAP = 18;
export const MAX_PLAUSIBLE_GAP = 45;


export interface CycleSummary {
  /** The most recent observed start, or null. */
  lastStart: CalendarDate | null;
  /** Days since that start. Null when there is nothing recorded. */
  dayOfCycle: number | null;
  /** The averaged length, or null when there is not enough to average. */
  averageLength: number | null;
  /** How many plausible gaps went into the average. */
  observations: number;
  /** The next expected start, or null when the app will not guess. */
  nextExpected: CalendarDate | null;
  daysUntilNext: number | null;
}

/**
 * Everything derivable from a list of observed starts.
 *
 * Order does not matter; the caller may hand these over however the
 * database returned them.
 */
export function summariseCycle(
  startsIso: readonly CalendarDate[],
  today: CalendarDate,
): CycleSummary {
  const starts = [...startsIso].sort(compareDates);
  const lastStart = starts[starts.length - 1] ?? null;

  const empty: CycleSummary = {
    lastStart,
    dayOfCycle: lastStart ? Math.max(0, daysBetween(lastStart, today)) : null,
    averageLength: null,
    observations: 0,
    nextExpected: null,
    daysUntilNext: null,
  };

  if (starts.length < MIN_OBSERVATIONS) return empty;

  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i += 1) {
    const gap = daysBetween(starts[i - 1], starts[i]);
    if (gap >= MIN_PLAUSIBLE_GAP && gap <= MAX_PLAUSIBLE_GAP) gaps.push(gap);
  }

  // Enough starts but not enough believable gaps means the records have
  // holes in them, and averaging around a hole produces a confident lie.
  if (gaps.length < MIN_OBSERVATIONS - 1) return empty;

  const average = Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
  const nextExpected = lastStart ? addDays(lastStart, average) : null;

  return {
    lastStart,
    dayOfCycle: lastStart ? Math.max(0, daysBetween(lastStart, today)) : null,
    averageLength: average,
    observations: gaps.length,
    nextExpected,
    daysUntilNext: nextExpected ? daysBetween(today, nextExpected) : null,
  };
}

/**
 * Whether a prediction is worth putting in front of the partner.
 *
 * Stricter than showing it to the person whose cycle it is. Your own
 * estimate being a few days out is mildly annoying; a partner planning
 * around a bad estimate is how somebody ends up feeling managed.
 */
export function predictionIsUsable(summary: CycleSummary): boolean {
  return summary.nextExpected !== null && summary.observations >= MIN_OBSERVATIONS;
}
