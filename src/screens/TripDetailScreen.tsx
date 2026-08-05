import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, FileText, Paperclip, Plane, Plus, Ticket, X } from 'lucide-react';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { ErrorNote, LoadingBlock, ProgressBar, Spinner, Tag } from '@/components/ui/Bits';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, Sheet } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import { useTable } from '@/data/useTable';
import { toExpenses } from '@/data/mappers';
import { removeMedia, signedUrlFor, uploadMedia, UploadError } from '@/data/storage';
import type { TripItemRow, TripItemTypeColumn } from '@/data/database.types';
import { addDays, daysBetween, parseISODate, toISODate, type CalendarDate } from '@/lib/calendar';
import { formatDate } from '@/lib/dates';
import { tripSpend } from '@/lib/money';
import { budgetStatus, checklistProgress } from '@/lib/progress';
import { useI18n, useStrings } from '@/i18n';
import { RecordActions, useCoupleTable, useMoney } from './shared';

const ITEM_TYPES: readonly TripItemTypeColumn[] = ['flight', 'stay', 'activity', 'doc'];

const TYPE_ICONS: Record<TripItemTypeColumn, typeof Plane> = {
  flight: Plane,
  stay: Ticket,
  activity: Check,
  doc: FileText,
};

interface Draft {
  id: string | null;
  type: TripItemTypeColumn;
  title: string;
  day: string;
  time: string;
  note: string;
  attachmentPath: string | null;
}

/**
 * One trip: the budget, and the plan day by day.
 *
 * Items with a day land in the itinerary under that day; items without one sit
 * in a holding area at the end, because a flight you have not booked yet still
 * needs to be on the list.
 */
