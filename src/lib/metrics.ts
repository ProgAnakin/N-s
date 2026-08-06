import { daysBetween, type CalendarDate } from './calendar';

/**
 * Couple metrics.
 *
 * Every metric here obeys one rule, and it is not negotiable: **a metric is
 * about the pair, never about one of them relative to the other.** No
 * "you wrote nine letters and they wrote three", no effort scores, no
 * leaderboards. The app already refuses to say who owes whom about money;
 * doing it with affection instead would be worse, because money at least
 * has an objective quantity behind it.
 *
 * The second rule: **nothing here is a score out of a hundred, and nothing
 * has a target.** A number with a maximum invites the question "why is it
 * not full", and the honest answer for a relationship is that the number
 * was never the point. So these are counts, spans and rhythms — facts about
 * what the two of them have done — and the interface says what each one
 * means rather than how well they are doing at it.
 *
 * The third rule, which is where most apps of this kind go wrong: **a
 * metric that can only get worse is a punishment.** "Days since your last
 * date" climbing forever is a machine for making somebody feel bad on a
 * quiet month. Every rhythm here is expressed as a recent count over a
 * window, which recovers the moment somebody does something, rather than a
 * gap that only ever grows.
 */

export interface MetricInput {
  today: CalendarDate;
  anniversary: CalendarDate | null;
  /** Dates of plans that have already happened. */
  planDays: readonly CalendarDate[];
  /** Plans somebody marked as worth repeating. */
  planWentWell: readonly boolean[];
  /** Days memories were made on. */
  memoryDays: readonly CalendarDate[];
  /** Days letters were written on, either direction. */
  letterDays: readonly CalendarDate[];
  /** Every answer in the vault, and whether it can become something. */
  answers: readonly { answered: boolean; actionable: boolean }[];
  /** How many questions the bank holds, for the "still to ask" figure. */
  bankSize: number;
  /** Countries the couple spans. One is not worse than two. */
  countries: readonly string[];
  /** Phrases saved in each other's languages, and how many are learned. */
  phrases: readonly { learned: boolean }[];
}

/** The window every rhythm is measured over. A season. */
export const RHYTHM_WINDOW_DAYS = 90;

export interface Metric {
  id: MetricId;
  /** The figure itself. Always a count or a span, never a percentage. */
  value: number;
  /** A second figure where the first is meaningless alone, e.g. "12 of 54". */
  outOf: number | null;
}

export type MetricId =
  /** Answers in the vault. How much of each other you have written down. */
  | 'discovered'
  /** Of those, how many can come back as something useful. */
  | 'actionable'
  /** Questions in the bank nobody has answered yet. Never a debt. */
  | 'stillToAsk'
  /** Plans in the last season. A rhythm, not a streak. */
  | 'timeTogether'
  /** Of the plans you judged, how many you would do again. */
  | 'worthRepeating'
  /** Letters in the last season, from either of you, counted as one. */
  | 'wordsKept'
  /** Days since you started. The one figure that only goes up, and should. */
  | 'daysTogether'
  /** Phrases learned in each other's languages. */
  | 'languageCrossed';

function within(days: readonly CalendarDate[], today: CalendarDate, window: number): number {
  return days.filter((day) => {
    const ago = daysBetween(day, today);
    return ago >= 0 && ago <= window;
  }).length;
}

export function computeMetrics(input: MetricInput): Metric[] {
  const {
    today,
    anniversary,
    planDays,
    planWentWell,
    memoryDays,
    letterDays,
    answers,
    bankSize,
    phrases,
  } = input;

  const answered = answers.filter((answer) => answer.answered);
  const judged = planWentWell.length;

  const metrics: Metric[] = [
    {
      id: 'discovered',
      value: answered.length,
      outOf: null,
    },
    {
      id: 'actionable',
      value: answered.filter((answer) => answer.actionable).length,
      outOf: answered.length || null,
    },
    {
      // Framed as "still to ask", never as "unanswered" or a completion bar.
      // Fifty questions you have not asked is an invitation; "12% complete"
      // is homework.
      id: 'stillToAsk',
      value: Math.max(0, bankSize - answered.length),
      outOf: bankSize,
    },
    {
      id: 'timeTogether',
      value: within(planDays, today, RHYTHM_WINDOW_DAYS) + within(memoryDays, today, RHYTHM_WINDOW_DAYS),
      outOf: null,
    },
    {
      id: 'worthRepeating',
      value: planWentWell.filter(Boolean).length,
      outOf: judged || null,
    },
    {
      id: 'wordsKept',
      value: within(letterDays, today, RHYTHM_WINDOW_DAYS),
      outOf: null,
    },
    {
      id: 'languageCrossed',
      value: phrases.filter((phrase) => phrase.learned).length,
      outOf: phrases.length || null,
    },
  ];

  if (anniversary) {
    metrics.unshift({
      id: 'daysTogether',
      value: Math.max(0, daysBetween(anniversary, today)),
      outOf: null,
    });
  }

  // A metric at zero is noise on a page — a new couple would see eight
  // zeroes and learn nothing except that they are behind. They appear as
  // they become true.
  return metrics.filter((metric) => metric.value > 0 || metric.id === 'stillToAsk');
}

/**
 * Whether there is enough here to be worth a page.
 *
 * Two metrics is a stat block; five is a picture. Below that the section
 * stays hidden rather than showing a nearly-empty grid, which reads as the
 * app being disappointed in you.
 */
export function metricsWorthShowing(metrics: readonly Metric[]): boolean {
  return metrics.filter((metric) => metric.value > 0).length >= 3;
}
