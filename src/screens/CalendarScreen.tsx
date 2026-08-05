import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Bits';
import { SelectField, TextAreaField, TextField, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, Sheet } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import { toImportantDates } from '@/data/mappers';
import type { PlanKindColumn, PlanRow } from '@/data/database.types';
import { compareDates, parseISODate, toISODate, type CalendarDate } from '@/lib/calendar';
import { formatDate, formatMonthYear, monthGrid, occurrenceFor } from '@/lib/dates';
import { useI18n, useStrings } from '@/i18n';
import { RecordActions, useCoupleTable, useToday } from './shared';
import { cn } from '@/utils/cn';

const PLAN_KINDS: readonly PlanKindColumn[] = ['date', 'celebration', 'outing', 'other'];

interface Draft {
  id: string | null;
  title: string;
  day: string;
  time: string;
  location: string;
  note: string;
  kind: PlanKindColumn;
  done: boolean;
}

/**
 * The calendar.
 *
 * A month at a time, with four things marked on it: plans, the recurring
 * dates that matter, trips, and — only when that log is switched on — the
 * together marks. Marks are the app's own seal shape rather than hearts,
 * because a grid of hearts belongs to a different app than this one.
 *
 * The grid is always six weeks tall so paging through the year never makes
 * the page below it jump.
 */
