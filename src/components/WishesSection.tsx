import { useMemo, useRef, useState } from 'react';
import { Check, Gift, ImagePlus, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorNote, Spinner, Tag } from '@/components/ui/Bits';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { SectionHeading, Sheet } from '@/components/ui/Surface';
import { useCouple, useSession } from '@/data/session';
import { useTable } from '@/data/useTable';
import { removeMedia, uploadMedia, useSignedUrls, UploadError } from '@/data/storage';
import type { WishRow } from '@/data/database.types';
import { parseISODate } from '@/lib/calendar';
import { formatDate } from '@/lib/dates';
import {
  MAX_WISHES,
  grantValues,
  grantedWishes,
  liveWishes,
  nextFreeSlot,
  slotsLeft,
  ungrantValues,
  type Wish,
} from '@/lib/wishes';
import { useI18n, useStrings } from '@/i18n';
import { usePartnerNames, useToday } from '@/screens/shared';
import { cn } from '@/utils/cn';

/**
 * Three wishes.
 *
 * Two views of one table, and the split is the whole feature. On your own
 * page you write them and see what has been granted; on the gift page you
 * read your partner's and can grant one. Neither person can edit the
 * other's words — enforced by a trigger in 0013, not by hiding a button,
 * because a wish somebody else reworded is not a wish any more.
 *
 * `gift_ideas` stays exactly where it was and is not merged into this.
 * A wish is what they said out loud; a gift idea is what you noticed.
 * Putting them on the same list would make every surprise auditable.
 */

/**
 * What an insert must carry.
 *
 * `couple_id` is deliberately absent: the trigger in 0013 fills it in
 * from the profile, and a client-supplied one would be a way to write a
 * wish into somebody else's space.
 */
type WishInsert = Pick<WishRow, 'profile_id' | 'title'> &
  Partial<Pick<WishRow, 'note' | 'link' | 'photo_path' | 'slot'>>;

/** The row shape the pure module wants. */
function toWish(row: WishRow): Wish {
  return {
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    note: row.note,
    photoPath: row.photo_path,
    link: row.link,
    slot: row.slot,
    grantedOn: parseISODate(row.granted_on),
    grantedBy: row.granted_by,
    grantedNote: row.granted_note,
    createdAt: row.created_at,
  };
}

/**
 * The table, shared by both views.
 *
 * Read by couple rather than by profile: the partner's wishes have to
 * arrive too, and the row policy already restricts it to the two of you.
 */
function useWishes(coupleId: string) {
  return useTable('wishes', { column: 'couple_id', value: coupleId, orderBy: 'created_at' });
}

// =====================================================================
// Yours — on your own page
// =====================================================================

