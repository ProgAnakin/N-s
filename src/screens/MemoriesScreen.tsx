import { useMemo, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { ImagePlus, Images, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorNote, LoadingBlock, Spinner } from '@/components/ui/Bits';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader } from '@/components/ui/Surface';
import { Lightbox } from '@/components/Lightbox';
import { useCouple } from '@/data/session';
import { removeMedia, uploadMedia, useSignedUrls, UploadError } from '@/data/storage';
import type { MemoryPhotoRow, MemoryRow } from '@/data/database.types';
import { parseISODate, toISODate } from '@/lib/calendar';
import { formatDate, formatMonthYear, groupByMonth } from '@/lib/dates';
import {
  buildBooks,
  flattenAlbum,
  nextSortOrder,
  slideIndexOf,
  type Book,
} from '@/lib/album';
import { useI18n, useStrings } from '@/i18n';
import { RecordActions, useCoupleTable, useToday } from './shared';
import { cn } from '@/utils/cn';

interface Draft {
  id: string | null;
  title: string;
  note: string;
  date: string;
}

/**
 * The album.
 *
 * This used to be a single column of images at whatever size the camera
 * produced, one per memory — so a square logo and a wide screenshot came out
 * as two completely different shapes, and an afternoon that produced six
 * photographs had to be entered six times. Neither is how anybody remembers
 * a day.
 *
 * Now a memory is a page: one story, one date, and however many photographs
 * belong to it. The grid crops every cover to the same portrait rectangle,
 * because a tidy timeline is the point of a grid; the lightbox never crops,
 * because once you have chosen to look at something you should see all of
 * it. A page with more than one photograph shows it — stacked paper behind
 * the cover, and a count — so the timeline reads as an album rather than a
 * list of files.
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
  const photos = useCoupleTable('memory_photos', {
    coupleId: couple.id,
    orderBy: 'sort_order',
    ascending: true,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [openSlide, setOpenSlide] = useState(-1);
  const newMemoryFiles = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const photoUrls = useSignedUrls(photos.rows.map((row) => row.path));

  const books = useMemo(
    () => buildBooks(memories.rows, photos.rows),
    [memories.rows, photos.rows],
  );
  const slides = useMemo(() => flattenAlbum(books), [books]);

  const groups = useMemo(
    () =>
      groupByMonth(
        books.filter((book) => parseISODate(book.memory.date) !== null),
        (book) => parseISODate(book.memory.date)!,
      ),
    [books],
  );

  function startNew() {
    setDraft({ id: null, title: '', note: '', date: toISODate(today) });
    setPendingFiles([]);
    setUploadError(null);
  }

  function startEdit(row: MemoryRow) {
    setDraft({ id: row.id, title: row.title, note: row.note ?? '', date: row.date });
    setPendingFiles([]);
    setUploadError(null);
  }

  /**
   * Uploads files and hangs them off a memory.
   *
   * Sequential rather than parallel: a phone on a hotel connection uploading
   * six photographs at once tends to fail all six, and one at a time means a
   * failure costs one photograph rather than the afternoon.
   */
  async function attachPhotos(memoryId: string, files: readonly File[], startAt: number) {
    let order = startAt;
    for (const file of files) {
      try {
        const path = await uploadMedia(couple.id, 'memories', file);
        await photos.create({ memory_id: memoryId, path, sort_order: order });
        order += 1;
      } catch (caught) {
        setUploadError(
          caught instanceof UploadError && caught.reason === 'too_large'
            ? s.errors.uploadTooLarge
            : s.errors.uploadFailed,
        );
        return;
      }
    }
  }

  async function onAddPhotosToMemory(memoryId: string, files: FileList) {
    const existing = photos.rows.filter((row) => row.memory_id === memoryId);
    await attachPhotos(memoryId, Array.from(files), nextSortOrder(existing));
  }

  async function onRemovePhoto(photo: MemoryPhotoRow) {
    await photos.remove(photo.id);
    await removeMedia(photo.path);
    // Stepping back keeps you next to where you were rather than jumping to
    // whatever slid into that index.
    setOpenSlide((current) => Math.max(-1, Math.min(current, slides.length - 2)));
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.title.trim() || !draft.date) return;

    setSaving(true);
    setUploading(pendingFiles.length > 0);
    const values = {
      title: draft.title.trim(),
      note: draft.note.trim() || null,
      date: draft.date,
    };

    const memoryId = draft.id
      ? ((await memories.update(draft.id, values))?.id ?? draft.id)
      : (await memories.create({ ...values, couple_id: couple.id }))?.id;

    if (memoryId && pendingFiles.length > 0) {
      const existing = photos.rows.filter((row) => row.memory_id === memoryId);
      await attachPhotos(memoryId, pendingFiles, nextSortOrder(existing));
    }

    setUploading(false);
    setSaving(false);
    setPendingFiles([]);
    setDraft(null);
  }

  async function onDeleteMemory(row: MemoryRow) {
    const owned = photos.rows.filter((photo) => photo.memory_id === row.id);
    await memories.remove(row.id);
    // The rows go with the memory by cascade; the objects in the bucket do
    // not, and an orphaned photograph of the two of them is a slow leak.
    for (const photo of owned) await removeMedia(photo.path);
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
      ) : books.length === 0 ? (
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

              <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
                {group.items.map((book, index) => (
                  <BookTile
                    key={book.memory.id}
                    book={book}
                    index={index}
                    url={book.cover ? photoUrls[book.cover.path] : undefined}
                    dateLabel={
                      parseISODate(book.memory.date)
                        ? formatDate(parseISODate(book.memory.date)!, 'dayMonth', intlLocale)
                        : book.memory.date
                    }
                    onOpen={() => {
                      if (!book.cover) return;
                      setOpenSlide(slideIndexOf(slides, book.cover.id));
                    }}
                    onEdit={() => startEdit(book.memory)}
                    onDelete={() => void onDeleteMemory(book.memory)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Lightbox
        slides={slides}
        index={openSlide}
        urls={photoUrls}
        onClose={() => setOpenSlide(-1)}
        onIndexChange={setOpenSlide}
        onAddPhotos={onAddPhotosToMemory}
        onRemovePhoto={onRemovePhoto}
        formatDate={(iso) => {
          const date = parseISODate(iso);
          return date ? formatDate(date, 'long', intlLocale) : iso;
        }}
      />

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
                ref={newMemoryFiles}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => newMemoryFiles.current?.click()} disabled={uploading}>
                  {uploading ? <Spinner /> : <ImagePlus className="h-4 w-4" />}
                  {uploading ? s.memories.uploading : s.memories.photoAdd}
                </Button>
                {pendingFiles.length > 0 && (
                  <span className="text-sm text-ink-soft">
                    {s.memories.pageCount(pendingFiles.length)}
                  </span>
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

/**
 * One page of the album, as a tile.
 *
 * Every cover is the same portrait rectangle and cropped to fill it. That is
 * the whole fix for the old layout: a grid whose cells are all different
 * shapes is not a grid, and the eye spends its time on the ragged edges
 * instead of on the photographs.
 *
 * A page holding more than one photograph says so twice — a sheet of paper
 * peeking out behind the cover, and a count — because the stack is what
 * makes it read as an album at a glance, and the number is what makes it
 * legible to somebody who cannot see the stack.
 */
function BookTile({
  book,
  index,
  url,
  dateLabel,
  onOpen,
  onEdit,
  onDelete,
}: {
  book: Book<MemoryRow, MemoryPhotoRow>;
  index: number;
  url: string | undefined;
  dateLabel: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const s = useStrings();
  const many = book.photos.length > 1;

  return (
    <m.li
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: Math.min(index, 7) * 0.035, ease: [0.2, 0.7, 0.3, 1] }}
      className="group relative"
    >
      <div className="relative">
        {/* The stack. Two sheets, offset a degree or so, the way a pile of
            prints actually sits — not a drop shadow pretending to be depth. */}
        {many && (
          <>
            <span
              aria-hidden="true"
              className="absolute inset-0 translate-x-[6px] translate-y-[6px] rotate-[1.8deg] rounded-sm border border-rule bg-raised shadow-card"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 translate-x-[3px] translate-y-[3px] rotate-[0.9deg] rounded-sm border border-rule bg-raised shadow-card"
            />
          </>
        )}

        <button
          type="button"
          onClick={onOpen}
          disabled={!book.cover}
          aria-label={s.memories.openBook(book.memory.title)}
          className={cn(
            'relative block w-full overflow-hidden rounded-sm border border-rule bg-sunk',
            'aspect-[4/5] transition-[transform,border-color] duration-300 ease-page',
            book.cover && 'hover:-translate-y-0.5 hover:border-ink-faint',
            !book.cover && 'cursor-default',
          )}
        >
          {book.cover ? (
            url ? (
              <img
                src={url}
                alt={s.memories.photoAlt(book.memory.title)}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 ease-page group-hover:scale-[1.03]"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <Spinner />
              </span>
            )
          ) : (
            <span className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-ink-faint">
              {s.memories.noPhotos}
            </span>
          )}

          {many && (
            <span className="absolute bottom-2 right-2 rounded-sm bg-ink/65 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-paper backdrop-blur-[2px]">
              {book.photos.length}
            </span>
          )}
        </button>
      </div>

      <div className="mt-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-ink-faint">{dateLabel}</p>
          <h3 className="display-warm truncate font-display text-base font-medium leading-snug text-ink">
            {book.memory.title}
          </h3>
          {book.memory.note && (
            <p className="mt-0.5 line-clamp-2 text-pretty text-xs leading-relaxed text-ink-soft">
              {book.memory.note}
            </p>
          )}
        </div>
        {/* Held back until the tile is hovered or focused within, so a page
            of photographs is not covered in controls. */}
        <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <RecordActions onEdit={onEdit} onDelete={onDelete} />
        </span>
      </div>
    </m.li>
  );
}
