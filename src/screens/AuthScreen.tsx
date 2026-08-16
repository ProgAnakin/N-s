import { useState, type FormEvent } from 'react';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/password';
import { Cover } from '@/components/layout/Cover';
import { Button } from '@/components/ui/Button';
import { ErrorNote } from '@/components/ui/Bits';
import { TextField } from '@/components/ui/Field';
import { useSession } from '@/data/session';
import { useStrings } from '@/i18n';

type Mode = 'signIn' | 'signUp';

export function AuthScreen() {
  const s = useStrings();
  const { signIn, signUp } = useSession();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const isSignUp = mode === 'signUp';

  function validate(): string | null {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return s.errors.invalidEmail;
    if (isSignUp && !displayName.trim()) return s.errors.nameRequired;

    /**
     * The free-plan stand-in for "prevent use of leaked passwords", which
     * Supabase only sells on Pro. See lib/password.ts for why it is a
     * compiled-in list rather than a call to Have I Been Pwned.
     *
     * Only on sign-up. Running it at sign-in would tell somebody their
     * existing password is weak at the exact moment they cannot change it,
     * and would refuse an account that already exists — which is a lockout,
     * not a security measure.
     */
    if (isSignUp) {
      const problem = passwordProblem(password, { email, name: displayName });
      if (problem === 'too_short') return s.errors.weakPassword;
      if (problem === 'too_simple') return s.errors.passwordTooSimple;
      if (problem === 'too_common') return s.errors.passwordTooCommon;
      if (problem === 'looks_like_you') return s.errors.passwordLooksLikeYou;
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      return s.errors.weakPassword;
    }

    return null;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (isSignUp) {
        const { needsConfirmation } = await signUp(email, password, displayName);
        if (needsConfirmation) setConfirmationSent(true);
      } else {
        await signIn(email, password);
      }
    } catch {
      setError(isSignUp ? s.errors.signUp : s.errors.signIn);
    } finally {
      setBusy(false);
    }
  }

  if (confirmationSent) {
    return (
      <Cover title={s.app.name} subtitle={s.auth.checkEmail}>
        <Button
          block
          variant="secondary"
          onClick={() => {
            setConfirmationSent(false);
            setMode('signIn');
          }}
        >
          {s.auth.signIn}
        </Button>
      </Cover>
    );
  }

  return (
    <Cover
      title={isSignUp ? s.auth.signUpTitle : s.auth.signInTitle}
      subtitle={isSignUp ? s.auth.signUpSubtitle : s.auth.signInSubtitle}
      footer={
        <p className="text-center text-xs leading-relaxed text-ink-faint">{s.app.meaning}</p>
      }
    >
      <form onSubmit={onSubmit} className="sheet flex flex-col gap-4 p-5">
        {isSignUp && (
          <TextField
            label={s.auth.displayName}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
            required
          />
        )}

        <TextField
          label={s.auth.email}
          type="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />

        <TextField
          label={s.auth.password}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          hint={isSignUp ? s.auth.passwordHint : undefined}
          required
        />

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          {busy ? (isSignUp ? s.auth.creating : s.auth.signingIn) : isSignUp ? s.auth.signUp : s.auth.signIn}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode(isSignUp ? 'signIn' : 'signUp');
            setError(null);
          }}
          className="rounded-sm py-1 text-center text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          {isSignUp ? s.auth.toSignIn : s.auth.toSignUp}
        </button>
      </form>
    </Cover>
  );
}
