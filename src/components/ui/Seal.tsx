import { m } from 'framer-motion';
import { cn } from '@/utils/cn';

/**
 * 印章 — a seal, or chop.
 *
 * Stands in for an avatar throughout the app. A real chop is pressed by hand,
 * so it never lands perfectly square: each one is nudged a degree or two off
 * axis, deterministically from the name so a given person's seal is always
 * pressed the same way. The inner hairline is the carved border every chop
 * has.
 *
 * The two partners get different stones — cinnabar and jade — which is also
 * how the spending bar tells them apart without ever labelling one first.
 */

export type SealTone = 'cinnabar' | 'jade';

const SIZES = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-10 w-10 text-base',
  lg: 'h-14 w-14 text-xl',
  xl: 'h-20 w-20 text-3xl',
} as const;

export type SealSize = keyof typeof SIZES;

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '·';
  const parts = trimmed.split(/\s+/);
  // A Chinese name is written without spaces, so the first character is the
  // right initial; a Western name gives first and last.
  if (parts.length === 1) return [...parts[0]][0].toUpperCase();
  return `${[...parts[0]][0]}${[...parts[parts.length - 1]][0]}`.toUpperCase();
}

/** Stable tilt in [-3, 3] degrees, derived from the name. */
function tiltOf(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 1000;
  return ((hash % 61) - 30) / 10;
}

export interface SealProps {
  name: string;
  tone?: SealTone;
  size?: SealSize;
  /** Plays the press-down animation, e.g. when something has just been saved. */
  press?: boolean;
  imageUrl?: string | null;
  /**
   * What is carved on it, when the couple has said. Overrides the derived
   * initials — the point of a chop is that it is the mark you chose, and a
   * couple with a word for themselves would rather see that than an initial
   * an algorithm picked.
   */
  carved?: string | null;
  className?: string;
}

/** Four characters is what fits before a chop stops reading as a chop. */
const MAX_CARVED = 4;

export function Seal({
  name,
  tone = 'cinnabar',
  size = 'md',
  press = false,
  imageUrl = null,
  carved = null,
  className,
}: SealProps) {
  const tilt = tiltOf(name);
  const mark = carved?.trim() ? [...carved.trim()].slice(0, MAX_CARVED).join('') : initialsOf(name);
  // Two characters fill the stone; four need to shrink to fit inside the
  // carved border rather than crowding it.
  const dense = [...mark].length > 2;

  return (
    <m.span
      aria-hidden="true"
      initial={press ? { scale: 1.25, rotate: tilt - 7, opacity: 0 } : false}
      animate={{ scale: 1, rotate: tilt, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.7 }}
      style={{ rotate: tilt }}
      className={cn(
        'seal shrink-0 select-none overflow-hidden font-medium leading-none',
        tone === 'jade' && 'seal-jade',
        SIZES[size],
        className,
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={cn('relative z-10 pt-px', dense && 'text-[0.62em] tracking-tight')}>
          {mark}
        </span>
      )}
    </m.span>
  );
}

