import { useState, type FormEvent } from 'react';
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
    if (password.length < 8) return s.errors.weakPassword;
    if (isSignUp && !displayName.trim()) return s.errors.nameRequired;
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
