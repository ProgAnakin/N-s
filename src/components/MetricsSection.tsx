import { useMemo } from 'react';
import { Sheet } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import { parseISODate } from '@/lib/calendar';
import { QUESTION_BANK } from '@/lib/questions';
import { computeMetrics, metricsWorthShowing } from '@/lib/metrics';
import { useStrings } from '@/i18n';
import { useCoupleTable, useToday } from '@/screens/shared';

/**
 * What the two of you have built, in figures.
 *
 * Gamification, but only the half of it that is not manipulative. There are
 * no streaks to break, no badges, no percentage complete and no comparison
 * between the two people — the reasoning is in lib/metrics.ts and it is the
 * whole reason this component is short.
 *
 * The visual grammar is a page of an almanac rather than a dashboard: the
 * figure in the display face, the meaning underneath in small type. Every
 * card explains itself, because a number nobody can interpret is either
 * decoration or anxiety.
 */
/**
 * How much history a metric is willing to read.
 *
 * These five queries ask for one field each — an id and a date, an id and
 * a boolean — so a row is tens of bytes and the payload was never the
 * problem. What they had was no ceiling at all, on a screen somebody opens
 * every day.
 *
 * A cap rather than a server-side count, because none of these is a count:
 * `metrics.ts` folds rows into *distinct days*, and `select count(*)`
 * cannot answer that without a view. Five thousand is a memory every day
 * for thirteen years — past which a couple has better news than a metric,
 * and the honest reading of a number that far out is "a lot" anyway.
 */
const METRIC_ROW_LIMIT = 5000;

export function MetricsSection({ className }: { className?: string }) {
  const s = useStrings();
  const { couple } = useCouple();
  const today = useToday();

  // Counts only. Nothing here reads anybody's words.
  const plans = useCoupleTable('plans', {
    coupleId: couple.id,
    columns: 'id,day,went_well',
      limit: METRIC_ROW_LIMIT,
  });
  const memories = useCoupleTable('memories', {
    coupleId: couple.id,
    columns: 'id,date',
    limit: METRIC_ROW_LIMIT,
  });
  const letters = useCoupleTable('letters', {
    coupleId: couple.id,
    columns: 'id,created_at',
    limit: METRIC_ROW_LIMIT,
  });
  const facts = useCoupleTable('remember_facts', {
    coupleId: couple.id,
    columns: 'id,answer,answer_kind',
      limit: METRIC_ROW_LIMIT,
  });
  const phrases = useCoupleTable('phrases', {
    coupleId: couple.id,
    columns: 'id,learned',
    limit: METRIC_ROW_LIMIT,
  });

  const metrics = useMemo(
    () =>
      computeMetrics({
        today,
        anniversary: parseISODate(couple.anniversary_date),
        planDays: plans.rows
          .map((row) => parseISODate(row.day))
          .filter((day): day is NonNullable<typeof day> => day !== null),
        planWentWell: plans.rows
          .map((row) => row.went_well)
          .filter((value): value is boolean => value !== null && value !== undefined),
        memoryDays: memories.rows
          .map((row) => parseISODate(row.date))
          .filter((day): day is NonNullable<typeof day> => day !== null),
        letterDays: letters.rows
          .map((row) => parseISODate(row.created_at?.slice(0, 10) ?? null))
          .filter((day): day is NonNullable<typeof day> => day !== null),
        answers: facts.rows.map((row) => ({
          answered: (row.answer ?? '').trim() !== '',
          actionable: ['taste', 'place', 'activity', 'boundary'].includes(
            row.answer_kind ?? 'insight',
          ),
        })),
        bankSize: QUESTION_BANK.length,
        countries: [],
        phrases: phrases.rows.map((row) => ({ learned: row.learned })),
      }),
    [
      today,
      couple.anniversary_date,
      plans.rows,
      memories.rows,
      letters.rows,
      facts.rows,
      phrases.rows,
    ],
  );

  if (!metricsWorthShowing(metrics)) return null;

  return (
    <section className={className} aria-labelledby="metrics">
      <h2 id="metrics" className="label-kicker mb-3">
        {s.metrics.title}
      </h2>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {metrics.map((metric) => {
          const copy = s.metrics.ids[metric.id];
          if (!copy) return null;
          return (
            <li key={metric.id}>
              <Sheet className="flex h-full flex-col p-4">
                <p className="display-warm font-display text-2xl font-medium tabular-nums text-ink">
                  {metric.value}
                  {metric.outOf !== null && (
                    <span className="ml-1 text-sm font-normal text-ink-faint">
                      / {metric.outOf}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm font-medium text-ink">{copy.label}</p>
                {/* Every card explains itself. A number nobody can interpret
                    is either decoration or anxiety. */}
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">{copy.note}</p>
              </Sheet>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 max-w-prose text-xs leading-relaxed text-ink-faint">
        {s.metrics.footnote}
      </p>
    </section>
  );
}
