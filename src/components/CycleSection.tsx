import { useMemo, useState } from 'react';
import { Droplet, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Surface';
import { Tag } from '@/components/ui/Bits';
import { useCouple, useSession } from '@/data/session';
import { parseISODate, toISODate } from '@/lib/calendar';
import { formatDate } from '@/lib/dates';
import { MIN_OBSERVATIONS, summariseCycle } from '@/lib/cycle';
import { useI18n, useStrings } from '@/i18n';
import { useCoupleTable, useCountdown, useToday } from '@/screens/shared';

/**
 * The cycle, for whoever wants it.
 *
 * Two switches rather than one, and the split is the point. Wanting to know
 * your own cycle and wanting somebody else to know it are two different
 * decisions, and an app that bundles them has quietly decided the second one
 * for you.
 *
 * The partner's view is deliberately thinner than the owner's: a date and a
 * countdown, and nothing else. No mood forecast, no "she may be irritable",
 * no advice about how to behave — that framing turns a person's body into a
 * weather report to be managed around, which is degrading in a way that is
 * easy to miss when it is phrased helpfully.
 *
 * And it says nothing at all until it has enough to be sure. Two
 * observations is a gap, not a cycle length, and a prediction somebody plans
 * around had better be one the app can stand behind.
 */
export function CycleSection() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple, profile } = useCouple();
  const { partner, updateProfile } = useSession();
  const today = useToday();
  const countdown = useCountdown();
  const [saving, setSaving] = useState(false);

  const events = useCoupleTable('cycle_events', {
    coupleId: couple.id,
    orderBy: 'started_on',
    ascending: false,
    columns: 'id,profile_id,started_on',
  });

  const mine = useMemo(
    () => events.rows.filter((row) => row.profile_id === profile.id),
    [events.rows, profile.id],
  );
  const theirs = useMemo(
    () => events.rows.filter((row) => row.profile_id !== profile.id),
    [events.rows, profile.id],
  );

  const mySummary = useMemo(
    () =>
      summariseCycle(
        mine
          .map((row) => parseISODate(row.started_on))
          .filter((day): day is NonNullable<typeof day> => day !== null),
        today,
      ),
    [mine, today],
  );

  const theirSummary = useMemo(
    () =>
      summariseCycle(
        theirs
          .map((row) => parseISODate(row.started_on))
          .filter((day): day is NonNullable<typeof day> => day !== null),
        today,
      ),
    [theirs, today],
  );

  const todayIso = toISODate(today);
  const alreadyToday = mine.some((row) => row.started_on === todayIso);

  async function recordToday() {
    setSaving(true);
    try {
      await events.create({ profile_id: profile.id, started_on: todayIso });
    } finally {
      setSaving(false);
    }
  }

  // The partner sees this only while the flag is on, and only because the
  // row policy let those rows through in the first place.
  const showTheirs = Boolean(partner) && theirs.length > 0;

  return (
    <section>
      <h2 className="label-kicker mb-3">{s.cycle.title}</h2>
      <Sheet className="flex flex-col gap-4 p-5">
        <Toggle
          label={s.cycle.track}
          hint={s.cycle.trackHint}
          checked={profile.cycle_tracking}
          onChange={(cycle_tracking) => void updateProfile({ cycle_tracking })}
        />

        {profile.cycle_tracking && (
          <>
            <div className="rule-ink" />

            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => void recordToday()} disabled={saving || alreadyToday}>
                <Plus className="h-3.5 w-3.5" />
                {alreadyToday ? s.cycle.recordedToday : s.cycle.recordToday}
              </Button>
              {mySummary.dayOfCycle !== null && (
                <Tag>{s.cycle.dayOfCycle(mySummary.dayOfCycle)}</Tag>
              )}
            </div>

            {mySummary.nextExpected ? (
              <p className="text-sm text-ink-soft">
                {s.cycle.nextExpected(
                  formatDate(mySummary.nextExpected, 'dayMonth', intlLocale),
                  countdown(mySummary.daysUntilNext ?? 0),
                )}
                <span className="ml-2 text-xs text-ink-faint">
                  {s.cycle.basedOn(mySummary.averageLength ?? 0, mySummary.observations)}
                </span>
              </p>
            ) : (
              // Says nothing rather than guessing. An app that offers a
              // number with a shrug attached is worse than one that waits.
              <p className="text-sm leading-relaxed text-ink-faint">
                {s.cycle.notEnoughYet(MIN_OBSERVATIONS)}
              </p>
            )}

            <div className="rule-ink" />

            <Toggle
              label={s.cycle.share}
              hint={s.cycle.shareHint}
              checked={profile.cycle_shared}
              onChange={(cycle_shared) => void updateProfile({ cycle_shared })}
            />
          </>
        )}

        {showTheirs && (
          <>
            <div className="rule-ink" />
            <div className="flex items-start gap-3">
              <Droplet className="mt-0.5 h-4 w-4 shrink-0 text-cinnabar" />
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  {theirSummary.nextExpected
                    ? s.cycle.partnerNext(
                        partner?.display_name || s.settings.partner,
                        formatDate(theirSummary.nextExpected, 'dayMonth', intlLocale),
                      )
                    : s.cycle.partnerNoEstimate(partner?.display_name || s.settings.partner)}
                </p>
                {/* The only thing the app has to say about it. */}
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                  {s.cycle.partnerNote}
                </p>
              </div>
            </div>
          </>
        )}
      </Sheet>
    </section>
  );
}
