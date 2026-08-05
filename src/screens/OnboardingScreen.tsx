import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Eye, Lock, Scale } from 'lucide-react';
import { Cover } from '@/components/layout/Cover';
import { Button } from '@/components/ui/Button';
import { ErrorNote } from '@/components/ui/Bits';
import { SelectField, TextField } from '@/components/ui/Field';
import { PairingError, useSession } from '@/data/session';
import type { CurrencyColumn } from '@/data/database.types';
import { CURRENCIES, CURRENCY_SYMBOLS } from '@/lib/money';
import { useStrings } from '@/i18n';

type Step = 'welcome' | 'privacy' | 'money' | 'choose' | 'create' | 'join' | 'invite';

/**
 * Onboarding.
 *
 * The two explanatory steps in the middle are not filler and are not
 * skippable. This app holds private notes about a real person and a record of
 * money between two people; both of those are easy to misread, and the time
 * to say what they are is before anything has been written.
 */
export function OnboardingScreen() {
  const s = useStrings();
  const { createCouple, joinCouple, reload, signOut } = useSession();

  const [step, setStep] = useState<Step>('welcome');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);

  const [coupleName, setCoupleName] = useState('');
  const [anniversary, setAnniversary] = useState('');
  const [currency, setCurrency] = useState<CurrencyColumn>('EUR');
  const [joinCode, setJoinCode] = useState('');

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const couple = await createCouple({
        coupleName: coupleName.trim() || null,
        anniversary: anniversary || null,
        currency,
      });
      setInviteCode(couple.invite_code);
      setStep('invite');
    } catch (caught) {
      setError(
        caught instanceof PairingError && caught.reason === 'already_paired'
          ? s.errors.alreadyPaired
          : s.errors.generic,
      );
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await joinCouple(joinCode);
    } catch (caught) {
      if (caught instanceof PairingError) {
        setError(
          caught.reason === 'invalid'
            ? s.errors.inviteInvalid
            : caught.reason === 'full'
              ? s.errors.inviteFull
              : caught.reason === 'already_paired'
                ? s.errors.alreadyPaired
                : s.errors.generic,
        );
      } else {
        setError(s.errors.generic);
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the code is on screen to read anyway.
    }
  }

  // ---------------------------------------------------------------- welcome
  if (step === 'welcome') {
    return (
      <Cover
        title={s.onboarding.welcomeTitle}
        subtitle={s.onboarding.welcomeBody}
        footer={<SignOutLine onSignOut={signOut} label={s.auth.signOut} />}
      >
        <Button variant="primary" size="lg" block onClick={() => setStep('privacy')}>
          {s.onboarding.next}
        </Button>
      </Cover>
    );
  }

  // ---------------------------------------------------------------- privacy
  if (step === 'privacy') {
    return (
      <Cover title={s.onboarding.privacyTitle}>
        <div className="flex flex-col gap-3">
          <ExplainerCard
            icon={<Eye className="h-4 w-4" />}
            tone="jade"
            title={s.onboarding.privacySharedTitle}
            body={s.onboarding.privacySharedBody}
          />
          <ExplainerCard
            icon={<Lock className="h-4 w-4" />}
            tone="ink"
            title={s.onboarding.privacyPrivateTitle}
            body={s.onboarding.privacyPrivateBody}
          />
          <p className="px-1 pt-2 text-pretty text-sm leading-relaxed text-ink-soft">
            {s.onboarding.privacyPromise}
          </p>
          <Button variant="primary" size="lg" block onClick={() => setStep('money')} className="mt-3">
            {s.onboarding.next}
          </Button>
        </div>
      </Cover>
    );
  }

  // ------------------------------------------------------------------ money
  if (step === 'money') {
    return (
      <Cover title={s.onboarding.moneyTitle}>
        <div className="flex flex-col gap-3">
          <ExplainerCard
            icon={<Scale className="h-4 w-4" />}
            tone="cinnabar"
            title={s.spending.title}
            body={s.onboarding.moneyBody}
          />
          <p className="px-1 text-pretty text-sm leading-relaxed text-ink-soft">
            {s.onboarding.moneyBody2}
          </p>
          <Button variant="primary" size="lg" block onClick={() => setStep('choose')} className="mt-3">
            {s.onboarding.next}
          </Button>
        </div>
      </Cover>
    );
  }

  // ----------------------------------------------------------------- choose
  if (step === 'choose') {
    return (
      <Cover title={s.onboarding.setupTitle} subtitle={s.onboarding.setupBody}>
        <div className="flex flex-col gap-3">
          <ChoiceCard
            title={s.onboarding.createTitle}
            body={s.onboarding.createBody}
            onClick={() => setStep('create')}
          />
          <ChoiceCard
            title={s.onboarding.joinTitle}
            body={s.onboarding.joinBody}
            onClick={() => setStep('join')}
          />
        </div>
      </Cover>
    );
  }

  // ----------------------------------------------------------------- create
  if (step === 'create') {
    return (
      <Cover title={s.onboarding.createTitle} subtitle={s.onboarding.setupBody}>
        <form onSubmit={onCreate} className="sheet flex flex-col gap-4 p-5">
          <TextField
            label={s.onboarding.coupleName}
            placeholder={s.onboarding.coupleNamePlaceholder}
            value={coupleName}
            onChange={(event) => setCoupleName(event.target.value)}
            optional
          />
          <TextField
            label={s.onboarding.anniversary}
            type="date"
            value={anniversary}
            onChange={(event) => setAnniversary(event.target.value)}
            hint={s.onboarding.anniversaryHint}
            optional
          />
          <SelectField
            label={s.onboarding.currency}
            hint={s.onboarding.currencyHint}
            value={currency}
            onChange={(event) => setCurrency(event.target.value as CurrencyColumn)}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {CURRENCY_SYMBOLS[code]} {code}
              </option>
            ))}
          </SelectField>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="flex gap-2">
            <Button onClick={() => setStep('choose')}>{s.common.back}</Button>
            <Button type="submit" variant="primary" block disabled={busy}>
              {busy ? s.common.saving : s.onboarding.createSpace}
            </Button>
          </div>
        </form>
      </Cover>
    );
  }

  // ------------------------------------------------------------------- join
  if (step === 'join') {
    return (
      <Cover title={s.onboarding.joinTitle} subtitle={s.onboarding.joinBody}>
        <form onSubmit={onJoin} className="sheet flex flex-col gap-4 p-5">
          <TextField
            label={s.onboarding.inviteCode}
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            placeholder="ABC123"
            className="[&_input]:text-center [&_input]:font-mono [&_input]:text-xl [&_input]:tracking-[0.3em]"
            required
          />

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="flex gap-2">
            <Button onClick={() => setStep('choose')}>{s.common.back}</Button>
            <Button type="submit" variant="primary" block disabled={busy || joinCode.length < 6}>
              {busy ? s.common.saving : s.onboarding.joinSpace}
            </Button>
          </div>
        </form>
      </Cover>
    );
  }

  // ----------------------------------------------------------------- invite
  return (
    <Cover title={s.onboarding.inviteTitle} subtitle={s.onboarding.inviteBody}>
      <div className="sheet flex flex-col items-center gap-5 p-6">
        <motion.p
          initial={{ scale: 1.15, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 24 }}
          className="select-all font-mono text-3xl font-semibold tracking-[0.3em] text-cinnabar"
        >
          {inviteCode}
        </motion.p>

        <Button onClick={copyCode} className="min-w-[9rem]">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? s.onboarding.inviteCopied : s.onboarding.inviteCopy}
        </Button>

        <p className="text-pretty text-center text-sm leading-relaxed text-ink-soft">
          {s.onboarding.inviteWaiting}
        </p>

        <Button variant="primary" size="lg" block onClick={() => void reload()}>
          {s.onboarding.startUsing}
        </Button>
      </div>
    </Cover>
  );
}

function ExplainerCard({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: 'jade' | 'ink' | 'cinnabar';
}) {
  return (
    <div className="sheet p-4">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={
            tone === 'jade'
              ? 'text-jade'
              : tone === 'cinnabar'
                ? 'text-cinnabar'
                : 'text-ink-soft'
          }
        >
          {icon}
        </span>
        <h2 className="font-display text-base font-medium text-ink">{title}</h2>
      </div>
      <p className="text-pretty text-sm leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}

function ChoiceCard({
  title,
  body,
  onClick,
}: {
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="sheet p-4 text-left transition-colors hover:border-cinnabar"
    >
      <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{body}</p>
    </button>
  );
}

function SignOutLine({ onSignOut, label }: { onSignOut: () => Promise<void>; label: string }) {
  return (
    <p className="text-center">
      <button
        type="button"
        onClick={() => void onSignOut()}
        className="rounded-sm text-xs text-ink-faint underline-offset-4 hover:text-ink hover:underline"
      >
        {label}
      </button>
    </p>
  );
}
