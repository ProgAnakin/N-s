import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { FileText, Upload } from 'lucide-react';
import { ACCEPTED_DOCUMENTS } from '@/lib/documents';
import { cn } from '@/utils/cn';

/**
 * Dropping a file onto a page.
 *
 * Two things make this harder than it looks, and both are why it is a
 * component rather than four lines in a screen.
 *
 * **`dragleave` fires constantly.** Moving the cursor from the page onto a
 * child element inside it fires `dragleave` on the parent, so the naive
 * version flickers the overlay on and off the whole way across the screen.
 * A depth counter fixes it: enter increments, leave decrements, and the
 * overlay is up while the count is above zero.
 *
 * **The window has to take the drop too.** Without a listener on the
 * window, a file dropped a few pixels off target is opened by the browser
 * — navigating away from the app, losing whatever was half-typed. So the
 * whole window refuses drops by default, and the zone accepts them.
 */
export function DropZone({
  onFile,
  title,
  hint,
  disabled = false,
  children,
}: {
  onFile: (file: File) => void | Promise<void>;
  title: string;
  hint: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const reset = useCallback(() => {
    depth.current = 0;
    setDragging(false);
  }, []);

  /*
   * A file dropped anywhere but the zone is swallowed rather than opened.
   * The default browser behaviour is to navigate to the file, which in a
   * single-page app means the letter you were writing is simply gone.
   */
  useEffect(() => {
    function swallow(event: DragEvent) {
      event.preventDefault();
    }
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  if (disabled) return <>{children}</>;

  function carriesFiles(event: React.DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }

  return (
    <div
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return;
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        // Without this the cursor shows "no entry" over a zone that will
        // in fact accept the file.
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        depth.current -= 1;
        if (depth.current <= 0) reset();
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        reset();
        const file = event.dataTransfer.files?.[0];
        // One at a time. A letter is one letter; taking the first and
        // saying nothing about the rest would be the confusing option, so
        // the hint says what this accepts before anything is dropped.
        if (file) void onFile(file);
      }}
      className="relative"
    >
      {children}

      <AnimatePresence>
        {dragging && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            // Not interactive: the drop is handled by the wrapper, and a
            // pointer-events overlay would swallow the event it exists to
            // announce.
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-sm border-2 border-dashed border-cinnabar/70 bg-paper/92 backdrop-blur-[2px]"
          >
            <div className="flex max-w-sm flex-col items-center px-6 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-cinnabar/12 text-cinnabar">
                <Upload className="h-5 w-5" />
              </span>
              <p className="font-display text-lg font-medium text-ink">{title}</p>
              <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-soft">{hint}</p>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The same thing as a button, for anyone not using a mouse.
 *
 * Drag and drop is unusable with a keyboard, and on a phone there is
 * nothing to drag from. A feature that exists only as a drop target exists
 * only for people on a desktop with a file manager open.
 */
export function FilePickButton({
  onFile,
  label,
  busy = false,
  className,
}: {
  onFile: (file: File) => void | Promise<void>;
  label: string;
  busy?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className={cn(
          'inline-flex items-center gap-2 rounded-sm border border-rule px-3 py-2 text-sm text-ink-soft transition-colors',
          'hover:border-ink-faint hover:text-ink disabled:opacity-60',
          className,
        )}
      >
        <FileText className="h-3.5 w-3.5" />
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_DOCUMENTS}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same file twice in a row still fires.
          event.target.value = '';
          if (file) void onFile(file);
        }}
      />
    </>
  );
}
