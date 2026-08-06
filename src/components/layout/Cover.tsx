import type { ReactNode } from 'react';
import { m } from 'framer-motion';
import { Curve } from '@/components/ui/Curve';
import { Seal } from '@/components/ui/Seal';
import { useStrings } from '@/i18n';

/**
 * The cover of the book.
 *
 * Used for everything before you are inside the app: setup, signing in,
 * pairing. One seal, one title, one curve, and a lot of paper around it.
 */
export function Cover({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const s = useStrings();

  return (
    <div className="grain flex min-h-dvh flex-col items-center justify-center bg-paper px-5 py-12">
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <Seal name={s.app.name} size="lg" press />
          <h1 className="display-warm mt-5 font-display text-4xl font-medium text-ink">{title}</h1>
          <Curve className="mt-2 max-w-[180px]" />
          {subtitle && (
            <p className="mt-3 max-w-[34ch] text-pretty text-base leading-relaxed text-ink-soft">
              {subtitle}
            </p>
          )}
        </div>

        {children}
      </m.div>

      {footer && <div className="mt-8 w-full max-w-md">{footer}</div>}
    </div>
  );
}
