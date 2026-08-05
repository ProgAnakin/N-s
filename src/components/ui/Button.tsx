import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/utils/cn';

/**
 * Buttons.
 *
 * Tight corners and a hairline rather than a pill and a shadow — closer to a
 * letterpress card than to a web app. The primary variant presses down very
 * slightly on click, which is the only motion it has.
 */

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-sm font-sans font-medium ' +
  'transition-[background-color,border-color,color,transform] duration-150 ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-45';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-stamp text-on-stamp hover:bg-stamp-hover shadow-seal',
  secondary: 'border border-rule bg-raised text-ink hover:border-ink-faint hover:bg-sunk',
  quiet: 'text-ink-soft hover:bg-sunk hover:text-ink',
  danger: 'border border-cinnabar/40 text-cinnabar hover:bg-cinnabar/10',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
  lg: 'h-12 px-6 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block = false, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], block && 'w-full', className)}
      {...props}
    />
  );
});

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  block = false,
  className,
  children,
  ...props
}: LinkProps & { variant?: Variant; size?: Size; block?: boolean }) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], block && 'w-full', className)}
      {...props}
    >
      {children}
    </Link>
  );
}

/** A square icon-only button. Always needs a label for screen readers. */
export function IconButton({
  label,
  children,
  variant = 'quiet',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        BASE,
        VARIANTS[variant],
        'h-9 w-9 shrink-0 p-0 [&>svg]:h-4 [&>svg]:w-4',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