export function CalendarScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple } = useCouple();
  const today = useToday();

  const plans = useCoupleTable('plans', { coupleId: couple.id, orderBy: 'day', ascending: true });
  const dates = useCoupleTable('important_dates', { coupleId: couple.id, orderBy: 'date' });
  const trips = useCoupleTable('trips', { coupleId: couple.id, orderBy: 'start_date' });
  const intimacy = useCoupleTable('intimacy_entries', {
    coupleId: couple.id,
    orderBy: 'date',
    enabled: couple.intimacy_mode,
  });

  const [cursor, setCursor] = useState({ year: today.year, month: today.month });
  const [selected, setSelected] = useState<CalendarDate>(today);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const grid = useMemo(
    () => monthGrid(cursor.year, cursor.month, today),
    [cursor.year, cursor.month, today],
  );

  /** Everything that lands on a given day, keyed by ISO date for O(1) lookup. */
  const marks = useMemo(() => {
    const map = new Map<string, { plans: number; dates: number; trip: boolean; together: number }>();
    const touch = (iso: string) =>
      map.get(iso) ?? (map.set(iso, { plans: 0, dates: 0, trip: false, together: 0 }), map.get(iso)!);

    for (const plan of plans.rows) touch(plan.day).plans += 1;

    for (const source of toImportantDates(dates.rows)) {
      const occurrence = occurrenceFor(source, { year: cursor.year, month: cursor.month, day: 1 });
      if (occurrence) touch(toISODate(occurrence.date)).dates += 1;
    }

    for (const trip of trips.rows) {
      const start = parseISODate(trip.start_date);
      const end = parseISODate(trip.end_date) ?? start;
      if (!start || !end) continue;
      for (const week of grid) {
        for (const cell of week) {
          if (compareDates(cell.date, start) >= 0 && compareDates(cell.date, end) <= 0) {
            touch(toISODate(cell.date)).trip = true;
          }
        }
      }
    }

    for (const entry of intimacy.rows) touch(entry.date).together += 1;

    return map;
  }, [plans.rows, dates.rows, trips.rows, intimacy.rows, grid, cursor.year, cursor.month]);

  const selectedIso = toISODate(selected);
  const selectedPlans = plans.rows.filter((plan) => plan.day === selectedIso);
  const selectedDates = useMemo(
    () =>
      toImportantDates(dates.rows)
        .map((source) => occurrenceFor(source, { year: selected.year, month: selected.month, day: 1 }))
        .filter((o): o is NonNullable<typeof o> => o !== null && toISODate(o.date) === selectedIso),
    [dates.rows, selected, selectedIso],
  );

  const upcoming = plans.rows
    .filter((plan) => plan.day >= toISODate(today) && !plan.done)
    .slice(0, 5);

  function step(delta: number) {
    const total = cursor.year * 12 + (cursor.month - 1) + delta;
    setCursor({ year: Math.floor(total / 12), month: (total % 12) + 1 });
  }

  function startNew(day: CalendarDate) {
    setDraft({
      id: null,
      title: '',
      day: toISODate(day),
      time: '',
      location: '',
      note: '',
      kind: 'outing',
      done: false,
    });
  }

  function startEdit(row: PlanRow) {
    setDraft({
      id: row.id,
      title: row.title,
      day: row.day,
      time: row.time_of_day?.slice(0, 5) ?? '',
      location: row.location ?? '',
      note: row.note ?? '',
      kind: row.kind,
      done: row.done,
    });
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.title.trim() || !draft.day) return;

    setSaving(true);
    const values = {
      title: draft.title.trim(),
      day: draft.day,
      time_of_day: draft.time || null,
      location: draft.location.trim() || null,
      note: draft.note.trim() || null,
      kind: draft.kind,
      done: draft.done,
    };
    if (draft.id) await plans.update(draft.id, values);
    else await plans.create({ ...values, couple_id: couple.id });
    setSaving(false);
    setDraft(null);
  }

  return (
    <div>
      <PageHeader
        kicker={s.nav.calendar}
        title={s.calendar.title}
        subtitle={s.calendar.subtitle}
        actions={
          <Button variant="primary" onClick={() => startNew(selected)}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      {/* --- Month ---------------------------------------------------------- */}
      <Sheet className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <IconButton label={s.calendar.previousMonth} onClick={() => step(-1)}>
            <ChevronLeft />
          </IconButton>
          <h2 className="font-display text-lg font-medium text-ink">
            {formatMonthYear({ year: cursor.year, month: cursor.month, day: 1 }, intlLocale)}
          </h2>
          <IconButton label={s.calendar.nextMonth} onClick={() => step(1)}>
            <ChevronRight />
          </IconButton>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {s.calendar.weekdays.map((day) => (
            <div key={day} className="pb-1 text-center text-xs text-ink-faint">
              {day}
            </div>
          ))}

          {grid.flat().map((cell) => {
            const iso = toISODate(cell.date);
            const mark = marks.get(iso);
            const isSelected = iso === selectedIso;

            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(cell.date)}
                aria-current={cell.isToday ? 'date' : undefined}
                aria-label={formatDate(cell.date, 'long', intlLocale)}
                className={cn(
                  'relative flex aspect-square flex-col items-center justify-center rounded-sm text-sm transition-colors',
                  cell.inMonth ? 'text-ink' : 'text-ink-faint/50',
                  isSelected && 'bg-cinnabar/12 ring-1 ring-cinnabar',
                  !isSelected && 'hover:bg-sunk',
                  mark?.trip && !isSelected && 'bg-jade/8',
                )}
              >
                <span className={cn('tabular-nums', cell.isToday && 'font-semibold text-cinnabar')}>
                  {cell.date.day}
                </span>

                {/* Marks: a seal for together, dots for the rest. */}
                <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                  {mark?.plans ? (
                    <span className="h-1 w-1 rounded-full bg-cinnabar" aria-hidden="true" />
                  ) : null}
                  {mark?.dates ? (
                    <span className="h-1 w-1 rounded-full bg-jade" aria-hidden="true" />
                  ) : null}
                  {mark?.together ? (
                    <span
                      aria-hidden="true"
                      className="h-[5px] w-[5px] rounded-[1.5px] bg-stamp"
                      style={{ transform: 'rotate(-10deg)' }}
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        {/* --- Legend ------------------------------------------------------- */}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-rule pt-3 text-xs text-ink-faint">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-cinnabar" aria-hidden="true" />
            {s.calendar.legendPlan}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-jade" aria-hidden="true" />
            {s.calendar.legendDate}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-jade/20" aria-hidden="true" />
            {s.calendar.legendTrip}
          </span>
          {couple.intimacy_mode && (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-[6px] w-[6px] rounded-[1.5px] bg-stamp"
                style={{ transform: 'rotate(-10deg)' }}
              />
              {s.calendar.legendIntimacy}
            </span>
          )}
        </div>
      </Sheet>

      {/* --- The selected day ------------------------------------------------ */}
      <section className="mt-7">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-medium text-ink">
            {formatDate(selected, 'long', intlLocale)}
          </h2>
          <Button size="sm" onClick={() => startNew(selected)}>
            <Plus className="h-3.5 w-3.5" />
            {s.calendar.addPlan}
          </Button>
        </div>

        {selectedPlans.length === 0 && selectedDates.length === 0 ? (
          <p className="text-sm text-ink-faint">
            {s.calendar.nothingOn(formatDate(selected, 'dayMonth', intlLocale))}
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {selectedDates.map((occurrence) => (
              <li key={occurrence.source.id}>
                <Sheet className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 shrink-0 text-jade" />
                  <span className="min-w-0 flex-1 truncate text-base text-ink">
                    {occurrence.source.label}
                  </span>
                  <Tag tone="jade">{s.dateTypes[occurrence.source.type]}</Tag>
                </Sheet>
              </li>
            ))}

            {selectedPlans.map((plan) => (
              <li key={plan.id}>
                <Sheet as="article" className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h3
                        className={cn(
                          'font-display text-base font-medium',
                          plan.done ? 'text-ink-faint line-through' : 'text-ink',
                        )}
                      >
                        {plan.title}
                      </h3>
                      <Tag tone="cinnabar">{s.planKinds[plan.kind]}</Tag>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-ink-faint">
                      {plan.time_of_day && <span>{plan.time_of_day.slice(0, 5)}</span>}
                      {plan.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {plan.location}
                        </span>
                      )}
                    </p>
                    {plan.note && (
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{plan.note}</p>
                    )}
                  </div>
                  <RecordActions
                    onEdit={() => startEdit(plan)}
                    onDelete={() => void plans.remove(plan.id)}
                  />
                </Sheet>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- What's coming --------------------------------------------------- */}
      <section className="mt-9">
        <h2 className="label-kicker mb-3">{s.calendar.upcoming}</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarDays />}
            title={s.calendar.emptyTitle}
            body={s.calendar.emptyBody}
            action={
              <Button variant="primary" onClick={() => startNew(today)}>
                {s.calendar.addPlan}
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((plan) => {
              const day = parseISODate(plan.day);
              return (
                <motion.li
                  key={plan.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
                  className="flex items-center gap-3 border-b border-rule py-2.5 last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (day) {
                        setSelected(day);
                        setCursor({ year: day.year, month: day.month });
                      }
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-base text-ink">{plan.title}</span>
                    <span className="text-xs text-ink-faint">
                      {day && formatDate(day, 'medium', intlLocale)}
                      {plan.time_of_day ? ` · ${plan.time_of_day.slice(0, 5)}` : ''}
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </section>

      {/* --- Editor ----------------------------------------------------------- */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.calendar.editPlan : s.calendar.addPlan}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={saving || !draft?.title.trim()}
            >
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextField
              label={s.calendar.planTitle}
              placeholder={s.calendar.planTitlePlaceholder}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label={s.calendar.planDay}
                type="date"
                value={draft.day}
                onChange={(event) => setDraft({ ...draft, day: event.target.value })}
                required
              />
              <TextField
                label={s.calendar.planTime}
                type="time"
                value={draft.time}
                onChange={(event) => setDraft({ ...draft, time: event.target.value })}
                optional
              />
            </div>
            <SelectField
              label={s.calendar.planKind}
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as PlanKindColumn })
              }
            >
              {PLAN_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {s.planKinds[kind]}
                </option>
              ))}
            </SelectField>
            <TextField
              label={s.calendar.planLocation}
              placeholder={s.calendar.planLocationPlaceholder}
              value={draft.location}
              onChange={(event) => setDraft({ ...draft, location: event.target.value })}
              optional
            />
            <TextAreaField
              label={s.calendar.planNote}
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              rows={3}
              optional
            />
            {draft.id && (
              <Toggle
                label={s.calendar.planDone}
                checked={draft.done}
                onChange={(done) => setDraft({ ...draft, done })}
              />
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