export function TripDetailScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple } = useCouple();
  const { tripId } = useParams<{ tripId: string }>();
  const money = useMoney();

  const trips = useCoupleTable('trips', { coupleId: couple.id, orderBy: 'start_date' });
  const items = useTable('trip_items', {
    column: 'trip_id',
    value: tripId,
    orderBy: 'day',
    ascending: true,
    thenBy: 'sort_order',
  });
  const expenses = useCoupleTable('expenses', { coupleId: couple.id, orderBy: 'date' });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const trip = trips.rows.find((candidate) => candidate.id === tripId);

  /** Every day of the trip, so the itinerary has a row per day. */
  const days = useMemo<CalendarDate[]>(() => {
    if (!trip) return [];
    const start = parseISODate(trip.start_date);
    if (!start) return [];
    const end = parseISODate(trip.end_date);
    const span = end ? Math.max(0, daysBetween(start, end)) : 0;
    return Array.from({ length: span + 1 }, (_, offset) => addDays(start, offset));
  }, [trip]);

  if (trips.loading && !trip) return <LoadingBlock />;

  if (!trip) {
    return (
      <div>
        <PageHeader kicker={s.nav.trips} title={s.errors.notFound} />
        <ButtonLink to="/trips">{s.common.back}</ButtonLink>
      </div>
    );
  }

  const checklist = checklistProgress(items.rows);
  const spent = tripSpend(toExpenses(expenses.rows), trip.id, trip.currency);
  const budget = budgetStatus(spent, trip.budget_total_cents);
  const linkedExpenses = expenses.rows.filter((row) => row.trip_id === trip.id);

  const scheduled = items.rows.filter((item) => item.day !== null);
  const unscheduled = items.rows.filter((item) => item.day === null);

  function startNew() {
    setDraft({
      id: null,
      type: 'activity',
      title: '',
      day: trip?.start_date ?? '',
      time: '',
      note: '',
      attachmentPath: null,
    });
    setUploadError(null);
  }

  function startEdit(row: TripItemRow) {
    setDraft({
      id: row.id,
      type: row.type,
      title: row.title,
      day: row.day ?? '',
      time: row.datetime ? new Date(row.datetime).toISOString().slice(11, 16) : '',
      note: row.note ?? '',
      attachmentPath: row.attachment_path,
    });
    setUploadError(null);
  }

  async function onPickFile(file: File | undefined) {
    if (!file || !draft) return;
    setUploading(true);
    setUploadError(null);
    try {
      const path = await uploadMedia(couple.id, 'trips', file);
      if (draft.attachmentPath) await removeMedia(draft.attachmentPath);
      setDraft({ ...draft, attachmentPath: path });
    } catch (caught) {
      setUploadError(
        caught instanceof UploadError && caught.reason === 'too_large'
          ? s.errors.uploadTooLarge
          : s.errors.uploadFailed,
      );
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.title.trim() || !tripId) return;

    setSaving(true);
    const values = {
      type: draft.type,
      title: draft.title.trim(),
      day: draft.day || null,
      datetime: draft.day && draft.time ? new Date(`${draft.day}T${draft.time}:00`).toISOString() : null,
      note: draft.note.trim() || null,
      attachment_path: draft.attachmentPath,
    };
    if (draft.id) await items.update(draft.id, values);
    else await items.create({ ...values, trip_id: tripId });
    setSaving(false);
    setDraft(null);
  }

  async function openAttachment(path: string) {
    const url = await signedUrlFor(path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  function renderItem(row: TripItemRow) {
    const Icon = TYPE_ICONS[row.type];
    const time = row.datetime
      ? new Date(row.datetime).toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <li key={row.id} className="flex items-start gap-3 border-b border-rule py-3 last:border-0">
        <button
          type="button"
          onClick={() => void items.update(row.id, { done: !row.done })}
          aria-pressed={row.done}
          aria-label={row.done ? s.phrasebook.markNotLearned : s.common.done}
          className={
            row.done
              ? 'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-stamp-jade text-on-stamp'
              : 'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-rule hover:border-ink-faint'
          }
        >
          {row.done && <Check className="h-3 w-3" />}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={
              row.done
                ? 'flex items-center gap-1.5 text-base text-ink-faint line-through'
                : 'flex items-center gap-1.5 text-base text-ink'
            }
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
            <span className="truncate">{row.title}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
            <span>{s.tripItemTypes[row.type]}</span>
            {time && <span>{time}</span>}
          </p>
          {row.note && <p className="mt-1 text-sm text-ink-soft">{row.note}</p>}
        </div>

        {row.attachment_path && (
          <IconButton
            label={s.trips.itemAttachmentOpen}
            onClick={() => void openAttachment(row.attachment_path!)}
          >
            <Paperclip />
          </IconButton>
        )}
        <RecordActions onEdit={() => startEdit(row)} onDelete={() => void items.remove(row.id)} />
      </li>
    );
  }

  return (
    <div>
      <Link
        to="/trips"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {s.trips.title}
      </Link>

      <PageHeader
        kicker={s.nav.trips}
        title={trip.destination}
        subtitle={
          <>
            {trip.start_date && formatDate(parseISODate(trip.start_date)!, 'long', intlLocale)}
            {trip.end_date && trip.start_date && ' — '}
            {trip.end_date && formatDate(parseISODate(trip.end_date)!, 'long', intlLocale)}
          </>
        }
        actions={
          <Button variant="primary" onClick={startNew}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      {/* --- Budget ---------------------------------------------------------- */}
      <Sheet className="mb-8 p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="label-kicker">{s.trips.budget}</h2>
          {linkedExpenses.length > 0 && (
            <Link
              to="/spending"
              className="text-xs text-ink-faint underline-offset-4 hover:text-ink hover:underline"
            >
              {s.trips.linkedExpenses(linkedExpenses.length)}
            </Link>
          )}
        </div>

        {trip.budget_total_cents === null ? (
          <p className="text-sm text-ink-soft">
            {s.trips.noBudget} · {money(spent, trip.currency, true)}
          </p>
        ) : (
          <>
            <p className="mb-2 flex flex-wrap justify-between gap-2 text-sm text-ink">
              <span>
                {s.trips.budgetSpent(
                  money(budget.spentCents, trip.currency, true),
                  money(budget.budgetCents, trip.currency, true),
                )}
              </span>
              <span className={budget.over ? 'text-cinnabar' : 'text-jade'}>
                {budget.over
                  ? s.trips.budgetOver(money(-budget.remainingCents, trip.currency, true))
                  : s.trips.budgetLeft(money(budget.remainingCents, trip.currency, true))}
              </span>
            </p>
            <ProgressBar percent={budget.percent} tone={budget.over ? 'cinnabar' : 'jade'} />
          </>
        )}

        {trip.notes && (
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
            {trip.notes}
          </p>
        )}
      </Sheet>

      {/* --- The plan ---------------------------------------------------------- */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-medium text-ink">{s.trips.items}</h2>
          {items.rows.length > 0 && (
            <span className="text-xs text-ink-faint">
              {s.trips.progress(checklist.done, checklist.total)}
            </span>
          )}
        </div>

        {items.rows.length > 0 && (
          <ProgressBar percent={checklist.percent} tone="jade" className="mb-6" />
        )}

        {items.rows.length === 0 ? (
          <EmptyState
            icon={<Ticket />}
            title={s.trips.itemsEmptyTitle}
            body={s.trips.itemsEmptyBody}
            action={
              <Button variant="primary" onClick={startNew}>
                {s.trips.addItem}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-7">
            {days.length > 0 && (
              <>
                {days.map((day) => {
                  const iso = toISODate(day);
                  const dayItems = scheduled.filter((item) => item.day === iso);
                  if (dayItems.length === 0) return null;
                  return (
                    <div key={iso}>
                      <h3 className="label-kicker mb-2">{formatDate(day, 'long', intlLocale)}</h3>
                      <ul className="flex flex-col">{dayItems.map(renderItem)}</ul>
                    </div>
                  );
                })}
              </>
            )}

            {/* Items dated outside the trip's own range still need a home. */}
            {(() => {
              const known = new Set(days.map(toISODate));
              const strays = scheduled.filter((item) => !known.has(item.day!));
              const grouped = [...new Set(strays.map((item) => item.day!))].sort();
              return grouped.map((iso) => {
                const date = parseISODate(iso);
                return (
                  <div key={iso}>
                    <h3 className="label-kicker mb-2">
                      {date ? formatDate(date, 'long', intlLocale) : iso}
                    </h3>
                    <ul className="flex flex-col">
                      {strays.filter((item) => item.day === iso).map(renderItem)}
                    </ul>
                  </div>
                );
              });
            })()}

            {unscheduled.length > 0 && (
              <div>
                <h3 className="label-kicker mb-2">{s.trips.unscheduled}</h3>
                <ul className="flex flex-col">{unscheduled.map(renderItem)}</ul>
              </div>
            )}
          </div>
        )}
      </section>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.trips.editItem : s.trips.addItem}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={saving || uploading || !draft?.title.trim()}
            >
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextField
              label={s.trips.itemTitle}
              placeholder={s.trips.itemTitlePlaceholder}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              required
            />
            <SelectField
              label={s.trips.itemType}
              value={draft.type}
              onChange={(event) =>
                setDraft({ ...draft, type: event.target.value as TripItemTypeColumn })
              }
            >
              {ITEM_TYPES.map((value) => (
                <option key={value} value={value}>
                  {s.tripItemTypes[value]}
                </option>
              ))}
            </SelectField>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label={s.trips.itemDay}
                type="date"
                value={draft.day}
                onChange={(event) => setDraft({ ...draft, day: event.target.value })}
                optional
              />
              <TextField
                label={s.trips.itemTime}
                type="time"
                value={draft.time}
                onChange={(event) => setDraft({ ...draft, time: event.target.value })}
                optional
              />
            </div>
            <TextAreaField
              label={s.trips.itemNote}
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              rows={3}
              optional
            />

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">{s.trips.itemAttachment}</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(event) => void onPickFile(event.target.files?.[0])}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
                  {uploading ? <Spinner /> : <Paperclip className="h-4 w-4" />}
                  {s.trips.itemAttachmentAdd}
                </Button>
                {draft.attachmentPath && (
                  <>
                    <Tag tone="jade">
                      <Check className="h-3 w-3" />
                      {s.common.done}
                    </Tag>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        void removeMedia(draft.attachmentPath);
                        setDraft({ ...draft, attachmentPath: null });
                      }}
                    >
                      <X className="h-4 w-4" />
                      {s.trips.itemAttachmentRemove}
                    </Button>
                  </>
                )}
              </div>
              {uploadError && <ErrorNote>{uploadError}</ErrorNote>}
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
