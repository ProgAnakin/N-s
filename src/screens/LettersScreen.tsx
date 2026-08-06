import { useMemo, useState } from 'react';
import { Clock, Feather, Mail, MailOpen, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { ErrorNote, Tag } from '@/components/ui/Bits';
import { ChoiceField, TextAreaField, TextField, Toggle } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, Sheet } from '@/components/ui/Surface';
import { useCouple, useSession } from '@/data/session';
import type { LetterKindColumn, LetterRow } from '@/data/database.types';
import {
  isSealed,
  LETTER_KINDS,
  shelfCount,
  sortForReading,
  unopenedFor,
  type Letter,
} from '@/lib/letters';
import { formatDate } from '@/lib/dates';
import { useI18n, useStrings } from '@/i18n';
import { useCoupleTable, usePartnerNames, useToday } from './shared';
import { cn } from '@/utils/cn';

/**
 * Letters.
 *
 * A shelf, not an inbox. The visual grammar is deliberately closer to the
 * memories timeline than to a chat: each one gets room, they are dated, and
 * nothing is ever marked "unreplied". There is no thread, because a thread
 * invites a running score of who answered last, and that is the one thing
 * this app refuses to keep anywhere.
 *
 * A sealed letter you have sent stays visible to you and invisible to them —
 * enforced by the row policy, not by this file.
 */
