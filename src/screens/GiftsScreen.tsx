import { useState } from 'react';
import { Check, Gift, Lock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, SectionHeading, Sheet } from '@/components/ui/Surface';
import { SuggestionList } from '@/components/SuggestionList';
import { useCouple } from '@/data/session';
import { useTable } from '@/data/useTable';
import type { GiftIdeaRow } from '@/data/database.types';
import { parseISODate, toISODate } from '@/lib/calendar';
import { formatDate } from '@/lib/dates';
import { useI18n, useStrings } from '@/i18n';
import { RecordActions, useToday } from './shared';

interface Draft {
  id: string | null;
  idea: string;
  occasion: string;
  noticedOn: string;
  note: string;
}

/**
 * The gift radar.
 *
 * Author-private in the database, not merely hidden in the interface: the RLS
 * policy on gift_ideas has no shared branch at all, so the partner cannot read
 * one, count them, or learn that any exist. That is the only way a surprise
 * stays a surprise.
 */
export function GiftsScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple, profile } = useCouple();
  const today = useToday();

  const gifts = useTable('gift_ideas', {
    column: 'author_id',
    value: profile.id,
    orderBy: 'created_at',
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const saved = gifts.rows.filter((row) => !row.used);
  const used = gifts.rows.filter((row) => row.used);

  function startNew() {
    setDraft({ id: null, idea: '', occasion: '', noticedOn: toISODate(today), note: '' });
  }

  function startEdit(row: GiftIdeaRow) {
    setDraft({
      id: row.id,
      idea: row.idea,
      occasion: row.occasion ?? '',
      noticedOn: row.noticed_on ?? '',
      note: row.note ?? '',
    });
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.idea.trim()) return;

    setSaving(true);
    const values = {
      idea: draft.idea.trim(),
      occasion: draft.occasion.trim() || null,
      noticed_on: draft.noticedOn || null,
      note: draft.note.trim() || null,
    };
    if (draft.id) await gifts.update(draft.id, values);
    else await gifts.create({ ...values, couple_id: couple.id, author_id: profile.id });
    setSaving(false);
    setDraft(null);
  }

  return (
    <div>
      <PageHeader
        kicker={s.nav.gifts}
        title={s.gifts.title}
        subtitle={s.gifts.intro}
        actions={
          <Button variant="primary" onClick={startNew}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      <p className="mb-7 flex items-start gap-2 rounded-sm bg-sunk px-3 py-2.5 text-sm leading-relaxed text-ink-soft">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {s.gifts.privateNotice}
      </p>

      {/* Gift ideas and cautions live here rather than on Home: this page
          is `author_id = auth.uid()` in every direction, so a surprise
          cannot be spoiled by somebody glancing at the front page. */}
      <SuggestionList kinds={['caution', 'gift']} className="mb-8" />

      {gifts.rows.length === 0 ? (
        <EmptyState
          icon={<Gift />}
          title={s.gifts.emptyTitle}
          body={s.gifts.emptyBody}
          action={
            <Button variant="primary" onClick={startNew}>
              {s.gifts.add}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-9">
          {saved.length > 0 && (
            <section>
              <SectionHeading>{s.gifts.ideasTitle}</SectionHeading>
              <ul className="flex flex-col gap-3">
                {saved.map((row) => (
                  <li key={row.id}>
                    <GiftCard
                      row={row}
                      locale={intlLocale}
                      onEdit={() => startEdit(row)}
                      onDelete={() => void gifts.remove(row.id)}
                      onToggleUsed={() => void gifts.update(row.id, { used: true })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {used.length > 0 && (
            <section>
              <SectionHeading>{s.gifts.usedTitle}</SectionHeading>
              <ul className="flex flex-col gap-2">
                {used.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 border-b border-rule py-2.5 last:border-0"
                  >
                    <Check className="h-4 w-4 shrink-0 text-jade" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base text-ink-soft line-through decoration-ink-faint/50">
                        {row.idea}
                      </p>
                      {row.occasion && <p className="text-xs text-ink-faint">{row.occasion}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => void gifts.update(row.id, { used: false })}
                      className="shrink-0 rounded-sm px-1.5 py-0.5 text-xs text-ink-faint hover:bg-sunk hover:text-ink"
                    >
                      {s.gifts.markUnused}
                    </button>
                    <RecordActions onDelete={() => void gifts.remove(row.id)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.gifts.edit : s.gifts.add}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={saving || !draft?.idea.trim()}
            >
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextAreaField
              label={s.gifts.idea}
              placeholder={s.gifts.ideaPlaceholder}
              value={draft.idea}
              onChange={(event) => setDraft({ ...draft, idea: event.target.value })}
              rows={3}
              required
            />
            <TextField
              label={s.gifts.occasion}
              placeholder={s.gifts.occasionPlaceholder}
              value={draft.occasion}
              onChange={(event) => setDraft({ ...draft, occasion: event.target.value })}
              hint={s.gifts.occasionHint}
              optional
            />
            <TextField
              label={s.gifts.noticedOn}
              type="date"
              value={draft.noticedOn}
              onChange={(event) => setDraft({ ...draft, noticedOn: event.target.value })}
              optional
            />
            <TextAreaField
              label={s.gifts.note}
              placeholder={s.gifts.notePlaceholder}
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

function GiftCard({
  row,
  locale,
  onEdit,
  onDelete,
  onToggleUsed,
}: {
  row: GiftIdeaRow;
  locale: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggleUsed: () => void;
}) {
  const s = useStrings();
  const noticed = parseISODate(row.noticed_on);

  return (
    <Sheet as="article" className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-pretty font-display text-base font-medium leading-snug text-ink">
          {row.idea}
        </h3>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-faint">
          {row.occasion && <span>{row.occasion}</span>}
          {noticed && <span>{formatDate(noticed, 'medium', locale)}</span>}
        </p>
        {row.note && (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{row.note}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <RecordActions onEdit={onEdit} onDelete={onDelete} />
        <button
          type="button"
          onClick={onToggleUsed}
          className="rounded-sm px-1.5 py-0.5 text-xs text-ink-faint hover:bg-sunk hover:text-ink"
        >
          {s.gifts.markUsed}
        </button>
      </div>
    </Sheet>
  );
}
