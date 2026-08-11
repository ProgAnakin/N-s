import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'framer-motion';
import { ImagePlus, Pencil, Trash2, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Bits';
import type { Book, MemoryLike, PhotoLike } from '@/lib/album';
import { useStrings } from '@/i18n';
import { cn } from '@/utils/cn';

/**
 * A memory, opened.
 *
 * Tapping a tile used to go straight to the lightbox, which answered the
 * wrong question. The lightbox is for looking at one photograph; this is
 * for reading a day — the story set at a proper measure, with the
 * photographs around it rather than the story squeezed into a column
 * beside a picture.
 *
 * It also fixes a real hole: a memory with no photographs could not be
 * opened at all, because the tile was disabled without a cover. Somebody
 * who wrote three paragraphs and attached nothing had no way to read them
 * back, which is the opposite of what an album is for.
 *
 * The visual grammar is a page rather than a modal: the cover bleeds to
 * the edges under a scrim, the date and title sit on it the way a caption
 * sits on a printed plate, and the story below is set in a single column
 * at reading width. Nothing is cropped in the filmstrip — those are
 * contact prints, and a contact sheet you cannot read is decoration.
 */
export function MemorySheet<M extends MemoryLike, P extends PhotoLike>({
  book,
  urls,
  dateLabel,
  onClose,
  onOpenPhoto,
  onAddPhotos,
  onEdit,
  onDelete,
}: {
  book: Book<M, P> | null;
  urls: Record<string, string>;
  dateLabel: string;
  onClose: () => void;
  onOpenPhoto: (photo: P) => void;
  onAddPhotos: (memoryId: string, files: FileList) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const s = useStrings();
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const returnFocusTo = useRef<Element | null>(null);
  const open = book !== null;

  useEffect(() => {
    if (!open) return;

    returnFocusTo.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      // Focus goes back to the tile that opened it, not to the top of the
      // page — otherwise closing a memory halfway down a long album loses
      // your place entirely.
      if (returnFocusTo.current instanceof HTMLElement) returnFocusTo.current.focus();
    };
  }, [open, onClose]);

  if (!book) return null;

  const cover = book.cover;
  const coverUrl = cover ? urls[cover.path] : undefined;
  const rest = book.photos;

  return createPortal(
    <AnimatePresence>
      <m.div
        role="dialog"
        aria-modal="true"
        aria-label={book.memory.title}
        ref={panelRef}
        tabIndex={-1}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[75] overflow-y-auto bg-ink/70 outline-none backdrop-blur-[3px]"
        onClick={(event) => {
          // Only the scrim closes it. Without the target check, a click
          // that started on the text and drifted counts as a dismissal.
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <m.article
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.32, ease: [0.2, 0.7, 0.3, 1] }}
          className="mx-auto my-0 w-full max-w-3xl overflow-hidden bg-paper shadow-lift sm:my-8 sm:rounded-sm"
        >
          {/* --- The plate ------------------------------------------------ */}
          <header className="relative">
            {cover ? (
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-sunk">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={s.memories.photoAlt(book.memory.title)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    <Spinner />
                  </span>
                )}
                {/* The scrim is what lets the title sit on the picture at
                    all: without it a pale sky makes white text vanish and
                    a dark one makes it shout. */}
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/85 via-ink/30 to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                  <p className="label-kicker mb-1 text-paper/70">{dateLabel}</p>
                  <h2 className="display-warm text-balance font-display text-2xl font-medium leading-tight text-paper sm:text-3xl">
                    {book.memory.title}
                  </h2>
                </div>
              </div>
            ) : (
              /* A memory with no photographs is a written page, not a
                 broken image. Given its own treatment rather than an
                 empty frame, so it reads as deliberate. */
              <div className="border-b border-rule px-5 pb-5 pt-8 sm:px-7">
                <p className="label-kicker mb-1">{dateLabel}</p>
                <h2 className="display-warm text-balance font-display text-2xl font-medium leading-tight text-ink sm:text-3xl">
                  {book.memory.title}
                </h2>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label={s.common.close}
              className={cn(
                'absolute right-3 top-3 rounded-full p-2 transition-colors',
                cover
                  ? 'bg-ink/40 text-paper backdrop-blur-sm hover:bg-ink/70'
                  : 'text-ink-faint hover:bg-sunk hover:text-ink',
              )}
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {/* --- The story ------------------------------------------------ */}
          <div className="px-5 py-6 sm:px-7 sm:py-8">
            {book.memory.note ? (
              /* One column at reading width, not the full width of the
                 sheet. A line of prose longer than about seventy
                 characters is measurably harder to come back to on the
                 next line, and this is text meant to be reread. */
              <p className="max-w-prose text-pretty font-display text-[1.0625rem] leading-[1.75] text-ink [white-space:pre-wrap]">
                {book.memory.note}
              </p>
            ) : (
              <p className="text-sm italic text-ink-faint">{s.memories.noStory}</p>
            )}

            {/* --- The contact sheet -------------------------------------- */}
            {rest.length > 0 && (
              <div className="mt-7">
                <h3 className="label-kicker mb-3">{s.memories.pageCount(rest.length)}</h3>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {rest.map((photo) => (
                    <li key={photo.id}>
                      <button
                        type="button"
                        onClick={() => onOpenPhoto(photo)}
                        aria-label={s.memories.openPhoto}
                        className="group block aspect-square w-full overflow-hidden rounded-sm border border-rule bg-sunk transition-colors hover:border-ink-faint"
                      >
                        {urls[photo.path] ? (
                          <img
                            src={urls[photo.path]}
                            alt={photo.caption ?? ''}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-500 ease-page group-hover:scale-105"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center">
                            <Spinner />
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* --- What you can do from here ------------------------------ */}
            <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-rule pt-5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-sm border border-rule px-3 py-2 text-sm text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {s.memories.addPhotos}
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-2 rounded-sm border border-rule px-3 py-2 text-sm text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" />
                {s.common.edit}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto inline-flex items-center gap-2 rounded-sm px-3 py-2 text-sm text-ink-faint transition-colors hover:bg-sunk hover:text-ink"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {s.common.delete}
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = event.target.files;
                event.target.value = '';
                if (files && files.length > 0) void onAddPhotos(book.memory.id, files);
              }}
            />
          </div>
        </m.article>
      </m.div>
    </AnimatePresence>,
    document.body,
  );
}
