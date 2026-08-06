import { useMemo, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { ImagePlus, Images, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorNote, LoadingBlock, Spinner } from '@/components/ui/Bits';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import { removeMedia, uploadMedia, useSignedUrls, UploadError } from '@/data/storage';
import type { MemoryRow } from '@/data/database.types';
import { parseISODate, toISODate } from '@/lib/calendar';
import { formatDate, formatMonthYear, groupByMonth } from '@/lib/dates';
import { useI18n, useStrings } from '@/i18n';
import { RecordActions, useCoupleTable, useToday } from './shared';

interface Draft {
  id: string | null;
  title: string;
  note: string;
  date: string;
  photoPath: string | null;
}

/**
 * The memories timeline.
 *
 * Laid out as a vertical spine with entries hanging off it. The spine is the
 * signature curve rather than a straight rule — this is the one screen where
 * the app is unambiguously a keepsake rather than a tool, so it gets the most
 * generous typography and the most air.
 */
export function MemoriesScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple } = useCouple();
  const today = useToday();

  const memories = useCoupleTable('memories', {
    coupleId: couple.id,
    orderBy: 'date',
    ascending: false,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const photoUrls = useSignedUrls(memories.rows.map((row) => row.photo_path));

  const groups = useMemo(
    () =>
      groupByMonth(
        memories.rows.filter((row) => parseISODate(row.date) !== null),
        (row) => parseISODate(row.date)!,
      ),
    [memories.rows],
  );

  function startNew() {
    setDraft({ id: null, title: '', note: '', date: toISODate(today), photoPath: null });
    setUploadError(null);
  }

  function startEdit(row: MemoryRow) {
    setDraft({
      id: row.id,
      title: row.title,
      note: row.note ?? '',
      date: row.date,
      photoPath: row.photo_path,
    });
    setUploadError(null);
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file || !draft) return;
    setUploading(true);
    setUploadError(null);
    try {
      const path = await uploadMedia(couple.id, 'memories', file);
      // Replacing a photo removes the old object rather than orphaning it in
      // the bucket forever.
      if (draft.photoPath) await removeMedia(draft.photoPath);
      setDraft({ ...draft, photoPath: path });
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
    if (!draft || !draft.title.trim() || !draft.date) return;

    setSaving(true);
    const values = {
      title: draft.title.trim(),
      note: draft.note.trim() || null,
      date: draft.date,
      photo_path: draft.photoPath,
    };
    if (draft.id) await memories.update(draft.id, values);
    else await memories.create({ ...values, couple_id: couple.id });
    setSaving(false);
    setDraft(null);
  }

  async function onDelete(row: MemoryRow) {
    await memories.remove(row.id);
    await removeMedia(row.photo_path);
  }

  return (
    <div>
      <PageHeader
        kicker={s.nav.memories}
        title={s.memories.title}
        subtitle={s.memories.subtitle}
        actions={
          <Button variant="primary" onClick={startNew}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      {memories.loading ? (
        <LoadingBlock />
      ) : memories.rows.length === 0 ? (
        <EmptyState
          icon={<Images />}
          title={s.memories.emptyTitle}
          body={s.memories.emptyBody}
          action={
            <Button variant="primary" onClick={startNew}>
              {s.memories.add}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="label-kicker mb-4">{formatMonthYear(group.month, intlLocale)}</h2>

              <ol className="relative flex flex-col gap-8 pl-6">
                {/* The spine. Drawn, not ruled. */}
                <span
                  aria-hidden="true"
                  className="absolute bottom-2 left-[3px] top-2 w-px bg-gradient-to-b from-transparent via-rule to-transparent"
                />

                {group.items.map((row, index) => {
                  const date = parseISODate(row.date);
                  const url = row.photo_path ? photoUrls[row.photo_path] : undefined;

                  return (
                    <m.li
                      key={row.id}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{ duration: 0.45, delay: index * 0.04, ease: [0.2, 0.7, 0.3, 1] }}
                      className="relative"
                    >
                      {/* A small seal marks each entry on the spine. */}
                      <span
                        aria-hidden="true"
                        className="absolute -left-6 top-1.5 h-[7px] w-[7px] rounded-sm bg-cinnabar"
                        style={{ transform: 'rotate(-8deg)' }}
                      />

                      <article>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {date && (
                              <p className="mb-1 text-xs text-ink-faint">
                                {formatDate(date, 'long', intlLocale)}
                              </p>
                            )}
                            <h3 className="display-warm text-balance font-display text-xl font-medium leading-snug text-ink">
                              {row.title}
                            </h3>
                          </div>
                          <RecordActions
                            onEdit={() => startEdit(row)}
                            onDelete={() => void onDelete(row)}
                          />
                        </div>

                        {row.note && (
                          <p className="mt-2 max-w-column whitespace-pre-line text-pretty text-base leading-relaxed text-ink-soft">
                            {row.note}
                          </p>
                        )}

                        {row.photo_path && (
                          <div className="mt-3 max-w-column overflow-hidden rounded-md border border-rule bg-sunk">
                            {url ? (
                              <img
                                src={url}
                                alt={s.memories.photoAlt(row.title)}
                                loading="lazy"
                                className="block h-auto w-full"
                              />
                            ) : (
                              <div className="flex aspect-[4/3] items-center justify-center">
                                <Spinner />
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    </m.li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.memories.edit : s.memories.add}
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
              label={s.memories.memoryTitle}
              placeholder={s.memories.titlePlaceholder}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              required
            />
            <TextField
              label={s.memories.date}
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              required
            />
            <TextAreaField
              label={s.memories.note}
              placeholder={s.memories.notePlaceholder}
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              rows={6}
            />

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">{s.memories.photo}</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => void onPickPhoto(event.target.files?.[0])}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
                  {uploading ? <Spinner /> : <ImagePlus className="h-4 w-4" />}
                  {uploading
                    ? s.memories.uploading
                    : draft.photoPath
                      ? s.memories.photoReplace
                      : s.memories.photoAdd}
                </Button>
                {draft.photoPath && (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      void removeMedia(draft.photoPath);
                      setDraft({ ...draft, photoPath: null });
                    }}
                  >
                    <X className="h-4 w-4" />
                    {s.memories.photoRemove}
                  </Button>
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