export function MyWishesSection() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple, profile } = useCouple();
  const { partner } = useSession();
  const names = usePartnerNames();

  const wishes = useWishes(couple.id);
  const domain = useMemo(() => wishes.rows.map(toWish), [wishes.rows]);
  const mine = liveWishes(domain, profile.id);
  const history = grantedWishes(domain, profile.id);
  const free = slotsLeft(domain, profile.id);

  const urls = useSignedUrls([
    ...mine.map((wish) => wish.photoPath),
    ...history.map((wish) => wish.photoPath),
  ]);

  const [draft, setDraft] = useState<DraftWish | null>(null);
  const [removing, setRemoving] = useState<Wish | null>(null);

  return (
    <section>
      <SectionHeading>{s.wishes.title}</SectionHeading>
      <p className="-mt-2 mb-4 max-w-prose text-pretty text-sm leading-relaxed text-ink-soft">
        {s.wishes.subtitle}
      </p>

      {/* Nobody would guess this from the page, and the whole feature
          depends on knowing it. */}
      <p className="mb-5 flex items-start gap-2 rounded-sm bg-jade-wash px-3 py-2.5 text-sm leading-relaxed text-ink-soft">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade" />
        {partner ? s.wishes.visibleNotice(names.partnerName) : s.wishes.visibleNoticeAlone}
      </p>

      {wishes.error && (
        <div className="mb-4">
          <ErrorNote>{wishes.error}</ErrorNote>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tag>{s.wishes.left(free)}</Tag>
        {free > 0 && (
          <Button
            onClick={() =>
              setDraft({ id: null, title: '', note: '', link: '', photoPath: null })
            }
          >
            <Plus className="h-4 w-4" />
            {s.wishes.add}
          </Button>
        )}
      </div>

      {mine.length === 0 ? (
        <Sheet className="p-5">
          <p className="font-display text-base font-medium text-ink">{s.wishes.empty}</p>
          <p className="mt-1 max-w-prose text-pretty text-sm leading-relaxed text-ink-soft">
            {s.wishes.emptyBody}
          </p>
        </Sheet>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-3">
          {mine.map((wish) => (
            <li key={wish.id}>
              <WishCard
                wish={wish}
                url={wish.photoPath ? urls[wish.photoPath] : undefined}
                onEdit={() =>
                  setDraft({
                    id: wish.id,
                    title: wish.title,
                    note: wish.note ?? '',
                    link: wish.link ?? '',
                    photoPath: wish.photoPath ?? null,
                  })
                }
                onRemove={() => setRemoving(wish)}
              />
            </li>
          ))}
        </ul>
      )}

      {free === 0 && <p className="mt-3 text-xs text-ink-faint">{s.wishes.full}</p>}

      {/* --- What happened --------------------------------------------- */}
      <div className="mt-8">
        <h3 className="label-kicker mb-1">{s.wishes.historyTitle}</h3>
        <p className="mb-3 max-w-prose text-pretty text-sm leading-relaxed text-ink-soft">
          {s.wishes.historyBody}
        </p>

        {history.length === 0 ? (
          <p className="text-sm text-ink-faint">{s.wishes.historyEmpty}</p>
        ) : (
          <ul className="flex flex-col">
            {history.map((wish) => (
              <li
                key={wish.id}
                className="flex items-start gap-3 border-b border-rule py-3 last:border-0"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-jade/12 text-jade">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base text-ink">{wish.title}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {wish.grantedOn
                      ? s.wishes.grantedOn(formatDate(wish.grantedOn, 'long', intlLocale))
                      : s.wishes.granted}
                  </p>
                  {/* The giver's own words, kept with the wish so the shelf
                      reads as a memory rather than a receipt. */}
                  {wish.grantedNote && (
                    <p className="mt-1 text-pretty text-sm italic leading-relaxed text-ink-soft">
                      {wish.grantedNote}
                    </p>
                  )}
                </div>
                {wish.photoPath && urls[wish.photoPath] && (
                  <img
                    src={urls[wish.photoPath]}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-sm object-cover"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <WishForm
        draft={draft}
        coupleId={couple.id}
        profileId={profile.id}
        slot={nextFreeSlot(domain, profile.id)}
        onClose={() => setDraft(null)}
        onCreate={(values) => wishes.create(values)}
        onUpdate={(id, values) => wishes.update(id, values)}
      />

      <ConfirmDialog
        open={removing !== null}
        title={s.wishes.removeConfirm}
        body={s.wishes.removeConfirmBody}
        confirmLabel={s.common.delete}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            void removeMedia(removing.photoPath);
            void wishes.remove(removing.id);
          }
          setRemoving(null);
        }}
      />
    </section>
  );
}

function WishCard({
  wish,
  url,
  onEdit,
  onRemove,
}: {
  wish: Wish;
  url: string | undefined;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const s = useStrings();

  return (
    <Sheet as="article" className="flex h-full flex-col overflow-hidden p-0">
      {wish.photoPath && (
        <div className="aspect-[5/4] w-full overflow-hidden bg-sunk">
          {url ? (
            <img
              src={url}
              alt={s.wishes.photoAlt(wish.title)}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Spinner />
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h4 className="text-pretty font-display text-base font-medium leading-snug text-ink">
          {wish.title}
        </h4>
        {wish.note && (
          <p className="text-pretty text-sm leading-relaxed text-ink-soft">{wish.note}</p>
        )}
        {wish.link && (
          <a
            href={wish.link}
            target="_blank"
            rel="noreferrer noopener"
            className="truncate text-xs text-cinnabar underline-offset-4 hover:underline"
          >
            {wish.link}
          </a>
        )}

        <div className="mt-auto flex items-center gap-1 pt-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-sm px-2 py-1 text-xs text-ink-faint transition-colors hover:bg-sunk hover:text-ink"
          >
            {s.common.edit}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-sm px-2 py-1 text-xs text-ink-faint transition-colors hover:bg-sunk hover:text-ink"
          >
            {s.wishes.remove}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

interface DraftWish {
  id: string | null;
  title: string;
  note: string;
  link: string;
  photoPath: string | null;
}

function WishForm({
  draft,
  coupleId,
  profileId,
  slot,
  onClose,
  onCreate,
  onUpdate,
}: {
  draft: DraftWish | null;
  coupleId: string;
  profileId: string;
  slot: number | null;
  onClose: () => void;
  onCreate: (values: WishInsert) => Promise<unknown>;
  onUpdate: (id: string, values: Partial<WishRow>) => Promise<unknown>;
}) {
  const s = useStrings();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = draft !== null;
  const seedKey = draft ? (draft.id ?? 'new') : null;
  if (open && seedKey !== seeded) {
    setSeeded(seedKey);
    setTitle(draft.title);
    setNote(draft.note);
    setLink(draft.link);
    setPhotoPath(draft.photoPath);
    setUploadError(null);
  }
  if (!open && seeded !== null) setSeeded(null);

  const urls = useSignedUrls([photoPath]);

  async function pickPhoto(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const path = await uploadMedia(coupleId, 'wishes', file);
      // The old one goes as soon as the new one is safely up — the other
      // order loses the photograph if the upload fails.
      if (photoPath) void removeMedia(photoPath);
      setPhotoPath(path);
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

  async function submit() {
    if (!title.trim() || !draft) return;
    setSaving(true);
    const values = {
      title: title.trim(),
      note: note.trim() || null,
      link: link.trim() || null,
      photo_path: photoPath,
    };
    try {
      if (draft.id) {
        await onUpdate(draft.id, values);
      } else if (slot !== null) {
        // `couple_id` is deliberately absent: the trigger in 0013 fills it
        // in from the profile, and a client-supplied one would be a way to
        // write a wish into somebody else's space.
        await onCreate({ ...values, profile_id: profileId, slot });
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
      title={draft?.id ? s.wishes.edit : s.wishes.add}
      footer={
        <>
          <Button onClick={onClose}>{s.common.cancel}</Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={saving || uploading || !title.trim()}
          >
            {saving ? s.common.saving : s.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-4">
        <TextField
          label={s.wishes.wishTitle}
          placeholder={s.wishes.titlePlaceholder}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
        <TextAreaField
          label={s.wishes.note}
          hint={s.wishes.noteHint}
          placeholder={s.wishes.notePlaceholder}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={400}
          optional
        />
        <TextField
          label={s.wishes.link}
          type="url"
          placeholder={s.wishes.linkPlaceholder}
          value={link}
          onChange={(event) => setLink(event.target.value)}
          optional
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">{s.wishes.photo}</span>
          {photoPath && urls[photoPath] && (
            <img
              src={urls[photoPath]}
              alt=""
              className="h-32 w-full rounded-sm object-cover"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner /> : <ImagePlus className="h-4 w-4" />}
              {photoPath ? s.wishes.photoReplace : s.wishes.photoAdd}
            </Button>
            {photoPath && (
              <button
                type="button"
                onClick={() => {
                  void removeMedia(photoPath);
                  setPhotoPath(null);
                }}
                className="rounded-sm px-2 py-1 text-xs text-ink-faint hover:bg-sunk hover:text-ink"
              >
                <X className="mr-1 inline h-3 w-3" />
                {s.wishes.photoRemove}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void pickPhoto(file);
            }}
          />
          {uploadError && <ErrorNote>{uploadError}</ErrorNote>}
        </div>
      </div>
    </Modal>
  );
}

// =====================================================================
// Theirs — on the gift page
// =====================================================================

export function PartnerWishesSection() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple, profile } = useCouple();
  const { partner } = useSession();
  const names = usePartnerNames();
  const today = useToday();

  const wishes = useWishes(couple.id);
  const domain = useMemo(() => wishes.rows.map(toWish), [wishes.rows]);

  const [granting, setGranting] = useState<Wish | null>(null);
  const [grantNote, setGrantNote] = useState('');

  /*
   * Computed before the early return, not after it.
   *
   * `useSignedUrls` below an `if (!partner) return null` is a hook behind
   * a condition: the render where a partner finally joins would run one
   * more hook than the render before it, and React unmounts the whole
   * subtree with an error. It only breaks on the single most important
   * transition in the app, which is why it would have survived review.
   */
  const theirs = partner ? liveWishes(domain, partner.id) : [];
  const theirHistory = partner ? grantedWishes(domain, partner.id) : [];
  const urls = useSignedUrls(theirs.map((wish) => wish.photoPath));

  async function onGrant() {
    if (!granting) return;
    await wishes.update(granting.id, grantValues(profile.id, today, grantNote));
    setGranting(null);
    setGrantNote('');
  }

  if (!partner) return null;

  return (
    <section className="mb-9">
      <SectionHeading>{s.wishes.partnerTitle(names.partnerName)}</SectionHeading>
      <p className="-mt-2 mb-4 max-w-prose text-pretty text-sm leading-relaxed text-ink-soft">
        {s.wishes.partnerSubtitle}
      </p>

      {theirs.length === 0 ? (
        <Sheet className="p-5">
          <p className="font-display text-base font-medium text-ink">
            {s.wishes.partnerEmpty(names.partnerName)}
          </p>
          {/* An empty list is not a slight and should not read as one. */}
          <p className="mt-1 max-w-prose text-pretty text-sm leading-relaxed text-ink-soft">
            {s.wishes.partnerEmptyBody}
          </p>
        </Sheet>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-3">
          {theirs.map((wish) => (
            <li key={wish.id}>
              <Sheet as="article" className="flex h-full flex-col overflow-hidden p-0">
                {wish.photoPath && (
                  <div className="aspect-[5/4] w-full overflow-hidden bg-sunk">
                    {wish.photoPath && urls[wish.photoPath] ? (
                      <img
                        src={urls[wish.photoPath]}
                        alt={s.wishes.photoAlt(wish.title)}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <Spinner />
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <h4 className="text-pretty font-display text-base font-medium leading-snug text-ink">
                    {wish.title}
                  </h4>
                  {wish.note && (
                    <p className="text-pretty text-sm leading-relaxed text-ink-soft">
                      {wish.note}
                    </p>
                  )}
                  {wish.link && (
                    <a
                      href={wish.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="truncate text-xs text-cinnabar underline-offset-4 hover:underline"
                    >
                      {wish.link}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setGranting(wish)}
                    className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-sm border border-rule px-3 py-2 text-sm text-ink-soft transition-colors hover:border-jade hover:text-jade"
                  >
                    <Gift className="h-3.5 w-3.5" />
                    {s.wishes.grant}
                  </button>
                </div>
              </Sheet>
            </li>
          ))}
        </ul>
      )}

      {theirHistory.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {theirHistory.slice(0, 6).map((wish) => (
            <li key={wish.id}>
              <GrantedChip
                wish={wish}
                byYou={wish.grantedBy === profile.id}
                label={
                  wish.grantedOn
                    ? formatDate(wish.grantedOn, 'medium', intlLocale)
                    : s.wishes.granted
                }
                onUndo={() => {
                  const values = ungrantValues(domain, wish);
                  // Refused rather than silently overwriting a live wish.
                  if (values) void wishes.update(wish.id, values);
                }}
                canUndo={ungrantValues(domain, wish) !== null}
              />
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={granting !== null}
        onClose={() => setGranting(null)}
        title={s.wishes.grantTitle}
        description={granting?.title}
        footer={
          <>
            <Button onClick={() => setGranting(null)}>{s.common.cancel}</Button>
            <Button variant="primary" onClick={() => void onGrant()}>
              {s.wishes.grant}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-ink-soft">
            {s.wishes.grantBody(names.partnerName)}
          </p>
          <TextAreaField
            label={s.wishes.grantNote}
            placeholder={s.wishes.grantNotePlaceholder}
            value={grantNote}
            onChange={(event) => setGrantNote(event.target.value)}
            rows={2}
            optional
          />
        </div>
      </Modal>
    </section>
  );
}

function GrantedChip({
  wish,
  byYou,
  label,
  canUndo,
  onUndo,
}: {
  wish: Wish;
  byYou: boolean;
  label: string;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const s = useStrings();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-rule px-2 py-1 text-[11px]',
        byYou ? 'text-jade' : 'text-ink-faint',
      )}
    >
      <Check className="h-3 w-3" />
      {wish.title}
      <span className="text-ink-faint">· {label}</span>
      {/* Marking the wrong wish granted is one mis-tap; without this the
          only way back is deleting somebody's wish. */}
      {canUndo && (
        <button
          type="button"
          onClick={onUndo}
          aria-label={s.wishes.ungrant}
          className="-mr-0.5 rounded-sm p-0.5 text-ink-faint hover:bg-sunk hover:text-ink"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export { MAX_WISHES };