export function LettersScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple, profile } = useCouple();
  const { partner } = useSession();
  const names = usePartnerNames();
  const today = useToday();

  const letters = useCoupleTable('letters', { coupleId: couple.id, orderBy: 'created_at' });

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<LetterRow | null>(null);
  const [deleting, setDeleting] = useState<LetterRow | null>(null);

  const rows = useMemo(
    () => sortForReading(letters.rows as unknown as Letter[], profile.id, today),
    [letters.rows, profile.id, today],
  );
  const unopened = useMemo(() => unopenedFor(rows, profile.id), [rows, profile.id]);

  async function markOpened(id: string) {
    await letters.update(id, { read_at: new Date().toISOString() });
  }

  async function onDelete() {
    if (!deleting) return;
    await letters.remove(deleting.id);
    setDeleting(null);
  }

  return (
    <div>
      <PageHeader
        kicker={s.nav.letters}
        title={s.letters.title}
        subtitle={s.letters.subtitle}
        actions={
          partner ? (
            <Button variant="primary" onClick={() => setComposing(true)}>
              <Feather className="h-4 w-4" />
              {s.letters.write}
            </Button>
          ) : undefined
        }
      />

      {letters.error && (
        <div className="mb-4">
          <ErrorNote>{letters.error}</ErrorNote>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Tag>{s.letters.shelf(shelfCount(rows))}</Tag>
          {unopened.length > 0 && (
            <Tag tone="cinnabar">{s.letters.unreadCount(unopened.length)}</Tag>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Mail />}
          title={s.letters.title}
          body={s.letters.empty}
          action={
            partner ? (
              <Button variant="primary" onClick={() => setComposing(true)}>
                <Feather className="h-4 w-4" />
                {s.letters.writeFirst}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((letter) => (
            <li key={letter.id}>
              <LetterCard
                letter={letter}
                mine={letter.from_profile === profile.id}
                sealed={isSealed(letter, today)}
                authorName={letter.from_profile === profile.id ? names.myName : names.partnerName}
                recipientName={
                  letter.to_profile === profile.id ? names.myName : names.partnerName
                }
                dateLabel={formatDate(isoToDate(letter.created_at), 'dayMonth', intlLocale)}
                openLabel={
                  letter.open_on
                    ? formatDate(isoToDate(letter.open_on), 'dayMonth', intlLocale)
                    : null
                }
                onOpen={() => void markOpened(letter.id)}
                onEdit={() => setEditing(letters.rows.find((row) => row.id === letter.id) ?? null)}
                onDelete={() =>
                  setDeleting(letters.rows.find((row) => row.id === letter.id) ?? null)
                }
              />
            </li>
          ))}
        </ul>
      )}

      {rows.length > 2 && (
        <p className="mt-8 max-w-prose text-pretty text-xs leading-relaxed text-ink-faint">
          {s.letters.readingNote}
        </p>
      )}

      {partner && (
        <Compose
          open={composing || editing !== null}
          existing={editing}
          recipientId={partner.id}
          recipientName={names.partnerName}
          coupleId={couple.id}
          authorId={profile.id}
          onClose={() => {
            setComposing(false);
            setEditing(null);
          }}
          onCreate={async (values) => {
            await letters.create(values);
          }}
          onUpdate={async (id, values) => {
            await letters.update(id, values);
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={s.letters.deleteConfirm}
        body={s.letters.deleteConfirmBody}
        confirmLabel={s.common.delete}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}

/**
 * One letter.
 *
 * Unopened letters addressed to the reader stay shut until tapped. That is a
 * small piece of theatre and it earns its keep: opening something is a
 * different act from scrolling past it, and the difference is the point of
 * the whole feature.
 */
function LetterCard({
  letter,
  mine,
  sealed,
  authorName,
  recipientName,
  dateLabel,
  openLabel,
  onOpen,
  onEdit,
  onDelete,
}: {
  letter: Letter;
  mine: boolean;
  sealed: boolean;
  authorName: string;
  recipientName: string;
  dateLabel: string;
  openLabel: string | null;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const s = useStrings();
  const kind = s.letters.kinds[letter.kind];
  const unopenedForMe = !mine && letter.read_at === null;

  return (
    <Sheet
      className={cn(
        'p-5 transition-colors',
        unopenedForMe && 'border-cinnabar/40 bg-cinnabar-wash/40',
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tag tone={letter.kind === 'sorry' ? 'jade' : 'cinnabar'}>{kind.name}</Tag>
        <span className="text-xs text-ink-faint">
          {mine ? s.letters.to(recipientName) : s.letters.from(authorName)} · {dateLabel}
        </span>
        {sealed && openLabel && (
          <Tag>
            <Clock className="h-3 w-3" />
            {s.letters.sealedUntil(openLabel)}
          </Tag>
        )}
        {unopenedForMe && <Tag tone="cinnabar">{s.letters.unread}</Tag>}

        <span className="ml-auto flex items-center gap-1">
          {mine && letter.read_at === null && (
            <>
              <IconButton label={s.common.edit} onClick={onEdit}>
                <Feather className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label={s.common.delete} onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </>
          )}
        </span>
      </div>

      {unopenedForMe ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-cinnabar/50 px-4 py-6 text-sm font-medium text-cinnabar transition-colors hover:bg-cinnabar/8"
        >
          <MailOpen className="h-4 w-4" />
          {s.letters.open}
        </button>
      ) : (
        <p className="text-pretty font-display text-base leading-relaxed text-ink [white-space:pre-wrap]">
          {letter.body}
        </p>
      )}

      {mine && (
        <p className="mt-3 text-xs text-ink-faint">
          {letter.read_at ? s.letters.opened : sealed ? s.letters.sealedNote : s.letters.notOpenedYet}
        </p>
      )}
    </Sheet>
  );
}

function Compose({
  open,
  existing,
  recipientId,
  recipientName,
  coupleId,
  authorId,
  onClose,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  existing: LetterRow | null;
  recipientId: string;
  recipientName: string;
  coupleId: string;
  authorId: string;
  onClose: () => void;
  onCreate: (values: {
    couple_id: string;
    from_profile: string;
    to_profile: string;
    kind: LetterKindColumn;
    body: string;
    open_on: string | null;
  }) => Promise<void>;
  onUpdate: (
    id: string,
    values: { kind: LetterKindColumn; body: string; open_on: string | null },
  ) => Promise<void>;
}) {
  const s = useStrings();
  const [kind, setKind] = useState<LetterKindColumn>('thanks');
  const [body, setBody] = useState('');
  const [sealing, setSealing] = useState(false);
  const [openOn, setOpenOn] = useState('');
  const [saving, setSaving] = useState(false);
  // Re-seeds the form whenever the modal is opened for a different letter,
  // without an effect that fights the user's typing.
  const [seeded, setSeeded] = useState<string | null>(null);

  const seedKey = existing?.id ?? (open ? 'new' : null);
  if (open && seedKey !== seeded) {
    setSeeded(seedKey);
    setKind(existing?.kind ?? 'thanks');
    setBody(existing?.body ?? '');
    setSealing(Boolean(existing?.open_on));
    setOpenOn(existing?.open_on ?? '');
  }
  if (!open && seeded !== null) setSeeded(null);

  const ready = body.trim().length > 0 && (!sealing || openOn !== '');

  async function submit() {
    if (!ready) return;
    setSaving(true);
    const values = {
      kind,
      body: body.trim(),
      open_on: sealing && openOn ? openOn : null,
    };
    try {
      if (existing) {
        await onUpdate(existing.id, values);
      } else {
        await onCreate({
          couple_id: coupleId,
          from_profile: authorId,
          to_profile: recipientId,
          ...values,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? s.letters.editing : s.letters.write}
      description={s.letters.to(recipientName)}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {s.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!ready || saving}>
            {saving ? s.common.saving : s.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ChoiceField
          label={s.letters.kind}
          value={kind}
          onChange={setKind}
          options={LETTER_KINDS.map((value) => ({
            value,
            label: s.letters.kinds[value].name,
          }))}
          hint={s.letters.kinds[kind].hint}
        />

        <TextAreaField
          label={s.letters.body}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={s.letters.bodyPlaceholder}
          rows={6}
        />

        <div className="rounded-sm border border-rule p-3">
          <Toggle label={s.letters.seal} checked={sealing} onChange={setSealing} />
          {sealing && (
            <div className="mt-3">
              <TextField
                label={s.letters.seal}
                type="date"
                value={openOn}
                onChange={(event) => setOpenOn(event.target.value)}
                hint={s.letters.sealHint}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** ISO timestamp or date to the calendar date the formatter wants. */
function isoToDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}
