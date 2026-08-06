import { m } from 'framer-motion';
import { cn } from '@/utils/cn';

/**
 * The signature line.
 *
 * A single confident organic curve, drawn once under each page title and
 * again as the spine of the memories timeline. It is the Brazilian half of
 * the app's visual language — the flowing modernist line that softens an
 * otherwise strict grid, the way a Niemeyer roof sits against a rectilinear
 * plan. Everything else on the page is straight; this is not.
 */

export function Curve({
  className,
  tone = 'cinnabar',
  animate = true,
}: {
  className?: string;
  tone?: 'cinnabar' | 'ink';
  animate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 400 26"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn('h-[14px] w-full max-w-[280px]', className)}
    >
      <m.path
        d="M1 18C34 18 46 6 84 6c38 0 52 15 96 15s60-14 100-14 62 9 118 6"
        stroke={tone === 'cinnabar' ? 'hsl(var(--cinnabar))' : 'hsl(var(--rule))'}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={tone === 'cinnabar' ? 0.85 : 1}
        initial={animate ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.2, 0.7, 0.3, 1] }}
      />
    </svg>
  );
}

