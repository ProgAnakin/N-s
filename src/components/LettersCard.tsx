import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Feather, Mail } from 'lucide-react';
import { Sheet } from '@/components/ui/Surface';
import { useCouple, useSession } from '@/data/session';
import {
  daysSinceLastLetter,
  shouldNudge,
  unopenedFor,
  type Letter,
} from '@/lib/letters';
import { useStrings } from '@/i18n';
import { useCoupleTable, useToday } from '@/screens/shared';

/**
 * Letters, on the front page.
 *
 * Two states worth interrupting for and no others: something is waiting to
 * be opened, or it has been quiet for a fortnight. Everything else — the
 * archive, the totals — belongs on the letters page where somebody has
 * chosen to look at it.
 *
 * The quiet note is per person and switchable off, because being reminded
 * that your relationship needs attention is useful to some people and
 * insufferable to others, and the app does not get to decide which you are.
 */
export function LettersCard() {
  const s = useStrings();
  const { couple, profile } = useCouple();
  const { partner } = useSession();
  const today = useToday();

  const letters = useCoupleTable('letters', {
    coupleId: couple.id,
    orderBy: 'created_at',
    enabled: Boolean(partner),
  });

  const rows = letters.rows as unknown as Letter[];
  const unopened = useMemo(() => unopenedFor(rows, profile.id), [rows, profile.id]);
  const quiet = useMemo(
    () => shouldNudge({ letters: rows, today, nudges: profile.nudges }),
    [rows, today, profile.nudges],
  );
  const quietDays = useMemo(() => daysSinceLastLetter(rows, today), [rows, today]);

  if (!partner) return null;
  if (unopened.length === 0 && !quiet) return null;

  if (unopened.length > 0) {
    return (
      <Link
        to="/letters"
        className="sheet group flex items-center gap-4 border-cinnabar/40 bg-cinnabar-wash/40 p-4 transition-colors hover:border-cinnabar"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-stamp text-on-stamp">
          <Mail className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-medium text-ink">
            {s.letters.unreadCount(unopened.length)}
          </span>
          <span className="mt-0.5 block text-sm text-ink-soft">{s.letters.open}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
      </Link>
    );
  }

  return (
    <Sheet className="flex items-start gap-3 p-4">
      <Feather className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
      <div className="min-w-0">
        <p className="text-pretty text-sm leading-relaxed text-ink-soft">
          {s.letters.quiet(quietDays ?? 0)}
        </p>
        <Link
          to="/letters"
          className="mt-2 inline-flex items-center gap-1 text-sm text-cinnabar underline-offset-4 hover:underline"
        >
          {s.letters.quietAction}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Sheet>
  );
}
