import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'framer-motion';
import { X } from 'lucide-react';
import { Button, IconButton } from './Button';
import { useStrings } from '@/i18n';
import { cn } from '@/utils/cn';

/**
 * A dialog that rises from the bottom on a phone and settles in the middle on
 * a larger screen — because this app is used on a phone first, and a centred
 * modal is awkward one-handed.
 *
 * Focus moves in on open and returns to wherever it came from on close;
 * Escape and a click on the backdrop both dismiss.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const s = useStrings();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;

    returnFocusTo.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Land on the first real control rather than the close button, so opening
    // a form and typing works without a detour.
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, [data-autofocus]',
      );
      (focusable ?? panelRef.current)?.focus();
    }, 60);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = overflow;
      if (returnFocusTo.current instanceof HTMLElement) returnFocusTo.current.focus();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/35"
          />
          <m.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.26, ease: [0.2, 0.7, 0.3, 1] }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col border-t border-rule bg-raised shadow-lift',
              'rounded-t-lg sm:rounded-lg sm:border',
              wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
            )}
          >
            <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
              <div className="min-w-0">
                <h2 id={titleId} className="font-display text-xl font-medium text-ink">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-ink-soft">
                    {description}
                  </p>
                )}
              </div>
              <IconButton label={s.common.close} onClick={onClose} className="-mr-1 -mt-1">
                <X />
              </IconButton>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">{children}</div>

            {footer && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-rule px-5 py-4 safe-bottom">
                {footer}
              </div>
            )}
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = true,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  const s = useStrings();
  return (
    <Modal open={open} onClose={onCancel} title={title} description={body}>
      <div className="pb-2" />
      <div className="flex justify-end gap-2 pb-4">
        <Button onClick={onCancel} data-autofocus>
          {s.common.cancel}
        </Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
