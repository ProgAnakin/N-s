import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { ChevronRight, Images, Mail } from 'lucide-react';
import { useCouple } from '@/data/session';
import { parseISODate } from '@/lib/calendar';
import { formatDate } from '@/lib/dates';
import { onThisDay, type DatedThing } from '@/lib/onthisday';
import { useI18n, useStrings } from '@/i18n';
import { useCoupleTable, useToday } from '@/screens/shared';

/**
 * This time last year.
 *
 * Every other page in this app waits to be visited. This one comes to you:
 * on the second of April it says, without being asked, that a year ago today
 * it rained in Porto and you missed the tram twice.
 *
 * It is the closest thing here to a reason to open the app on a day when
 * nothing is happening — and it needs no new data at all, because a keepsake
 * app is already full of dated things nobody ever scrolls back to.
 *
 * Two restraints, both in lib/onthisday.ts and both worth repeating here.
 * Whole years only: six months ago is not an anniversary, and saying it is
 * would be the app manufacturing an occasion, which is the habit that turns
 * a keepsake into a slot machine. And it says nothing on most days, which is
 * the point — a section that always has something in it is one nobody
 * believes.
 *
 * Sealed letters are excluded. A letter written to be opened next year is
 * not a memory yet, and surfacing its words a year early through the back
 * door would be the app breaking a promise its author made on purpose.
 */
export function OnThisDay({ className }: { className?: string }) {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple } = useCouple();
  const today = useToday();

  const memories = useCoupleTable('memories', {
    coupleId: couple.id,
    orderBy: 'date',
    columns: 'id,title,note,date',
  });
  const letters = useCoupleTable('letters', {
    coupleId: couple.id,
    orderBy: 'created_at',
    columns: 'id,body,kind,open_on,created_at',
  });

  const found = useMemo(() => {
    const things: DatedThing[] = [];

    for (const row of memories.rows) {
      const date = parseISODate(row.date);
      if (!date) continue;
      things.push({
        id: `memory-${row.id}`,
        kind: 'memory',
        title: row.title,
        note: row.note,
        date,
        href: '/memories',
      });
    }

    for (const row of letters.rows) {
      if (row.open_on) continue;
      const date = parseISODate(row.created_at.slice(0, 10));
      if (!date) continue;
      things.push({
        id: `letter-${row.id}`,
        kind: 'letter',
        title: s.letters.kinds[row.kind]?.name ?? s.nav.letters,
        note: row.body,
        date,
        href: '/letters',
      });
    }

    return onThisDay(things, today, { limit: 3 });
  }, [memories.rows, letters.rows, today, s]);

  if (found.length === 0) return null;

  return (
    <section className={className} aria-labelledby="on-this-day">
      <h2 id="on-this-day" className="label-kicker mb-3">
        {s.onThisDay.title}
      </h2>

      <ul className="flex flex-col gap-2.5">
        {found.map((recollection, index) => {
          const { thing, yearsAgo, dayOffset } = recollection;
          const Icon = thing.kind === 'letter' ? Mail : Images;
          return (
            <m.li
              key={thing.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.07, ease: [0.2, 0.7, 0.3, 1] }}
            >
              <Link
                to={thing.href}
                className="sheet group flex items-start gap-3 p-4 transition-colors hover:border-cinnabar"
              >
                <Icon className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-ink-faint">
                    {/* "around now" when it is a day or two off, so the app
                        never claims a date it does not have. */}
                    {dayOffset === 0
                      ? s.onThisDay.yearsAgo(yearsAgo)
                      : s.onThisDay.yearsAgoNear(yearsAgo)}
                    {' · '}
                    {formatDate(thing.date, 'long', intlLocale)}
                  </span>
                  <span className="mt-0.5 block text-pretty font-display text-base font-medium leading-snug text-ink">
                    {thing.title}
                  </span>
                  {/* Their words, cut but never rewritten. */}
                  {thing.note && (
                    <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-ink-soft">
                      {thing.note}
                    </span>
                  )}
                </span>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
              </Link>
            </m.li>
          );
        })}
      </ul>
    </section>
  );
}
