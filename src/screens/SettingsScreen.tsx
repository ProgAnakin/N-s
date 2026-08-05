import { useState } from 'react';
import { Check, Copy, Lock, LogOut, Monitor, Moon, RefreshCw, Sun } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorNote } from '@/components/ui/Bits';
import { SelectField, TextField, Toggle } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, Sheet } from '@/components/ui/Surface';
import { Seal } from '@/components/ui/Seal';
import { useSession } from '@/data/session';
import { clearTableCache } from '@/data/useTable';
import type { CurrencyColumn } from '@/data/database.types';
import { CURRENCIES, CURRENCY_SYMBOLS } from '@/lib/money';
import { AVAILABLE_LOCALES, LOCALE_NAMES, useStrings, type LocaleCode } from '@/i18n';
import { useTheme, type ThemePreference } from '@/theme';
import { usePartnerNames } from './shared';
import { cn } from '@/utils/cn';

export function SettingsScreen() {
  const s = useStrings();
  const { couple, profile, partner, updateCouple, updateProfile, rotateInviteCode, signOut } =
    useSession();
  const names = usePartnerNames();
  const { preference, setPreference } = useTheme();

  const [coupleName, setCoupleName] = useState(couple?.couple_name ?? '');
  const [anniversary, setAnniversary] = useState(couple?.anniversary_date ?? '');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  if (!couple || !profile) return null;

  const dirty =
    coupleName !== (couple.couple_name ?? '') ||
    anniversary !== (couple.anniversary_date ?? '') ||
    displayName !== profile.display_name;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateCouple({
        couple_name: coupleName.trim() || null,
        anniversary_date: anniversary || null,
      });
      await updateProfile({ display_name: displayName.trim() });
    } catch {
      setError(s.errors.generic);
    } finally {
      setSaving(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(couple!.invite_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The code is legible on screen regardless.
    }
  }

  async function onRotate() {
    setConfirmRotate(false);
    setRotating(true);
    try {
      await rotateInviteCode();
    } catch {
      setError(s.errors.generic);
    } finally {
      setRotating(false);
    }
  }

  async function onSignOut() {
    // The read cache holds one couple's data; it must not survive into
    // whoever signs in next on this device.
    clearTableCache();
    await signOut();
  }

  const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: s.settings.themeLight, icon: Sun },
    { value: 'dark', label: s.settings.themeDark, icon: Moon },
    { value: 'system', label: s.settings.themeSystem, icon: Monitor },
  ];

  return (
    <div>
      <PageHeader kicker={s.nav.settings} title={s.settings.title} />

      <div className="flex flex-col gap-8">
        {/* --- The space ---------------------------------------------------- */}
        <section>
          <h2 className="label-kicker mb-3">{s.settings.space}</h2>
          <Sheet className="flex flex-col gap-4 p-5">
            <TextField
              label={s.settings.coupleName}
              value={coupleName}
              onChange={(event) => setCoupleName(event.target.value)}
              placeholder={s.onboarding.coupleNamePlaceholder}
              optional
            />
            <TextField
              label={s.settings.anniversary}
              type="date"
              value={anniversary}
              onChange={(event) => setAnniversary(event.target.value)}
              hint={s.onboarding.anniversaryHint}
              optional
            />
            <SelectField
              label={s.settings.currency}
              value={couple.currency}
              onChange={(event) =>
                void updateCouple({ currency: event.target.value as CurrencyColumn })
              }
              hint={s.onboarding.currencyHint}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {CURRENCY_SYMBOLS[code]} {code}
                </option>
              ))}
            </SelectField>

            <TextField
              label={s.settings.displayName}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />

            {error && <ErrorNote>{error}</ErrorNote>}

            {dirty && (
              <div className="flex justify-end">
                <Button variant="primary" onClick={() => void save()} disabled={saving}>
                  {saving ? s.common.saving : s.common.save}
                </Button>
              </div>
            )}
          </Sheet>
        </section>

        {/* --- The two of you ------------------------------------------------ */}
        <section>
          <h2 className="label-kicker mb-3">{s.settings.partner}</h2>
          <Sheet className="p-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Seal name={names.myName} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-display text-base text-ink">{names.myName}</p>
                  <p className="text-xs text-ink-faint">
                    {profile.role === 'partner_a' ? s.settings.roleA : s.settings.roleB}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {partner ? (
                  <>
                    <Seal name={partner.display_name || '·'} tone="jade" size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-display text-base text-ink">
                        {partner.display_name}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {partner.role === 'partner_a' ? s.settings.roleA : s.settings.roleB}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ink-soft">
                    {s.settings.partnerNotJoined} — {s.settings.partnerInvite}
                  </p>
                )}
              </div>

              <p className="text-xs leading-relaxed text-ink-faint">{s.settings.roleHint}</p>

              <div className="rule-ink" />

              <div>
                <p className="label-kicker mb-2">{s.settings.inviteCode}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="select-all font-mono text-lg font-semibold tracking-[0.25em] text-cinnabar">
                    {couple.invite_code}
                  </span>
                  <Button size="sm" onClick={() => void copyCode()}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? s.onboarding.inviteCopied : s.onboarding.inviteCopy}
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setConfirmRotate(true)} disabled={rotating}>
                    <RefreshCw className={cn('h-3.5 w-3.5', rotating && 'animate-spin')} />
                    {s.settings.rotateCode}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-ink-faint">{s.settings.rotateCodeHint}</p>
              </div>
            </div>
          </Sheet>
        </section>

        {/* --- Distance mode -------------------------------------------------- */}
        <section>
          <h2 className="label-kicker mb-3">{s.settings.distanceMode}</h2>
          <Sheet className="p-5">
            <Toggle
              label={couple.distance_mode ? s.distance.disable : s.distance.enable}
              hint={s.distance.enableHint}
              checked={couple.distance_mode}
              onChange={(distance_mode) => void updateCouple({ distance_mode })}
            />
          </Sheet>
        </section>

        {/* --- Appearance ------------------------------------------------------ */}
        <section>
          <h2 className="label-kicker mb-3">{s.settings.appearance}</h2>
          <Sheet className="flex flex-col gap-4 p-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">{s.settings.theme}</legend>
              <div className="flex flex-wrap gap-2">
                {themes.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={preference === option.value}
                    onClick={() => setPreference(option.value)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-colors',
                      preference === option.value
                        ? 'border-cinnabar bg-cinnabar/10 text-ink'
                        : 'border-rule text-ink-soft hover:border-ink-faint hover:text-ink',
                    )}
                  >
                    <option.icon className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <SelectField
              label={s.settings.language}
              value={profile.locale}
              onChange={(event) => void updateProfile({ locale: event.target.value })}
            >
              {AVAILABLE_LOCALES.map((code: LocaleCode) => (
                <option key={code} value={code}>
                  {LOCALE_NAMES[code]}
                </option>
              ))}
            </SelectField>
          </Sheet>
        </section>

        {/* --- Privacy ---------------------------------------------------------- */}
        <section>
          <h2 className="label-kicker mb-3">{s.settings.privacy}</h2>
          <Sheet className="flex items-start gap-3 p-5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
            <p className="text-pretty text-sm leading-relaxed text-ink-soft">
              {s.settings.privacyBody}
            </p>
          </Sheet>
        </section>

        {/* --- Out --------------------------------------------------------------- */}
        <section className="pb-4">
          <Button variant="danger" onClick={() => void onSignOut()}>
            <LogOut className="h-4 w-4" />
            {s.settings.signOut}
          </Button>
        </section>
      </div>

      <ConfirmDialog
        open={confirmRotate}
        title={s.settings.rotateConfirm}
        body={s.settings.rotateConfirmBody}
        confirmLabel={s.settings.rotateCode}
        onCancel={() => setConfirmRotate(false)}
        onConfirm={() => void onRotate()}
      />
    </div>
  );
}
