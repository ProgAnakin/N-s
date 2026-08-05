import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Flower2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useCouple, useSession } from '@/data/session';
import { useCoupleTable } from '@/screens/shared';
import { parseISODate, toISODate, type CalendarDate } from '@/lib/calendar';
import { countReceived, FLOWER_KINDS, shouldOfferFlower, type FlowerKind } from '@/lib/flowers';
import { useStrings } from '@/i18n';
import { cn } from '@/utils/cn';

/**
 * The flowers.
 *
 * An easter egg with a rule: it must never become a notification. So the
 * offer appears at most once a day, never twice, and never after one has
 * already been sent — and the popup is dismissible without guilt. A surprise
 * that arrives on schedule stops being one.
 *
 * The three flowers were picked so the gesture reads in both halves of this
 * couple's world: a peony is the imperial flower of China, cherry blossom
 * carries the same character in both languages, and a pink rose needs no
 * translation anywhere.
 */

const LAST_OFFERED_KEY = 'nos.flowers.lastOffered';

/** The petal shapes, drawn rather than fetched, so each kind looks distinct. */
function FlowerMark({ kind, className }: { kind: FlowerKind; className?: string }) {
  const petals = kind === 'rose' ? 5 : kind === 'peony' ? 8 : 5;
  const inner = kind === 'cherry' ? 0.42 : 0.3;

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      {Array.from({ length: petals }, (_, i) => {
        const angle = (i * 360) / petals;
        return (
          <ellipse
            key={i}
            cx="24"
            cy={kind === 'peony' ? 14 : 12}
            rx={kind === 'peony' ? 6 : 7}
            ry={kind === 'peony' ? 9 : 11}
            fill="currentColor"
            opacity={kind === 'peony' ? 0.55 : 0.75}
            transform={`rotate(${angle} 24 24)`}
          />
        );
      })}
      {/* Cherry blossom petals are notched; a small centre reads as the stamen. */}
      <circle cx="24" cy="24" r={48 * inner * 0.18} fill="currentColor" opacity="0.95" />
    </svg>
  );
}

function readLastOffered(): CalendarDate | null {
  try {
    return parseISODate(window.localStorage.getItem(LAST_OFFERED_KEY));
  } catch {
    return null;
  }
}

function writeLastOffered(date: CalendarDate): void {
  try {
    window.localStorage.setItem(LAST_OFFERED_KEY, toISODate(date));
  } catch {
    // Without this the offer may appear twice in a day. Not worth crashing.
  }
}

/** Shared reads, so the counter and the offer do not fetch the table twice. */
function useFlowers() {
  const { couple, profile } = useCouple();
  return {
    profileId: profile.id,
    coupleId: couple.id,
    table: useCoupleTable('flowers', { coupleId: couple.id, orderBy: 'created_at', ascending: false }),
  };
}

/**
 * The small counter, with everything received behind it.
 */
