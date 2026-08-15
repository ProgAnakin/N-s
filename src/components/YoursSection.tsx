import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ChoiceField, TextField, Toggle } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Surface';
import { Seal } from '@/components/ui/Seal';
import { allItems, MAX_PINNED, type FeatureFlags } from '@/components/layout/nav-items';
import { useCouple, useSession } from '@/data/session';
import { ACCENTS } from '@/theme';
import { useStrings } from '@/i18n';
import { cn } from '@/utils/cn';

/**
 * The part of Settings that changes nothing about how the app behaves and
 * everything about whose habits it assumes.
 *
 * Two of these are shared and two are personal, and the split is deliberate:
 * the accent and the seal are what the space looks like, so they belong to
 * the couple; the bottom bar and the nudges are how one person uses it, so
 * they belong to that person. Handing your partner's home screen a rearrange
 * would be a small unkindness the app can simply not offer.
 */
export function YoursSection() {
  const s = useStrings();
  const { couple, profile } = useCouple();
  const { updateCouple, updateProfile } = useSession();

  const [sealText, setSealText] = useState(couple.seal_text ?? '');

  const flags: FeatureFlags = {
    distanceMode: couple.distance_mode,
    intimacyMode: couple.intimacy_mode,
  };
  const destinations = allItems(flags);
  const pinned = profile.pinned;
  const full = pinned.length >= MAX_PINNED;

  function togglePin(path: string) {
    const next = pinned.includes(path)
      ? pinned.filter((entry) => entry !== path)
      : pinned.length < MAX_PINNED
        ? [...pinned, path]
        : pinned;
    if (next !== pinned) void updateProfile({ pinned: next });
  }

  return (
    <section>
      <h2 className="label-kicker mb-3">{s.settings.yours}</h2>
      <Sheet className="flex flex-col gap-6 p-5">
        {/* --- Which day the week starts on ------------------------------- */}
        <ChoiceField
          label={s.settings.weekStarts}
          hint={s.settings.weekStartsHint}
          value={String(couple.week_starts_on)}
          onChange={(value) => void updateCouple({ week_starts_on: Number(value) })}
          options={[
            { value: '0', label: s.settings.sunday },
            { value: '1', label: s.settings.monday },
          ]}
        />

        <div className="rule-ink" />

        {/* --- Accent ------------------------------------------------------ */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{s.settings.accent}</legend>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((accent) => {
              const selected = couple.accent === accent;
              return (
                <button
                  key={accent}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => void updateCouple({ accent: accent })}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-colors',
                    selected
                      ? 'border-cinnabar bg-cinnabar/10 text-ink'
                      : 'border-rule text-ink-soft hover:border-ink-faint hover:text-ink',
                  )}
                >
                  {/* The swatch is the accent's own stamp fill, so what you
                      see on the chip is exactly what lands on the page. */}
                  <span
                    aria-hidden="true"
                    data-accent={accent === 'cinnabar' ? undefined : accent}
                    className="h-3.5 w-3.5 rounded-[2px] bg-stamp"
                  />
                  {s.settings.accents[accent]}
                  {selected && <Check className="h-3.5 w-3.5 text-cinnabar" />}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-faint">{s.settings.accentHint}</p>
        </fieldset>

        {/* --- What is carved on the seal ---------------------------------- */}
        <div className="flex items-end gap-4">
          <TextField
            label={s.settings.sealText}
            value={sealText}
            maxLength={4}
            onChange={(event) => setSealText(event.target.value)}
            onBlur={() => void updateCouple({ seal_text: sealText.trim() || null })}
            placeholder={couple.couple_name ?? ''}
            hint={s.settings.sealTextHint}
            className="flex-1"
            optional
          />
          <div className="pb-6">
            <Seal
              name={couple.couple_name || 'Nós'}
              carved={sealText.trim() || null}
              size="lg"
            />
          </div>
        </div>

        <div className="rule-ink" />

        {/* --- The bottom bar ---------------------------------------------- */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{s.settings.pinned}</legend>
          <div className="flex flex-wrap gap-2">
            {destinations.map((item) => {
              const index = pinned.indexOf(item.to);
              const selected = index !== -1;
              return (
                <button
                  key={item.to}
                  type="button"
                  aria-pressed={selected}
                  disabled={!selected && full}
                  onClick={() => togglePin(item.to)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-sm transition-colors',
                    selected
                      ? 'border-cinnabar bg-cinnabar/10 text-ink'
                      : 'border-rule text-ink-soft hover:border-ink-faint hover:text-ink',
                    !selected && full && 'cursor-not-allowed opacity-40 hover:border-rule',
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label(s)}
                  {selected && (
                    <span className="text-xs tabular-nums text-cinnabar">{index + 1}</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            {full ? s.settings.pinnedFull : s.settings.pinnedHint}
          </p>
          {pinned.length > 0 && (
            <div className="mt-3">
              <Button size="sm" variant="quiet" onClick={() => void updateProfile({ pinned: [] })}>
                <RotateCcw className="h-3.5 w-3.5" />
                {s.settings.pinnedReset}
              </Button>
            </div>
          )}
        </fieldset>

        <div className="rule-ink" />

        {/* --- Being nudged, or not ---------------------------------------- */}
        <Toggle
          label={s.settings.nudges}
          hint={s.settings.nudgesHint}
          checked={profile.nudges}
          onChange={(nudges) => void updateProfile({ nudges })}
        />
      </Sheet>
    </section>
  );
}
