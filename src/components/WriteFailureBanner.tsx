import { AlertTriangle, X } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { clearWriteFailure, useWriteFailure } from '@/data/write-status';
import type { WriteFailure } from '@/data/client';
import { useStrings } from '@/i18n';

/**
 * What the app says when a change did not save.
 *
 * Most writes in Settings are fired and forgotten — a toggle, a chip, a
 * select. When one of those fails there is nothing to catch it, nothing on
 * screen moves, and a broken control is indistinguishable from a working
 * one. That is not a hypothetical: an entire settings section appeared to be
 * dead because its migration had not been run, and the app said nothing at
 * all about it.
 *
 * So the failure gets a name. `missing_schema` in particular says exactly
 * what to do, because "run the migrations" is a five-second fix that is
 * otherwise an afternoon of guessing.
 *
 * It sits above the phone's bottom bar rather than at the top of the page:
 * Settings is long, and a banner you have to scroll up to find is a banner
 * you do not see.
 */
export function WriteFailureBanner() {
  const s = useStrings();
  const writeFailure = useWriteFailure();

  return (
    <AnimatePresence>
      {writeFailure && (
        <m.div
          role="alert"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
          className="fixed inset-x-0 bottom-[4.5rem] z-[60] px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:w-[26rem] lg:px-0"
        >
          <div className="mx-auto flex max-w-lg items-start gap-3 rounded-sm border border-cinnabar/45 bg-raised p-4 shadow-lift">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-cinnabar" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-medium text-ink">{s.errors.writeTitle}</p>
              <p className="mt-1 text-pretty text-xs leading-relaxed text-ink-soft">
                {messageFor(writeFailure, s)}
              </p>
            </div>
            <button
              type="button"
              onClick={clearWriteFailure}
              aria-label={s.errors.writeDismiss}
              className="-m-1 shrink-0 rounded-sm p-1 text-ink-faint transition-colors hover:bg-sunk hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

function messageFor(failure: WriteFailure, s: ReturnType<typeof useStrings>): string {
  switch (failure) {
    case 'missing_schema':
      return s.errors.writeMissingSchema;
    case 'not_allowed':
      return s.errors.writeNotAllowed;
    case 'rejected':
      return s.errors.writeRejected;
    case 'offline':
      return s.errors.writeOffline;
    default:
      return s.errors.writeUnknown;
  }
}
