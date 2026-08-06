import { useMemo, useState } from 'react';
import { HeartCrack, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Sheet } from '@/components/ui/Surface';
import { useCouple, useSession } from '@/data/session';
import { parseISODate } from '@/lib/calendar';
import { formatDate } from '@/lib/dates';
import {
  buildLedger,
  endingState,
  GRACE_PERIOD_DAYS,
  ledgerWorthShowing,
} from '@/lib/ending';
import { useI18n, useStrings } from '@/i18n';
import { useCoupleTable, useToday } from '@/screens/shared';

/**
 * Ending it.
 *
 * The hardest screen in the app to get right, and the one most likely to be
 * written badly — either as a red "delete" button that treats four years as
 * a row in a table, or as something so heavy-handed it reads as the software
 * begging somebody to stay.
 *
 * It does neither. It shows what is in the space, says once and plainly why
 * it is showing it, lists exactly what will happen, and then asks the person
 * to type a word. The typing is not friction for its own sake: it is the
 * difference between a thumb landing somewhere and a decision.
 *
 * The paragraph that matters most is the one saying this is not an argument
 * for staying. Somebody leaving a relationship that was hurting them should
 * not have to argue with a piece of software on the way out, and any app
 * that makes them is doing something contemptible with the trust it was
 * given.
 */
export function EndingSection() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple } = useCouple();
  const { endCouple, reopenCouple } = useSession();
  const today = useToday();

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const state = useMemo(() => endingState(couple.ended_on, today), [couple.ended_on, today]);

  // Counts only — never the rows themselves. This section has no business
  // reading anybody's letters, and asking for `id` alone keeps it honest.
  const memories = useCoupleTable('memories', { coupleId: couple.id, columns: 'id' });
  const photos = useCoupleTable('memory_photos', { coupleId: couple.id, columns: 'id' });
  const letters = useCoupleTable('letters', { coupleId: couple.id, columns: 'id' });
  const plans = useCoupleTable('plans', { coupleId: couple.id, columns: 'id' });
  const places = useCoupleTable('places', { coupleId: couple.id, columns: 'id' });

  const ledger = useMemo(
    () =>
      buildLedger({
        anniversary: parseISODate(couple.anniversary_date),
        today,
        memories: memories.rows.length,
        photos: photos.rows.length,
        letters: letters.rows.length,
        plans: plans.rows.length,
        places: places.rows.length,
      }),
    [
      couple.anniversary_date,
      today,
      memories.rows.length,
      photos.rows.length,
      letters.rows.length,
      plans.rows.length,
      places.rows.length,
    ],
  );

  async function onEnd() {
    setBusy(true);
    try {
      await endCouple();
      setOpen(false);
      setTyped('');
    } finally {
      setBusy(false);
    }
  }

  async function onReopen() {
    setBusy(true);
    try {
      await reopenCouple();
    } finally {
      setBusy(false);
    }
  }

  // --- Already ended -------------------------------------------------
  if (state.stage !== 'active') {
    const endedLabel = state.endedOn
      ? formatDate(state.endedOn, 'long', intlLocale)
      : '';
    return (
      <section>
        <h2 className="label-kicker mb-3">{s.ending.endedTitle}</h2>
        <Sheet className="flex flex-col items-start gap-3 p-5">
          <p className="text-sm text-ink-soft">{s.ending.endedOn(endedLabel)}</p>

          {state.stage === 'grace' ? (
            <>
              <p className="text-pretty text-sm leading-relaxed text-ink">
                {s.ending.reopenWindow(state.daysToReopen)}
              </p>
              <Button variant="primary" onClick={() => void onReopen()} disabled={busy}>
                <RotateCcw className="h-4 w-4" />
                {busy ? s.ending.reopening : s.ending.reopen}
              </Button>
              <p className="text-xs leading-relaxed text-ink-faint">{s.ending.reopenNote}</p>
            </>
          ) : (
            <p className="text-pretty text-sm leading-relaxed text-ink-soft">
              {s.ending.archivedNote}
            </p>
          )}

          <p className="max-w-prose text-xs leading-relaxed text-ink-faint">
            {s.ending.stillYours}
          </p>
        </Sheet>
      </section>
    );
  }

  // --- Still together ------------------------------------------------
  const showLedger = ledgerWorthShowing(ledger);
  const confirmed = typed.trim().toUpperCase() === s.ending.confirmWord;

  const lines: string[] = [
    ...(ledger.days !== null ? [s.ending.days(ledger.days)] : []),
    ...(ledger.memories > 0 ? [s.ending.memories(ledger.memories)] : []),
    ...(ledger.photos > 0 ? [s.ending.photos(ledger.photos)] : []),
    ...(ledger.letters > 0 ? [s.ending.letters(ledger.letters)] : []),
    ...(ledger.plans > 0 ? [s.ending.plans(ledger.plans)] : []),
    ...(ledger.places > 0 ? [s.ending.places(ledger.places)] : []),
  ];

  return (
    <section className="pb-4">
      {/* Quiet, and last on the page. Nobody arrives here by accident, and
          nobody should have to look at it on an ordinary day. */}
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>
        <HeartCrack className="h-3.5 w-3.5" />
        {s.ending.open}
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setTyped('');
        }}
        title={s.ending.title}
        description={s.ending.lead}
        footer={
          <>
            <Button
              onClick={() => {
                setOpen(false);
                setTyped('');
              }}
            >
              {s.ending.notNow}
            </Button>
            <Button
              variant="danger"
              onClick={() => void onEnd()}
              disabled={!confirmed || busy}
            >
              {busy ? s.ending.ending : s.ending.goAhead}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 pb-2">
          {showLedger && lines.length > 0 && (
            <div>
              <p className="mb-2 text-sm text-ink-soft">{s.ending.ledgerLead}</p>
              <ul className="flex flex-col gap-1">
                {lines.map((line) => (
                  <li
                    key={line}
                    className="display-warm font-display text-lg font-medium text-ink"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The paragraph the whole screen exists to be honest about. */}
          <p className="text-pretty text-sm leading-relaxed text-ink-soft">
            {s.ending.reflect}
          </p>

          <div className="rule-ink" />

          <div>
            <p className="label-kicker mb-2">{s.ending.whatHappens}</p>
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed text-ink-soft">
              <li>{s.ending.whatHappens1}</li>
              <li>{s.ending.whatHappens2(GRACE_PERIOD_DAYS)}</li>
              <li>{s.ending.whatHappens3}</li>
              <li>{s.ending.whatHappens4}</li>
            </ul>
          </div>

          <TextField
            label={s.ending.confirmLabel}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            hint={s.ending.confirmPrompt}
            autoComplete="off"
          />
        </div>
      </Modal>
    </section>
  );
}
