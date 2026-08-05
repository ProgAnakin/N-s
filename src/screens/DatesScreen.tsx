import { useMemo, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Bits';
import { SelectField, TextField, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, SectionHeading, Sheet } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import { toImportantDates } from '@/data/mappers';
import type { DateTypeColumn, ImportantDateRow } from '@/data/database.types';
import {
  defaultRecurring,
  formatDate,
  formatMonthShort,
  IMPORTANT_DATE_TYPES,
  pastOccurrences,
  upcomingOccurrences,
} from '@/lib/dates';
import { useI18n, useStrings } from '@/i18n';
import { RecordActions, useCoupleTable, useCountdown, useToday } from './shared';

interface Draft {
  id: string | null;
  label: string;
  date: string;
  type: DateTypeColumn;
  recurring: boolean;
}

function emptyDraft(): Draft {
  return { id: null, label: '', date: '', type: 'birthday', recurring: true };
}

export function DatesScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple } = useCouple();
  const today = useToday();
  const countdown = useCountdown();

  const dates = useCoupleTable('important_dates', { coupleId: couple.id, orderBy: 'date' });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const domain = useMemo(() => toImportantDates(dates.rows), [dates.rows]);
  const upcoming = useMemo(() => upcomingOccurrences(domain, today), [domain, today]);
  const past = useMemo(() => pastOccurrences(domain, today), [domain, today]);

  function startEdit(row: ImportantDateRow) {
    setDraft({
      id: row.id,
      label: row.label,
      date: row.date,
      type: row.type,
      recurring: row.recurring,
    });
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.label.trim() || !draft.date) return;

    setSaving(true);
    const values = {
      label: draft.label.trim(),
      date: draft.date,
      type: draft.type,
      recurring: draft.recurring,
    };
    if (draft.id) await dates.update(draft.id, values);
    else await dates.create({ ...values, couple_id: couple.id });
    setSaving(false);
    setDraft(null);
  }

  return (
    <div>
      <PageHeader
        kicker={s.nav.dates}
        title={s.dates.title}
        subtitle={s.dates.subtitle}
        actions={
          <Button variant="primary" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      {domain.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={s.dates.emptyTitle}
          body={s.dates.emptyBody}
          action={
            <Button variant="primary" onClick={() => setDraft(emptyDraft())}>
              {s.dates.add}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-9">
          {upcoming.length > 0 && (
            <section>
              <SectionHeading>{s.dates.upcoming}</SectionHeading>
              <ul className="flex flex-col gap-2.5">
                {upcoming.map((occurrence) => {
                  const row = dates.rows.find((candidate) => candidate.id === occurrence.source.id);
                  if (!row) return null;
                  return (
                    <li key={occurrence.source.id}>
                      <Sheet as="article" className="flex items-center gap-4">
                        <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-sm bg-cinnabar/10 text-cinnabar">
                          <span className="font-display text-lg font-medium leading-none tabular-nums">
                            {occurrence.date.day}
                          </span>
                          <span className="mt-0.5 text-[10px] uppercase tracking-wider">
                            {formatMonthShort(occurrence.date, intlLocale)}
                          </span>
                        </span>

                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-display text-base font-medium text-ink">
                            {occurrence.source.label}
                          </h3>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
                            <span>{countdown(occurrence.daysUntil)}</span>
                            {occurrence.ordinal !== null &&
                              occurrence.source.type === 'birthday' && (
                                <Tag tone="jade">{s.dates.turning(occurrence.ordinal)}</Tag>
                              )}
                            {occurrence.ordinal !== null &&
                              occurrence.source.type === 'monthiversary' && (
                                <Tag tone="jade">{s.dates.monthMark(occurrence.ordinal)}</Tag>
                              )}
                          </p>
                        </div>

                        <RecordActions
                          onEdit={() => startEdit(row)}
                          onDelete={() => void dates.remove(row.id)}
                        />
                      </Sheet>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <SectionHeading>{s.dates.past}</SectionHeading>
              <ul className="flex flex-col gap-2">
                {past.map((entry) => {
                  const row = dates.rows.find((candidate) => candidate.id === entry.id);
                  if (!row) return null;
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 border-b border-rule py-2.5 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base text-ink">{entry.label}</p>
                        <p className="text-sm text-ink-faint">
                          {formatDate(entry.date, 'long', intlLocale)}
                        </p>
                      </div>
                      <RecordActions
                        onEdit={() => startEdit(row)}
                        onDelete={() => void dates.remove(row.id)}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.dates.edit : s.dates.add}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={saving || !draft?.label.trim() || !draft?.date}
            >
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextField
              label={s.dates.label}
              placeholder={s.dates.labelPlaceholder}
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              required
            />
            <TextField
              label={s.dates.date}
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              required
            />
            <SelectField
              label={s.dates.type}
              value={draft.type}
              onChange={(event) => {
                const type = event.target.value as DateTypeColumn;
                // Switching kind resets the recurrence to whatever is sensible
                // for it, which is right far more often than it is wrong.
                setDraft({ ...draft, type, recurring: defaultRecurring(type) });
              }}
            >
              {IMPORTANT_DATE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {s.dateTypes[value]}
                </option>
              ))}
            </SelectField>
            <Toggle
              label={s.dates.recurring}
              hint={s.dates.recurringHint}
              checked={draft.recurring}
              onChange={(recurring) => setDraft({ ...draft, recurring })}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
