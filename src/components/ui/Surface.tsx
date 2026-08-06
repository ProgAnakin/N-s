import type { ReactNode } from 'react';
import { m } from 'framer-motion';
import { Curve } from './Curve';
import { cn } from '@/utils/cn';

/** A sheet of paper laid on the desk. */
export function Sheet({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section' | 'li';
}) {
  return <Tag className={cn('sheet p-4', className)}>{children}</Tag>;
}

/**
 * The top of every page: a small kicker, the title in the display face, the
 * signature curve, and room to breathe. The generous space above and below is
 * deliberate — negative space is a load-bearing part of this design, not
 * padding left over.
 */
export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
  className,
}: {
  kicker?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-7 pt-2', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {kicker && <p className="label-kicker mb-2">{kicker}</p>}
          <h1 className="display-warm text-balance font-display text-3xl font-medium text-ink sm:text-4xl">
            {title}
          </h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
      </div>
      <Curve className="mt-3" />
      {subtitle && (
        <p className="mt-3 max-w-column text-pretty text-base leading-relaxed text-ink-soft">
          {subtitle}
        </p>
      )}
    </header>
  );
}

export function SectionHeading({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-3', className)}>
      <h2 className="font-display text-lg font-medium text-ink">{children}</h2>
      {action}
    </div>
  );
}

/**
 * Empty states.
 *
 * Every one of these is an invitation rather than a report. "Nothing here"
 * is a dead end; "the first page is blank, start anywhere" is a prompt. In an
 * app this personal, the empty state is most of the first impression.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.7, 0.3, 1] }}
      className={cn(
        'flex flex-col items-center rounded-md border border-dashed border-rule/80 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="mb-4 text-cinnabar/70 [&>svg]:h-6 [&>svg]:w-6">{icon}</div>}
      <h3 className="font-display text-xl font-medium text-ink">{title}</h3>
      {body && (
        <p className="mt-2 max-w-[36ch] text-pretty text-sm leading-relaxed text-ink-soft">{body}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </m.div>
  );
}

/** A hairline that reads as a brush stroke rather than a table border. */
export function Rule({ className }: { className?: string }) {
  return <div className={cn('rule-ink my-6', className)} aria-hidden="true" />;
}
