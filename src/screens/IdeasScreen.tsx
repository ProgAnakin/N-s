import { useMemo, useState } from 'react';
import { m } from 'framer-motion';
import {
  CalendarPlus,
  Check,
  Clock,
  CloudRain,
  Compass,
  Lightbulb,
  Plus,
  Star,
  Ticket,
  Umbrella,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorNote, Tag } from '@/components/ui/Bits';
import { ChoiceField, SelectField, TextAreaField, TextField, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, Sheet } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import type {
  BookingColumn,
  CostColumn,
  DateIdeaRow,
  FeelingColumn,
  TimeOfDayColumn,
} from '@/data/database.types';
import { parseISODate, toISODate } from '@/lib/calendar';
import { formatDate } from '@/lib/dates';
import {
  BOOKINGS,
  COSTS,
  FEELINGS,
  TIMES,
  bookBy,
  daysSinceDone,
  shortlist,
  timeOfDayAt,
  untriedCount,
  type DateIdea,
  type Mismatch,
} from '@/lib/dateideas';
import { useI18n, useStrings } from '@/i18n';
import { RecordActions, useCoupleTable, useToday } from './shared';
import { cn } from '@/utils/cn';

/**
 * The shelf of things to do.
 *
 * Not a list. A list is what every couple already has, in a notes app, and
 * it fails at exactly the moment it is needed: seven o'clock on a Friday,
 * one of you tired, raining, payday on Tuesday. Twenty undifferentiated
 * lines answer none of that.
 *
 * So the filter is the feature and it sits at the top, pre-set to the time
 * of day it actually is — and everything it sets aside is counted and can
 * be shown, because a filter that silently drops sixteen of twenty ideas
 * teaches you not to trust the shelf.
 *
 * Nothing here is attributed to one of you. An idea knows who wrote it
 * down and the screen never says, because "you added 12, they added 3" is
 * a scoreboard, and this app does not keep those.
 */

interface Draft {
  id: string | null;
  title: string;
  note: string;
  cost: CostColumn;
  times: TimeOfDayColumn[];
  feeling: FeelingColumn;
  bring: string;
  booking: BookingColumn;
  bookDaysAhead: string;
  outdoors: boolean;
  minutes: string;
}

function emptyDraft(): Draft {
  return {
    id: null,
    title: '',
    note: '',
    cost: 'modest',
    times: [],
    feeling: 'easy',
    bring: '',
    booking: 'none',
    bookDaysAhead: '',
    outdoors: false,
    minutes: '',
  };
}

/** The row shape the pure module wants, which is not quite the row shape. */
function toIdea(row: DateIdeaRow): DateIdea {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    cost: row.cost,
    typicalCents: row.typical_cents,
    times: row.times ?? [],
    feeling: row.feeling,
    bring: row.bring,
    booking: row.booking,
    bookDaysAhead: row.book_days_ahead,
    outdoors: row.outdoors,
    minutes: row.minutes,
    favourite: row.favourite,
    lastDoneOn: parseISODate(row.last_done_on),
    doneCount: row.done_count,
  };
}