export function FlowerCounter({ className }: { className?: string }) {
  const s = useStrings();
  const { profileId, table } = useFlowers();
  const [open, setOpen] = useState(false);

  const counts = useMemo(
    () =>
      countReceived(
        table.rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          toProfileId: row.to_profile,
          seen: row.seen,
        })),
        profileId,
      ),
    [table.rows, profileId],
  );

  // Opening the drawer is what marks them read.
  async function onOpen() {
    setOpen(true);
    const unseen = table.rows.filter((row) => row.to_profile === profileId && !row.seen);
    for (const row of unseen) await table.update(row.id, { seen: true });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onOpen()}
        aria-label={`${s.flowers.counter}: ${counts.total}`}
        className={cn(
          'relative inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm',
          'text-ink-soft transition-colors hover:bg-sunk hover:text-ink',
          className,
        )}
      >
        <Flower2 className="h-4 w-4 text-cinnabar" />
        <span className="tabular-nums">{counts.total}</span>
        {counts.unseen > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-cinnabar"
          />
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={s.flowers.receivedTitle}>
        <div className="flex flex-col gap-3 pb-4">
          {counts.total === 0 && (
            <p className="text-sm leading-relaxed text-ink-soft">{s.flowers.receivedNone}</p>
          )}

          {counts.byKind.map((tally) => (
            <div
              key={tally.kind}
              className={cn(
                'flex items-start gap-3 rounded-sm border border-rule p-3',
                tally.count === 0 && 'opacity-55',
              )}
            >
              <FlowerMark
                kind={tally.kind}
                className={cn(
                  'h-9 w-9 shrink-0',
                  tally.kind === 'rose' && 'text-cinnabar',
                  tally.kind === 'peony' && 'text-cinnabar-soft',
                  tally.kind === 'cherry' && 'text-cinnabar/70',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-base font-medium text-ink">
                    {s.flowers.kinds[tally.kind].name}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-ink-faint">
                    {tally.count}
                  </span>
                </p>
                <p className="mt-1 text-pretty text-xs leading-relaxed text-ink-soft">
                  {s.flowers.kinds[tally.kind].meaning}
                </p>
              </div>
            </div>
          ))}

          {counts.total > 0 && (
            <p className="text-xs text-ink-faint">{s.flowers.receivedTotal(counts.total)}</p>
          )}
        </div>
      </Modal>
    </>
  );
}

/**
 * The offer itself. Rendered once, near the root.
 */
export function FlowerOffer() {
  const s = useStrings();
  const { partner } = useSession();
  const { profileId, coupleId, table } = useFlowers();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<FlowerKind | null>(null);
  const decided = useRef(false);

  const decide = useCallback(() => {
    if (decided.current || table.loading || !partner) return;
    decided.current = true;

    const today = currentDate();

    const mine = table.rows.filter((row) => row.from_profile === profileId);
    const lastSentOn = mine[0] ? parseISODate(mine[0].created_at) : null;

    if (
      shouldOfferFlower({
        today,
        lastOfferedOn: readLastOffered(),
        lastSentOn,
        roll: Math.random(),
      })
    ) {
      writeLastOffered(today);
      // A beat after the app settles, so it feels like something noticed
      // rather than something that fired on load.
      window.setTimeout(() => setOpen(true), 2600);
    }
  }, [table.loading, table.rows, partner, profileId]);

  useEffect(() => {
    decide();
  }, [decide]);

  async function send(kind: FlowerKind) {
    if (!partner) return;
    setSent(kind);
    await table.create({
      couple_id: coupleId,
      from_profile: profileId,
      to_profile: partner.id,
      kind,
    });
    window.setTimeout(() => {
      setOpen(false);
      setSent(null);
    }, 1400);
  }

  if (!partner) return null;

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={s.flowers.offerTitle}
      description={s.flowers.offerBody}
    >
      <div className="pb-4">
        <AnimatePresence mode="wait">
          {sent ? (
            <motion.p
              key="sent"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-10 text-center font-display text-xl text-cinnabar"
            >
              {s.flowers.sent}
            </motion.p>
          ) : (
            <motion.div key="pick" exit={{ opacity: 0 }} className="grid grid-cols-3 gap-2">
              {FLOWER_KINDS.map((kind, index) => (
                <motion.button
                  key={kind}
                  type="button"
                  onClick={() => void send(kind)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.07, duration: 0.3 }}
                  className="flex flex-col items-center gap-2 rounded-sm border border-rule p-3 transition-colors hover:border-cinnabar"
                >
                  <FlowerMark
                    kind={kind}
                    className={cn(
                      'h-12 w-12',
                      kind === 'rose' && 'text-cinnabar',
                      kind === 'peony' && 'text-cinnabar-soft',
                      kind === 'cherry' && 'text-cinnabar/70',
                    )}
                  />
                  <span className="text-center text-xs leading-snug text-ink">
                    {s.flowers.kinds[kind].name}
                  </span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {!sent && (
          <div className="mt-4 flex justify-center">
            <Button variant="quiet" size="sm" onClick={() => setOpen(false)}>
              {s.flowers.notNow}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function currentDate(): CalendarDate {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}
