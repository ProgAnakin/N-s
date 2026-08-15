import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Surface';
import { useCouple, useSession } from '@/data/session';
import { deviceTimeZone, formatHour, zoneOffsetMinutes } from '@/lib/timezones';
import { useStrings } from '@/i18n';

/**
 * Your zone and your waking hours.
 *
 * Both are yours alone to set — the app works out when you are both up by
 * combining two people's habits, and guessing at somebody else's is exactly
 * how you end up being told 3am is a fine time to call.
 *
 * Only the zone is stored, never a location.
 */
export function ClockSection() {
  const s = useStrings();
  const { profile } = useCouple();
  const { updateProfile } = useSession();
  const [saving, setSaving] = useState(false);

  const current = profile.time_zone || deviceTimeZone();
  const offset = zoneOffsetMinutes(current);
  const sign = offset < 0 ? '−' : '+';
  const label = `UTC${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(
    Math.abs(offset) % 60,
  ).padStart(2, '0')}`;

  // Intl knows every zone; offering all of them in a select would be a
  // 400-entry list, so the device's own zone is the one-tap answer and the
  // field stays free text for the traveller.
  // Not a hook, despite where it lives. It was called `useDevice`, which
  // made every reader and every linter treat it as one — including the
  // rules-of-hooks check, which flagged the perfectly ordinary click
  // handler below as a hook called inside a callback.
  async function applyDeviceTimeZone() {
    setSaving(true);
    await updateProfile({ time_zone: deviceTimeZone() });
    setSaving(false);
  }

  const hours = Array.from({ length: 25 }, (_, hour) => hour);

  return (
    <section>
      <h2 className="label-kicker mb-3">{s.clocks.title}</h2>
      <Sheet className="flex flex-col gap-4 p-5">
        <TextField
          label={s.clocks.timeZone}
          value={profile.time_zone ?? ''}
          placeholder={deviceTimeZone()}
          onChange={(event) => void updateProfile({ time_zone: event.target.value || null })}
          hint={`${s.clocks.timeZoneHint} · ${current} (${label})`}
          optional
        />

        <div>
          <Button size="sm" onClick={() => void applyDeviceTimeZone()} disabled={saving}>
            {s.clocks.useDevice}
          </Button>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{s.clocks.awake}</legend>
          <div className="flex items-center gap-2">
            <SelectField
              label={s.clocks.awakeFrom}
              labelHidden
              value={String(profile.awake_start)}
              onChange={(event) => void updateProfile({ awake_start: Number(event.target.value) })}
              className="flex-1"
            >
              {hours.slice(0, 24).map((hour) => (
                <option key={hour} value={hour}>
                  {formatHour(hour)}
                </option>
              ))}
            </SelectField>
            <span className="pt-1 text-sm text-ink-faint">—</span>
            <SelectField
              label={s.clocks.awakeUntil}
              labelHidden
              value={String(profile.awake_end)}
              onChange={(event) => void updateProfile({ awake_end: Number(event.target.value) })}
              className="flex-1"
            >
              {hours.map((hour) => (
                <option key={hour} value={hour}>
                  {formatHour(hour)}
                </option>
              ))}
            </SelectField>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">{s.clocks.awakeHint}</p>
        </fieldset>
      </Sheet>
    </section>
  );
}
