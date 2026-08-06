import { useState } from 'react';
import { m } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Curve } from '@/components/ui/Curve';
import { EmptyState, PageHeader, Sheet } from '@/components/ui/Surface';
import { useCouple, useSession } from '@/data/session';
import { parseISODate } from '@/lib/calendar';
import { daysBetween } from '@/lib/calendar';
import { formatDate } from '@/lib/dates';
import { useI18n, useStrings } from '@/i18n';
import { useToday } from './shared';

/**
 * Distance mode.
 *
 * Optional, off by default, and deliberately sparse: one number, one date,
 * and somewhere to write. A countdown to seeing someone again does not need
 * decoration, and the day it reaches zero the page says to close the app.
 */
export function DistanceScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple } = useCouple();
  const { updateCouple } = useSession();
  const today = useToday();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reunionDate, setReunionDate] = useState(couple.reunion_date ?? '');
  const [note, setNote] = useState(couple.reunion_note ?? '');

  const date = parseISODate(couple.reunion_date);
  const days = date ? daysBetween(today, date) : null;

  async function save() {
    setSaving(true);
    await updateCouple({ reunion_date: reunionDate || null, reunion_note: note.trim() || null });
    setSaving(false);
    setEditing(false);
  }

  return (
    <div>
      <PageHeader
        kicker={s.nav.distance}
        title={s.distance.title}
        subtitle={s.distance.subtitle}
        actions={
          !editing && (
            <Button onClick={() => setEditing(true)}>
              {date ? s.common.edit : s.common.add}
            </Button>
          )
        }
      />

      {editing ? (
        <Sheet className="flex flex-col gap-4 p-5">
          <TextField
            label={s.distance.reunionDate}
            type="date"
            value={reunionDate}
            onChange={(event) => setReunionDate(event.target.value)}
          />
          <TextAreaField
            label={s.distance.reunionNote}
            placeholder={s.distance.reunionNotePlaceholder}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={5}
            optional
          />
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                setReunionDate(couple.reunion_date ?? '');
                setNote(couple.reunion_note ?? '');
                setEditing(false);
              }}
            >
              {s.common.cancel}
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? s.common.saving : s.common.save}
            </Button>
          </div>
        </Sheet>
      ) : !date || days === null ? (
        <EmptyState
          icon={<MapPin />}
          title={s.distance.emptyTitle}
          body={s.distance.emptyBody}
          action={
            <Button variant="primary" onClick={() => setEditing(true)}>
              {s.common.add}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          <Sheet className="flex flex-col items-center px-6 py-12 text-center">
            {days > 0 ? (
              <>
                <p className="label-kicker mb-3">{s.distance.untilTitle}</p>
                <m.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
                  className="display-warm font-display text-5xl font-medium tabular-nums text-cinnabar"
                >
                  {s.distance.countdown(days)}
                </m.p>
                <Curve className="mt-3 max-w-[160px]" />
                <p className="mt-4 text-sm text-ink-soft">
                  {formatDate(date, 'long', intlLocale)}
                </p>
              </>
            ) : days === 0 ? (
              <>
                <p className="display-warm font-display text-4xl font-medium text-cinnabar">
                  {s.distance.todayTitle}
                </p>
                <Curve className="mt-3 max-w-[160px]" />
                <p className="mt-4 text-base text-ink-soft">{s.distance.todayBody}</p>
              </>
            ) : (
              <>
                <p className="font-display text-2xl font-medium text-ink">
                  {s.distance.passedTitle}
                </p>
                <p className="mt-2 text-sm text-ink-soft">{s.distance.passedBody}</p>
                <Button variant="primary" className="mt-5" onClick={() => setEditing(true)}>
                  {s.common.edit}
                </Button>
              </>
            )}
          </Sheet>

          {couple.reunion_note && (
            <section>
              <h2 className="label-kicker mb-3">{s.distance.reunionNote}</h2>
              <Sheet>
                <p className="whitespace-pre-line text-pretty text-base leading-relaxed text-ink-soft">
                  {couple.reunion_note}
                </p>
              </Sheet>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