export function IdeasScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple, profile } = useCouple();
  const today = useToday();

  const ideas = useCoupleTable('date_ideas', { coupleId: couple.id, orderBy: 'created_at' });
  const plans = useCoupleTable('plans', { coupleId: couple.id, orderBy: 'day' });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [planning, setPlanning] = useState<DateIdeaRow | null>(null);
  const [planDay, setPlanDay] = useState('');
  const [showSetAside, setShowSetAside] = useState(false);

  // The filter, pre-set to now. Somebody opening this at eight in the
  // evening is asking about the evening; making them say so first is a
  // step between them and the answer.
  const [forDay, setForDay] = useState(() => toISODate(today));
  const [budget, setBudget] = useState<CostColumn | ''>('');
  const [time, setTime] = useState<TimeOfDayColumn | ''>(() => timeOfDayAt(new Date().getHours()));
  const [feeling, setFeeling] = useState<FeelingColumn | ''>('');
  const [wet, setWet] = useState(false);

  const domain = useMemo(() => ideas.rows.map(toIdea), [ideas.rows]);
  const day = parseISODate(forDay) ?? today;

  const result = useMemo(
    () =>
      shortlist(domain, {
        date: day,
        today,
        budget: budget || null,
        time: time || null,
        feeling: feeling || null,
        wet,
      }),
    [domain, day, today, budget, time, feeling, wet],
  );

  const filtered = Boolean(budget || time || feeling || wet);
  const rowsById = useMemo(
    () => new Map(ideas.rows.map((row) => [row.id, row])),
    [ideas.rows],
  );
  const plannedIdeas = useMemo(() => {
    const byIdea = new Map<string, string>();
    for (const plan of plans.rows) {
      if (plan.idea_id && !plan.done) byIdea.set(plan.idea_id, plan.day);
    }
    return byIdea;
  }, [plans.rows]);

  function startEdit(row: DateIdeaRow) {
    setDraft({
      id: row.id,
      title: row.title,
      note: row.note ?? '',
      cost: row.cost,
      times: row.times ?? [],
      feeling: row.feeling,
      bring: row.bring ?? '',
      booking: row.booking,
      bookDaysAhead: row.book_days_ahead == null ? '' : String(row.book_days_ahead),
      outdoors: row.outdoors,
      minutes: row.minutes == null ? '' : String(row.minutes),
    });
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.title.trim()) return;

    setSaving(true);
    const values = {
      title: draft.title.trim(),
      note: draft.note.trim() || null,
      cost: draft.cost,
      times: draft.times,
      feeling: draft.feeling,
      bring: draft.bring.trim() || null,
      booking: draft.booking,
      // A lead time on something that needs no booking is noise that would
      // later show up as a "book by" date on a thing you just turn up to.
      book_days_ahead:
        draft.booking === 'none' ? null : numberOrNull(draft.bookDaysAhead, 0, 365),
      outdoors: draft.outdoors,
      minutes: numberOrNull(draft.minutes, 5, 2880),
    };

    if (draft.id) await ideas.update(draft.id, values);
    else await ideas.create({ ...values, couple_id: couple.id, created_by: profile.id });
    setSaving(false);
    setDraft(null);
  }

  /**
   * Doing it moves the idea down the shelf rather than off it.
   *
   * Deleting a good evening because you have had it is the wrong model —
   * the whole point of a shelf is that the good ones come round again. So
   * the count goes up, the date is recorded, and the ordering does the
   * rest.
   */
  async function markDone(row: DateIdeaRow) {
    await ideas.update(row.id, {
      done_count: row.done_count + 1,
      last_done_on: toISODate(today),
    });
  }

  async function onPlan() {
    if (!planning || !planDay) return;
    await plans.create({
      couple_id: couple.id,
      title: planning.title,
      day: planDay,
      kind: 'date',
      note: planning.note,
      location: null,
      idea_id: planning.id,
      created_by: profile.id,
    });
    setPlanning(null);
    setPlanDay('');
  }

  const untried = untriedCount(domain);

  return (
    <div>
      <PageHeader
        kicker={s.nav.ideas}
        title={s.ideas.title}
        subtitle={s.ideas.subtitle}
        actions={
          <Button variant="primary" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      {ideas.error && (
        <div className="mb-4">
          <ErrorNote>{ideas.error}</ErrorNote>
        </div>
      )}

      {domain.length === 0 ? (
        <EmptyState
          icon={<Lightbulb />}
          title={s.ideas.emptyTitle}
          body={s.ideas.emptyBody}
          action={
            <Button variant="primary" onClick={() => setDraft(emptyDraft())}>
              {s.ideas.add}
            </Button>
          }
        />
      ) : (
        <>
          {/* --- What fits tonight ---------------------------------------- */}
          <Sheet className="mb-7 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="label-kicker">{s.ideas.tonight}</h2>
              {untried > 0 && <span className="text-xs text-ink-faint">{s.ideas.untried(untried)}</span>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TextField
                label={s.ideas.forDay}
                type="date"
                value={forDay}
                onChange={(event) => setForDay(event.target.value)}
              />
              <SelectField
                label={s.ideas.cost}
                value={budget}
                onChange={(event) => setBudget(event.target.value as CostColumn | '')}
              >
                <option value="">{s.ideas.anyBudget}</option>
                {COSTS.map((value) => (
                  <option key={value} value={value}>
                    {s.ideas.costs[value]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={s.ideas.times}
                value={time}
                onChange={(event) => setTime(event.target.value as TimeOfDayColumn | '')}
              >
                <option value="">{s.ideas.anyTime}</option>
                {TIMES.filter((value) => value !== 'allday').map((value) => (
                  <option key={value} value={value}>
                    {s.ideas.timesOf[value]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={s.ideas.feeling}
                value={feeling}
                onChange={(event) => setFeeling(event.target.value as FeelingColumn | '')}
              >
                <option value="">{s.ideas.anyFeeling}</option>
                {FEELINGS.map((value) => (
                  <option key={value} value={value}>
                    {s.ideas.feelings[value]}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                aria-pressed={wet}
                onClick={() => setWet((current) => !current)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors',
                  wet ? 'bg-stamp text-on-stamp' : 'text-ink-faint hover:bg-sunk hover:text-ink',
                )}
              >
                <CloudRain className="h-3.5 w-3.5" />
                {s.ideas.wet}
              </button>

              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    setBudget('');
                    setTime('');
                    setFeeling('');
                    setWet(false);
                  }}
                  className="rounded-sm text-xs text-cinnabar underline-offset-4 hover:underline"
                >
                  {s.ideas.clearFilters}
                </button>
              )}

              <span className="ml-auto flex items-center gap-2 text-xs text-ink-faint">
                <Tag>{s.ideas.fitCount(result.fits.length)}</Tag>
                {result.setAside.length > 0 && (
                  <span>{s.ideas.setAside(result.setAside.length)}</span>
                )}
              </span>
            </div>

            {/* The one loosening worth offering. Naming it turns a dead end
                back into a choice. */}
            {result.loosen && (
              <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                {s.ideas.loosen[result.loosen.reason](result.loosen.count)}
              </p>
            )}
          </Sheet>

          {/* --- What fits ------------------------------------------------ */}
          {result.fits.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {result.fits.map((idea, index) => {
                const row = rowsById.get(idea.id);
                if (!row) return null;
                return (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    index={index}
                    locale={intlLocale}
                    day={day}
                    plannedFor={plannedIdeas.get(idea.id) ?? null}
                    onEdit={() => startEdit(row)}
                    onDelete={() => void ideas.remove(row.id)}
                    onFavourite={() => void ideas.update(row.id, { favourite: !row.favourite })}
                    onPlan={() => {
                      setPlanning(row);
                      setPlanDay(forDay);
                    }}
                    onDone={() => void markDone(row)}
                  />
                );
              })}
            </ul>
          ) : (
            <p className="rounded-sm bg-sunk px-4 py-6 text-center text-sm text-ink-soft">
              {s.common.noResults}
            </p>
          )}

          {/* --- And what was set aside ----------------------------------- */}
          {result.setAside.length > 0 && (
            <section className="mt-9">
              <button
                type="button"
                onClick={() => setShowSetAside((current) => !current)}
                aria-expanded={showSetAside}
                className="rounded-sm text-sm text-cinnabar underline-offset-4 hover:underline"
              >
                {showSetAside ? s.ideas.hideSetAside : s.ideas.showSetAside}
              </button>

              {showSetAside && (
                <ul className="mt-4 flex flex-col gap-2">
                  {result.setAside.map(({ idea, misses }) => (
                    <li
                      key={idea.id}
                      className="flex items-center gap-3 border-b border-rule py-2.5 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink-soft">{idea.title}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-ink-faint">
                          {misses.map((miss: Mismatch) => (
                            <span key={miss}>{s.ideas.missReasons[miss]}</span>
                          ))}
                        </p>
                      </div>
                      <RecordActions
                        onEdit={() => {
                          const row = rowsById.get(idea.id);
                          if (row) startEdit(row);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {/* --- Add / edit ------------------------------------------------- */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.ideas.edit : s.ideas.add}
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
              label={s.ideas.ideaTitle}
              placeholder={s.ideas.titlePlaceholder}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              required
            />

            <ChoiceField
              label={s.ideas.cost}
              hint={s.ideas.costHint}
              value={draft.cost}
              onChange={(cost) => setDraft({ ...draft, cost })}
              options={COSTS.map((value) => ({ value, label: s.ideas.costs[value] }))}
            />

            <ChoiceField
              label={s.ideas.feeling}
              hint={s.ideas.feelingHint}
              value={draft.feeling}
              onChange={(feelingValue) => setDraft({ ...draft, feeling: feelingValue })}
              options={FEELINGS.map((value) => ({ value, label: s.ideas.feelings[value] }))}
            />

            {/* Several, not one. Plenty of things are good at more than one
                hour and bad at the rest, and a single choice would force a
                claim nobody means. */}
            <fieldset>
              <legend className="text-sm font-medium text-ink">{s.ideas.times}</legend>
              <p className="mt-0.5 text-xs text-ink-faint">{s.ideas.timesHint}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TIMES.map((value) => {
                  const on = draft.times.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          times: on
                            ? draft.times.filter((entry) => entry !== value)
                            : [...draft.times, value],
                        })
                      }
                      className={cn(
                        'rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors',
                        on
                          ? 'border-transparent bg-stamp text-on-stamp'
                          : 'border-rule text-ink-soft hover:border-ink-faint hover:text-ink',
                      )}
                    >
                      {s.ideas.timesOf[value]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <SelectField
              label={s.ideas.booking}
              value={draft.booking}
              onChange={(event) =>
                setDraft({ ...draft, booking: event.target.value as BookingColumn })
              }
            >
              {BOOKINGS.map((value) => (
                <option key={value} value={value}>
                  {s.ideas.bookings[value]}
                </option>
              ))}
            </SelectField>

            {draft.booking !== 'none' && (
              <TextField
                label={s.ideas.bookDaysAhead}
                hint={s.ideas.bookDaysAheadHint}
                type="number"
                min={0}
                max={365}
                value={draft.bookDaysAhead}
                onChange={(event) => setDraft({ ...draft, bookDaysAhead: event.target.value })}
                optional
              />
            )}

            <TextField
              label={s.ideas.minutes}
              hint={s.ideas.minutesHint}
              type="number"
              min={5}
              max={2880}
              value={draft.minutes}
              onChange={(event) => setDraft({ ...draft, minutes: event.target.value })}
              optional
            />

            <TextField
              label={s.ideas.bring}
              placeholder={s.ideas.bringPlaceholder}
              value={draft.bring}
              onChange={(event) => setDraft({ ...draft, bring: event.target.value })}
              optional
            />

            <Toggle
              label={s.ideas.outdoors}
              hint={s.ideas.outdoorsHint}
              checked={draft.outdoors}
              onChange={(outdoors) => setDraft({ ...draft, outdoors })}
            />

            <TextAreaField
              label={s.ideas.note}
              placeholder={s.ideas.notePlaceholder}
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              rows={3}
              optional
            />
          </form>
        )}
      </Modal>

      {/* --- Into the calendar ------------------------------------------ */}
      <Modal
        open={planning !== null}
        onClose={() => setPlanning(null)}
        title={s.ideas.planTitle}
        description={planning?.title}
        footer={
          <>
            <Button onClick={() => setPlanning(null)}>{s.common.cancel}</Button>
            <Button variant="primary" onClick={() => void onPlan()} disabled={!planDay}>
              {s.ideas.plan}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextField
            label={s.ideas.planDay}
            type="date"
            value={planDay}
            onChange={(event) => setPlanDay(event.target.value)}
            required
          />
          {planning && bookByLabel(planning, planDay, intlLocale, s.ideas.bookBy)}
        </div>
      </Modal>
    </div>
  );
}

/** The "book by" line, only when there is one to give. */
function bookByLabel(
  row: DateIdeaRow,
  planDay: string,
  locale: string,
  format: (date: string) => string,
) {
  const date = parseISODate(planDay);
  if (!date) return null;
  const by = bookBy(toIdea(row), date);
  if (!by) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-soft">
      <Ticket className="h-3.5 w-3.5" />
      {format(formatDate(by, 'medium', locale))}
    </p>
  );
}

function numberOrNull(value: string, min: number, max: number): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

/**
 * One idea.
 *
 * The card leads with the two facts that decide whether you do it — what
 * it costs and how it feels — rather than with the title alone, because
 * the title is the part you already half-remember.
 */
function IdeaCard({
  idea,
  index,
  locale,
  day,
  plannedFor,
  onEdit,
  onDelete,
  onFavourite,
  onPlan,
  onDone,
}: {
  idea: DateIdea;
  index: number;
  locale: string;
  day: { year: number; month: number; day: number };
  plannedFor: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onFavourite: () => void;
  onPlan: () => void;
  onDone: () => void;
}) {
  const s = useStrings();
  const since = daysSinceDone(idea, day);
  const by = bookBy(idea, day);

  return (
    <m.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.03, ease: [0.2, 0.7, 0.3, 1] }}
    >
      <Sheet as="article" className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Tag tone={idea.cost === 'splash' ? 'cinnabar' : 'jade'}>
                {s.ideas.costs[idea.cost]}
              </Tag>
              <Tag>{s.ideas.feelings[idea.feeling]}</Tag>
              {/* Labelled, not icon-only. An umbrella on its own is a
                  guess for a sighted reader and nothing at all for
                  anybody using a screen reader. */}
              {idea.outdoors && (
                <Tag>
                  <Umbrella className="h-3 w-3" />
                  {s.ideas.outdoorsShort}
                </Tag>
              )}
            </div>
            <h3 className="text-pretty font-display text-base font-medium leading-snug text-ink">
              {idea.title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onFavourite}
            aria-pressed={idea.favourite}
            aria-label={idea.favourite ? s.ideas.unmarkFavourite : s.ideas.markFavourite}
            className={cn(
              'shrink-0 rounded-sm p-1 transition-colors',
              idea.favourite
                ? 'text-cinnabar'
                : 'text-ink-faint/50 hover:bg-sunk hover:text-ink-faint',
            )}
          >
            <Star className={cn('h-4 w-4', idea.favourite && 'fill-current')} />
          </button>
        </div>

        {idea.note && (
          <p className="text-pretty text-sm leading-relaxed text-ink-soft">{idea.note}</p>
        )}

        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-faint">
          {idea.times.length > 0 && (
            <li className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {idea.times.map((value) => s.ideas.timesOf[value]).join(' · ')}
            </li>
          )}
          {idea.minutes != null && <li>{s.ideas.minutesShort(idea.minutes)}</li>}
          {idea.booking !== 'none' && (
            <li className="flex items-center gap-1">
              <Ticket className="h-3 w-3" />
              {by
                ? s.ideas.bookBy(formatDate(by, 'medium', locale))
                : s.ideas.bookings[idea.booking]}
            </li>
          )}
          {idea.bring && (
            <li className="flex items-center gap-1">
              <Compass className="h-3 w-3" />
              {idea.bring}
            </li>
          )}
        </ul>

        <p className="text-[11px] text-ink-faint">
          {idea.doneCount === 0
            ? s.ideas.never
            : since === null
              ? s.ideas.doneTimes(idea.doneCount)
              : s.ideas.lastTime(since)}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {plannedFor ? (
            <Tag tone="jade">
              <CalendarPlus className="h-3 w-3" />
              {s.ideas.planned(
                formatDate(parseISODate(plannedFor) ?? day, 'dayMonth', locale),
              )}
            </Tag>
          ) : (
            <button
              type="button"
              onClick={onPlan}
              className="inline-flex items-center gap-1.5 rounded-sm border border-rule px-2.5 py-1.5 text-xs text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              {s.ideas.plan}
            </button>
          )}

          <button
            type="button"
            onClick={onDone}
            title={s.ideas.markDoneHint}
            className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-ink-faint transition-colors hover:bg-sunk hover:text-ink"
          >
            <Check className="h-3.5 w-3.5" />
            {s.ideas.markDone}
          </button>

          <span className="ml-auto">
            <RecordActions onEdit={onEdit} onDelete={onDelete} />
          </span>
        </div>
      </Sheet>
    </m.li>
  );
}
