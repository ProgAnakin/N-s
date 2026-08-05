import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Plus, Sparkles } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Bits';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, Sheet } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import type { IntimacyEntryRow, IntimacyKindColumn } from '@/data/database.types';
import { parseISODate, toISODate } from '@/lib/calendar';
import { formatDate, formatMonthYear } from '@/lib/dates';
import { INTIMACY_KINDS, summarise, type IntimacyEntry } from '@/lib/intimacy';
import { useI18n, useStrings } from '@/i18n';
import { RecordActions, useCoupleTable, useToday } from './shared';

interface Draft {
  id: string | null;
  date: string;
  kind: IntimacyKindColumn;
  place: string;
  note: string;
}

/**
 * The together log.
 *
 * Deliberately not built like a habit tracker. There is no goal, no streak
 * to protect, no "you're below average this month" — a count of intimacy is
 * the easiest number in the world to turn into pressure, and pressure is the
 * one thing guaranteed to make it worse.
 *
 * So what it shows is memory rather than performance: how many, where,
 * when — the things that are pleasant to look back on.
 */
export function TogetherScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple, profile } = useCouple();
  const today = useToday();

  const entries = useCoupleTable('intimacy_entries', {
    coupleId: couple.id,
    orderBy: 'date',
    ascending: false,
    enabled: couple.intimacy_mode,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const domain = useMemo<IntimacyEntry[]>(() => {
    const result: IntimacyEntry[] = [];
    for (const row of entries.rows) {
      const date = parseISODate(row.date);
      if (!date) continue;
      result.push({ id: row.id, date, kind: row.kind, place: row.place });
    }
    return result;
  }, [entries.rows]);

  const summary = useMemo(() => summarise(domain, today), [domain, today]);
  const busiestMonth = Math.max(1, ...summary.byMonth.map((month) => month.count));

  // The whole feature stays out of the way until it is asked for.
  if (!couple.intimacy_mode) {
    return (
      <div>
        <PageHeader kicker={s.nav.together} title={s.together.title} />
        <EmptyState
          icon={<Sparkles />}
          title={s.together.disabledTitle}
          body={s.together.disabledBody}
          action={<ButtonLink to="/settings" variant="primary">{s.nav.settings}</ButtonLink>}
        />
      </div>
    );
  }

  function startNew() {
    setDraft({ id: null, date: toISODate(today), kind: 'sex', place: '', note: '' });
  }

  function startEdit(row: IntimacyEntryRow) {
    setDraft({
      id: row.id,
      date: row.date,
      kind: row.kind,
      place: row.place ?? '',
      note: row.note ?? '',
    });
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.date) return;

    setSaving(true);
    const values = {
      date: draft.date,
      kind: draft.kind,
      place: draft.place.trim() || null,
      note: draft.note.trim() || null,
    };
    if (draft.id) await entries.update(draft.id, values);
    else await entries.create({ ...values, couple_id: couple.id, created_by: profile.id });
    setSaving(false);
    setDraft(null);
  }

  return (
    <div>
      <PageHeader
        kicker={s.nav.together}
        title={s.together.title}
        subtitle={s.together.intro}
        actions={
          <Button variant="primary" onClick={startNew}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      <p className="mb-7 flex items-start gap-2 rounded-sm bg-sunk px-3 py-2.5 text-sm leading-relaxed text-ink-soft">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {s.together.privacyNote}
      </p>

      {domain.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title={s.together.emptyTitle}
          body={s.together.emptyBody}
          action={
            <Button variant="primary" onClick={startNew}>
              {s.together.add}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-9">
          {/* --- The numbers, stated plainly and without a target ----------- */}
          <section>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure value={summary.total} label={s.together.total} />
              <Figure value={summary.thisMonth} label={s.together.thisMonth} />
              <Figure value={summary.lastThirtyDays} label={s.together.lastThirty} />
              <Figure
                value={summary.daysSinceLast === null ? '—' : s.together.daysSince(summary.daysSinceLast)}
                label={s.together.daysSinceLabel}
                small
              />
            </div>
          </section>

          {/* --- Month by month --------------------------------------------- */}
          {summary.byMonth.length > 1 && (
            <section>
              <h2 className="label-kicker mb-3">{s.together.byMonth}</h2>
              <Sheet className="p-4">
                <div className="flex h-28 items-end gap-1.5">
                  {summary.byMonth.slice(-12).map((month) => (
                    <div key={month.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                      <div
                        className="w-full rounded-sm bg-stamp/80"
                        style={{ height: `${Math.max(4, (month.count / busiestMonth) * 100)}%` }}
                        title={`${month.count}`}
                      />
                      <span className="truncate text-[10px] text-ink-faint">
                        {formatMonthYear({ year: month.year, month: month.month, day: 1 }, intlLocale)
                          .split(' ')[0]
                          ?.slice(0, 3)}
                      </span>
                    </div>
                  ))}
                </div>
              </Sheet>
            </section>
          )}

          {/* --- What and where ---------------------------------------------- */}
          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h2 className="label-kicker mb-3">{s.together.byKind}</h2>
              <ul className="flex flex-col gap-2">
                {summary.byKind.map((entry) => (
                  <li key={entry.kind} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-sm text-ink-soft">
                      {s.intimacyKinds[entry.kind]}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunk">
                      <span
                        className="block h-full rounded-full bg-stamp/70"
                        style={{ width: `${(entry.count / summary.total) * 100}%` }}
                      />
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-ink-faint">
                      {entry.count}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {summary.places.length > 0 && (
              <section>
                <h2 className="label-kicker mb-3">{s.together.places}</h2>
                <ul className="flex flex-col gap-1.5">
                  {summary.places.slice(0, 8).map((place) => (
                    <li key={place.place} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-ink">{place.place}</span>
                      <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                        {s.together.countOf(place.count)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* --- History ------------------------------------------------------ */}
          <section>
            <h2 className="label-kicker mb-3">{s.together.history}</h2>
            <ul className="flex flex-col">
              {entries.rows.map((row) => {
                const date = parseISODate(row.date);
                return (
                  <li
                    key={row.id}
                    className="flex items-start gap-3 border-b border-rule py-3 last:border-0"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-[2px] bg-stamp"
                      style={{ transform: 'rotate(-10deg)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-base text-ink">
                        <span>{date && formatDate(date, 'medium', intlLocale)}</span>
                        <Tag>{s.intimacyKinds[row.kind]}</Tag>
                      </p>
                      {row.place && <p className="mt-0.5 text-sm text-ink-soft">{row.place}</p>}
                      {row.note && (
                        <p className="mt-1 text-sm leading-relaxed text-ink-faint">{row.note}</p>
                      )}
                    </div>
                    <RecordActions
                      onEdit={() => startEdit(row)}
                      onDelete={() => void entries.remove(row.id)}
                    />
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-ink-faint">
              <Link to="/calendar" className="underline-offset-4 hover:text-ink hover:underline">
                {s.nav.calendar}
              </Link>
            </p>
          </section>
        </div>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.together.edit : s.together.add}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button variant="primary" onClick={() => void onSubmit()} disabled={saving}>
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextField
              label={s.together.date}
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              required
            />
            <SelectField
              label={s.together.kind}
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as IntimacyKindColumn })
              }
            >
              {INTIMACY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {s.intimacyKinds[kind]}
                </option>
              ))}
            </SelectField>
            <TextField
              label={s.together.place}
              placeholder={s.together.placePlaceholder}
              value={draft.place}
              onChange={(event) => setDraft({ ...draft, place: event.target.value })}
              optional
            />
            <TextAreaField
              label={s.together.note}
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              rows={3}
              optional
            />
          </form>
        )}
      </Modal>
    </div>
  );
}

function Figure({
  value,
  label,
  small = false,
}: {
  value: number | string;
  label: string;
  small?: boolean;
}) {
  return (
    <Sheet className="p-3">
      <p
        className={
          small
            ? 'display-warm truncate font-display text-lg font-medium text-ink'
            : 'display-warm font-display text-2xl font-medium tabular-nums text-ink'
        }
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-faint">{label}</p>
    </Sheet>
  );
}
