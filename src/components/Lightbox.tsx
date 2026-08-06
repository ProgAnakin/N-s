import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'framer-motion';
import { ChevronLeft, ChevronRight, ImagePlus, Trash2, X } from 'lucide-react';
import { stepSlide, type AlbumSlide, type MemoryLike, type PhotoLike } from '@/lib/album';
import { useStrings } from '@/i18n';
import { cn } from '@/utils/cn';

/**
 * A photograph, mounted.
 *
 * The frame is doing real work. A raw image on a black scrim is a file
 * viewer; a print with a paper margin, a hairline and its story set beside
 * it is a page of an album, and this app is an album. So the photograph gets
 * an ivory mount, the caption sits on the mount rather than over the image,
 * and nothing is ever cropped here — the grid crops to keep the timeline
 * tidy, but once you have chosen to look at something you see all of it.
 *
 * The arrows run through the entire album rather than the current memory, so
 * you can start on an afternoon in March and keep going into April without
 * closing anything. That is the difference between browsing together and
 * opening files.
 */
export function Lightbox<M extends MemoryLike, P extends PhotoLike>({
  slides,
  index,
  urls,
  onClose,
  onIndexChange,
  onAddPhotos,
  onRemovePhoto,
  formatDate,
}: {
  slides: AlbumSlide<M, P>[];
  /** Which slide is showing. -1 closes it. */
  index: number;
  /** Signed URLs by storage path. A missing one renders as a quiet gap. */
  urls: Record<string, string>;
  onClose: () => void;
  onIndexChange: (next: number) => void;
  onAddPhotos: (memoryId: string, files: FileList) => Promise<void>;
  onRemovePhoto: (photo: P) => Promise<void>;
  formatDate: (iso: string) => string;
}) {
  const s = useStrings();
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const returnFocusTo = useRef<Element | null>(null);
  const [busy, setBusy] = useState(false);

  const open = index >= 0 && index < slides.length;
  const slide = open ? slides[index] : undefined;

  const go = useCallback(
    (delta: number) => {
      onIndexChange(stepSlide(index, delta, slides.length));
    },
    [index, slides.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;

    returnFocusTo.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
      else return;
      event.preventDefault();
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (returnFocusTo.current instanceof HTMLElement) returnFocusTo.current.focus();
    };
  }, [open, onClose, go]);

  if (!open || !slide) return null;

  const url = urls[slide.photo.path];
  const atStart = index === 0;
  const atEnd = index === slides.length - 1;

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0 || !slide) return;
    setBusy(true);
    try {
      await onAddPhotos(slide.memory.id, files);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return createPortal(
    <AnimatePresence>
      <m.div
        role="dialog"
        aria-modal="true"
        aria-label={slide.memory.title}
        ref={panelRef}
        tabIndex={-1}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[80] flex flex-col bg-ink/85 outline-none backdrop-blur-[3px]"
      >
        {/* --- The bar ---------------------------------------------------- */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <span className="text-xs tabular-nums text-paper/60">
            {s.memories.slideCount(index + 1, slides.length)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={s.common.close}
            className="rounded-sm p-2 text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* --- The print, and its story ------------------------------------ */}
        <div className="mx-auto flex min-h-0 w-full max-w-[92rem] flex-1 flex-col gap-4 px-4 pb-4 lg:flex-row lg:items-center lg:gap-8 lg:px-8 lg:pb-8">
          {/* The horizontal padding is the arrows' gutter. Without it a wide
              photograph fills the column and the arrows land on top of the
              picture, covering the very thing you opened it to see. */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 sm:px-14">
            <PageArrow
              side="left"
              disabled={atStart}
              label={s.memories.previousPhoto}
              onClick={() => go(-1)}
            />

            {/* The mount: ivory paper with the print sitting on it, rather
                than an image floating on a scrim. */}
            <m.figure
              key={slide.photo.id}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
              className="flex max-h-full min-h-0 flex-col rounded-sm bg-paper p-2 shadow-lift sm:p-3"
            >
              {url ? (
                <img
                  src={url}
                  alt={slide.photo.caption ?? slide.memory.title}
                  className="max-h-[62dvh] min-h-0 w-auto rounded-[2px] object-contain lg:max-h-[74dvh]"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center rounded-[2px] bg-sunk text-sm text-ink-faint">
                  {s.common.loading}
                </div>
              )}
              {slide.photo.caption && (
                <figcaption className="px-1 pb-0.5 pt-2 text-center text-xs text-ink-soft">
                  {slide.photo.caption}
                </figcaption>
              )}
            </m.figure>

            <PageArrow
              side="right"
              disabled={atEnd}
              label={s.memories.nextPhoto}
              onClick={() => go(1)}
            />
          </div>

          {/* --- Beside it on a desk, underneath it on a phone ------------- */}
          <aside className="shrink-0 overflow-y-auto lg:w-72">
            <p className="label-kicker mb-1.5 text-paper/50">
              {formatDate(slide.memory.date)}
            </p>
            <h2 className="display-warm font-display text-2xl font-medium text-paper">
              {slide.memory.title}
            </h2>
            {slide.memory.note && (
              <p className="mt-2 text-pretty text-sm leading-relaxed text-paper/70">
                {slide.memory.note}
              </p>
            )}

            {slide.countInBook > 1 && (
              <p className="mt-3 text-xs text-paper/50">
                {s.memories.photoOf(slide.indexInBook, slide.countInBook)}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {/* Adding from in here is what turns one photograph into an
                  afternoon: you are already looking at the day. */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-sm border border-paper/25 px-3 py-2 text-sm text-paper transition-colors hover:border-paper/50 hover:bg-paper/10 disabled:opacity-60"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {busy ? s.common.saving : s.memories.addPhotos}
              </button>

              <button
                type="button"
                onClick={() => void onRemovePhoto(slide.photo)}
                className="inline-flex items-center gap-2 rounded-sm border border-transparent px-3 py-2 text-sm text-paper/60 transition-colors hover:bg-paper/10 hover:text-paper"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {s.memories.removePhoto}
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void addFiles(event.target.files)}
            />
          </aside>
        </div>
      </m.div>
    </AnimatePresence>,
    document.body,
  );
}

/**
 * The page-turn arrows.
 *
 * Overlaid rather than placed beside, so the print stays as large as the
 * screen allows; disabled at the ends rather than hidden, because a control
 * that vanishes makes you wonder whether you broke something.
 */
function PageArrow({
  side,
  disabled,
  label,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'absolute top-1/2 z-10 -translate-y-1/2 rounded-full border border-paper/20 bg-ink/40 p-2 text-paper backdrop-blur-sm transition-colors',
        'hover:bg-ink/70 disabled:pointer-events-none disabled:opacity-25',
        side === 'left' ? 'left-0' : 'right-0',
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
