import type { ReactNode } from 'react';
import { Eye, Lock } from 'lucide-react';
import { useStrings } from '@/i18n';
import { cn } from '@/utils/cn';

/** A filter chip. Reads as a paper tab, not a pill button. */
export function Chip({
  children,
  selected = false,
  onClick,
  className,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'whitespace-nowrap rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors',
        selected
          ? 'border-stamp bg-stamp text-on-stamp'
          : 'border-rule bg-raised text-ink-soft hover:border-ink-faint hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A small non-interactive marker. */
export function Tag({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'cinnabar' | 'jade';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-sunk text-ink-soft',
        tone === 'cinnabar' && 'bg-cinnabar/12 text-cinnabar',
        tone === 'jade' && 'bg-jade/14 text-jade',
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The shared/private marker.
 *
 * Visible on every note that has a visibility, because the one thing this app
 * must never do is leave someone unsure who can read what they just wrote.
 */
export function VisibilityBadge({
  visibility,
  className,
}: {
  visibility: 'shared' | 'private';
  className?: string;
}) {
  const s = useStrings();
  const isPrivate = visibility === 'private';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium',
        isPrivate ? 'bg-ink/8 text-ink-soft' : 'bg-jade/14 text-jade',
        className,
      )}
    >
      {isPrivate ? <Lock className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      {isPrivate ? s.common.private : s.common.shared}
    </span>
  );
}

export function ProgressBar({
  percent,
  tone = 'cinnabar',
  label,
  className,
}: {
  percent: number;
  tone?: 'cinnabar' | 'jade';
  label?: string;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-sunk', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-page',
          tone === 'cinnabar' ? 'bg-cinnabar' : 'bg-jade',
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  const s = useStrings();
  return (
    <span
      role="status"
      aria-label={label ?? s.common.loading}
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-rule border-t-cinnabar',
        className,
      )}
    />
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  const s = useStrings();
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-faint">
      <Spinner />
      {label ?? s.common.loading}
    </div>
  );
}

/** A headline figure with its label underneath. */
export function Stat({
  value,
  label,
  tone = 'ink',
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  tone?: 'ink' | 'cinnabar' | 'jade';
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p
        className={cn(
          'display-warm truncate font-display text-2xl font-medium tabular-nums',
          tone === 'ink' && 'text-ink',
          tone === 'cinnabar' && 'text-cinnabar',
          tone === 'jade' && 'text-jade',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-faint">{label}</p>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-sm bg-cinnabar/10 px-3 py-2 text-sm text-cinnabar">
      {children}
    </p>
  );
}
