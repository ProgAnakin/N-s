import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Luggage, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Bits';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, SectionHeading, Sheet } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import { toExpenses } from '@/data/mappers';
import type { CurrencyColumn, TripRow } from '@/data/database.types';
import { compareDates, daysBetween, parseISODate } from '@/lib/calendar';
import { formatDate } from '@/lib/dates';
import { centsToInputValue, CURRENCIES, CURRENCY_SYMBOLS, parseAmountToCents, tripSpend } from '@/lib/money';
import { budgetStatus, checklistProgress } from '@/lib/progress';
import { useI18n, useStrings } from '@/i18n';
import { RecordActions, useCoupleTable, useMoney, useToday } from './shared';

interface Draft {
  id: string | null;
  destination: string;
  startDate: string;
  endDate: string;
  budget: string;
  currency: CurrencyColumn;
  notes: string;
}

export function TripsScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple } = useCouple();
  const today = useToday();
  const money = useMoney();

  const trips = useCoupleTable('trips', {
    coupleId: couple.id,
    orderBy: 'start_date',
    ascending: false,
  });
  const items = useCoupleTable('trip_items', { coupleId: couple.id, orderBy: 'sort_order', ascending: true });
  const expenses = useCoupleTable('expenses', { coupleId: couple.id, orderBy: 'date' });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  // A trip counts as past once its end date (or start, if open-ended) has gone.
  const isPast = (trip: TripRow) => {
    const end = parseISODate(trip.end_date) ?? parseISODate(trip.start_date);
    return end !== null && compareDates(end, today) < 0;
  };
  const upcoming = trips.rows.filter((trip) => !isPast(trip));
  const past = trips.rows.filter(isPast);

  function startNew() {
    setDraft({
      id: null,
      destination: '',
      startDate: '',
      endDate: '',
      budget: '',
      currency: couple.currency,
      notes: '',
    });
  }

  function startEdit(trip: TripRow) {
    setDraft({
      id: trip.id,
      destination: trip.destination,
      startDate: trip.start_date ?? '',
      endDate: trip.end_date ?? '',
      budget: trip.budget_total_cents === null ? '' : centsToInputValue(trip.budget_total_cents),
      currency: trip.currency,
      notes: trip.notes ?? '',
    });
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.destination.trim()) return;

    setSaving(true);
    const values = {
      destination: draft.destination.trim(),
      start_date: draft.startDate || null,
      end_date: draft.endDate || null,
      budget_total_cents: draft.budget.trim() ? parseAmountToCents(draft.budget) : null,
      currency: draft.currency,
      notes: draft.notes.trim() || null,
    };
    if (draft.id) await trips.update(draft.id, values);
    else await trips.create({ ...values, couple_id: couple.id });
    setSaving(false);
    setDraft(null);
  }

  function renderTrip(trip: TripRow) {
    const start = parseISODate(trip.start_date);
    const end = parseISODate(trip.end_date);
    const nights = start && end ? Math.max(0, daysBetween(start, end)) : null;

    const tripItems = items.rows.filter((item) => item.trip_id === trip.id);
    const checklist = checklistProgress(tripItems);
    const spent = tripSpend(toExpenses(expenses.rows), trip.id, trip.currency);
    const budget = budgetStatus(spent, trip.budget_total_cents);

    return (
      <li key={trip.id}>
        <Sheet as="article" className="p-4">
          <div className="flex items-start justify-between gap-3">
            <Link to={`/trips/${trip.id}`} className="group min-w-0 flex-1">
              <h3 className="flex items-center gap-1.5 font-display text-lg font-medium text-ink">
                <span className="truncate">{trip.destination}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
              </h3>
              <p className="mt-0.5 text-sm text-ink-soft">
                {start && formatDate(start, 'medium', intlLocale)}
                {end && start && ' — '}
                {end && formatDate(end, 'medium', intlLocale)}
                {nights !== null && ` · ${s.trips.nights(nights)}`}
              </p>
            </Link>
            <RecordActions
              onEdit={() => startEdit(trip)}
              onDelete={() => void trips.remove(trip.id)}
            />
          </div>

          {(tripItems.length > 0 || trip.budget_total_cents !== null) && (
            <div className="mt-4 flex flex-col gap-3">
              {tripItems.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-ink-faint">
                    {s.trips.progress(checklist.done, checklist.total)}
                  </p>
                  <ProgressBar percent={checklist.percent} tone="jade" />
                </div>
              )}
              {trip.budget_total_cents !== null && (
                <div className="flex flex-col gap-1.5">
                  <p className="flex justify-between text-xs text-ink-faint">
                    <span>
                      {s.trips.budgetSpent(
                        money(budget.spentCents, trip.currency, true),
                        money(budget.budgetCents, trip.currency, true),
                      )}
                    </span>
                    <span className={budget.over ? 'text-cinnabar' : undefined}>
                      {budget.over
                        ? s.trips.budgetOver(money(-budget.remainingCents, trip.currency, true))
                        : s.trips.budgetLeft(money(budget.remainingCents, trip.currency, true))}
                    </span>
                  </p>
                  <ProgressBar percent={budget.percent} tone="cinnabar" />
                </div>
              )}
            </div>
          )}
        </Sheet>
      </li>
    );
  }

  return (
    <div>
      <PageHeader
        kicker={s.nav.trips}
        title={s.trips.title}
        subtitle={s.trips.subtitle}
        actions={
          <Button variant="primary" onClick={startNew}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      {trips.rows.length === 0 ? (
        <EmptyState
          icon={<Luggage />}
          title={s.trips.emptyTitle}
          body={s.trips.emptyBody}
          action={
            <Button variant="primary" onClick={startNew}>
              {s.trips.add}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-9">
          {upcoming.length > 0 && (
            <section>
              <SectionHeading>{s.trips.upcoming}</SectionHeading>
              <ul className="flex flex-col gap-3">{upcoming.map(renderTrip)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <SectionHeading>{s.trips.pastTrips}</SectionHeading>
              <ul className="flex flex-col gap-3">{past.map(renderTrip)}</ul>
            </section>
          )}
        </div>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.trips.edit : s.trips.add}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={saving || !draft?.destination.trim()}
            >
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextField
              label={s.trips.destination}
              placeholder={s.trips.destinationPlaceholder}
              value={draft.destination}
              onChange={(event) => setDraft({ ...draft, destination: event.target.value })}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label={s.trips.startDate}
                type="date"
                value={draft.startDate}
                onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
                optional
              />
              <TextField
                label={s.trips.endDate}
                type="date"
                value={draft.endDate}
                min={draft.startDate || undefined}
                onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
                optional
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <TextField
                label={s.trips.budget}
                inputMode="decimal"
                placeholder="0.00"
                value={draft.budget}
                onChange={(event) => setDraft({ ...draft, budget: event.target.value })}
                hint={s.trips.budgetHint}
                optional
              />
              <SelectField
                label={s.spending.currency}
                value={draft.currency}
                onChange={(event) =>
                  setDraft({ ...draft, currency: event.target.value as CurrencyColumn })
                }
                className="w-28"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {CURRENCY_SYMBOLS[code]} {code}
                  </option>
                ))}
              </SelectField>
            </div>
            <TextAreaField
              label={s.trips.notes}
              placeholder={s.trips.notesPlaceholder}
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              rows={3}
              optional
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
