import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, m } from 'framer-motion';
import {
  CalendarDays,
  Compass,
  Images,
  Languages,
  Lightbulb,
  Lock,
  Luggage,
  Mail,
  MapPin,
  NotebookPen,
  Scale,
  Search,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Bits';
import { useSearchIndex } from '@/data/useSearchIndex';
import { groupByKind, search, type Hit, type ResultKind } from '@/lib/search';
import { useStrings } from '@/i18n';
import { cn } from '@/utils/cn';

/**
 * Finding it again.
 *
 * The app had sixteen places to put something and no way to get any of it
 * back. That is fine in the first month and quietly fatal in the third year:
 * a couple who wrote down the answer and cannot find it are exactly where
 * they were before they wrote it down.
 *
 * It is an overlay rather than a seventeenth destination, on purpose. Search
 * is a thing you do *from* wherever you are, and making it a page means
 * leaving the page you were on to look something up and then having to find
 * your way back.
 *
 * Two details that matter more than they look:
 *
 * **It reads nothing until it is opened.** Ten tables is a lot to pay for a
 * box nobody used, so the whole index is gated behind `open`.
 *
 * **It shows the words, not a summary.** Same rule as everywhere else — the
 * app quotes. The matched span is marked inside the sentence it came from,
 * so what you read is what somebody actually wrote.
 */

const ICONS: Record<ResultKind, LucideIcon> = {
  memory: Images,
  letter: Mail,
  note: NotebookPen,
  phrase: Languages,
  culture: Compass,
  person: Users,
  idea: Lightbulb,
  place: MapPin,
  expense: Scale,
  date: CalendarDays,
  trip: Luggage,
};

/** How many to draw. Beyond this nobody is reading, they are re-typing. */
const SHOWN = 30;

export function FindOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStrings();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusTo = useRef<Element | null>(null);
  const [query, setQuery] = useState('');

  const { items, loading } = useSearchIndex(open);
  const hits = useMemo(() => search(query, items).slice(0, SHOWN), [query, items]);
  const groups = useMemo(() => groupByKind(hits), [hits]);

  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();

    return () => {
      document.body.style.overflow = overflow;
      // Back to whatever opened it. Somebody who looked something up mid-way
      // through writing a letter should land back in the letter.
      if (returnFocusTo.current instanceof HTMLElement) returnFocusTo.current.focus();
    };
  }, [open]);

  // Cleared on close rather than on open, so the overlay never flashes the
  // previous search on its way out.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    navigate(href);
  }

  return createPortal(
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        role="dialog"
        aria-modal="true"
        aria-label={s.find.title}
        className="fixed inset-0 z-[80] overflow-y-auto bg-ink/60 backdrop-blur-[3px]"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <m.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
          className="mx-auto mt-0 w-full max-w-2xl overflow-hidden bg-paper shadow-lift sm:mt-[8vh] sm:rounded-sm"
        >
          <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-ink-faint" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={s.find.placeholder}
              aria-label={s.find.title}
              className="min-w-0 flex-1 bg-transparent py-1 text-base text-ink outline-none placeholder:text-ink-faint"
            />
            {loading && <Spinner />}
            <button
              type="button"
              onClick={onClose}
              aria-label={s.common.close}
              className="-m-1 shrink-0 rounded-sm p-1 text-ink-faint transition-colors hover:bg-sunk hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[70dvh] overflow-y-auto px-4 py-4">
            {query.trim() === '' ? (
              <p className="py-6 text-center text-sm leading-relaxed text-ink-soft">
                {s.find.hint}
              </p>
            ) : hits.length === 0 ? (
              <p className="py-6 text-center text-sm leading-relaxed text-ink-soft">
                {loading ? s.find.stillLooking : s.find.nothing(query.trim())}
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                {groups.map((group) => (
                  <section key={group.kind}>
                    <h2 className="label-kicker mb-2">
                      {s.find.kinds[group.kind]} · {group.hits.length}
                    </h2>
                    <ul className="flex flex-col">
                      {group.hits.map((hit) => (
                        <li key={`${hit.item.kind}-${hit.item.id}`}>
                          <Result hit={hit} onOpen={() => go(hit.item.href)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </m.div>
      </m.div>
    </AnimatePresence>,
    document.body,
  );
}

function Result({ hit, onOpen }: { hit: Hit; onOpen: () => void }) {
  const s = useStrings();
  const Icon = ICONS[hit.item.kind];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-start gap-3 border-b border-rule py-2.5 text-left last:border-0 hover:bg-sunk/60"
    >
      <Icon className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-faint" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-base text-ink">{hit.item.title}</span>
          {/* Yours alone. Said on the row rather than left to be inferred
              from which page it came from. */}
          {hit.item.onlyMine && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint">
              <Lock className="h-3 w-3" />
              {s.find.onlyYou}
            </span>
          )}
        </span>
        {/* The words, not a summary. The match is marked inside the sentence
            it came from, which is the whole reason a quote beats a label. */}
        {hit.quote && (
          <span className="mt-0.5 block text-sm leading-relaxed text-ink-soft">
            {hit.quote.before}
            {/* `/20`, not `/18`: Tailwind only emits opacities on its own
                scale, so an off-scale one is silently dropped and the
                browser's default yellow `mark` shows through instead. */}
            <mark className="rounded-[2px] bg-cinnabar/20 px-0.5 text-ink">
              {hit.quote.match}
            </mark>
            {hit.quote.after}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The way in.
 *
 * Also bound to `/` and to ⌘K, because anybody who has used a search box in
 * the last decade will try one of them before looking for a button.
 */
export function FindButton({ className }: { className?: string }) {
  const s = useStrings();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        return;
      }
      // A bare slash only when nothing is being typed into — otherwise it
      // eats the character out of the letter somebody is writing.
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-2 rounded-sm border border-rule px-2.5 py-1.5 text-sm text-ink-faint transition-colors',
          'hover:border-ink-faint hover:text-ink',
          className,
        )}
      >
        <Search className="h-3.5 w-3.5" />
        <span>{s.find.title}</span>
      </button>
      <FindOverlay open={open} onClose={() => setOpen(false)} />
    </>
  );
}
