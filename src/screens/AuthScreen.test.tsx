import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSignedOut } from '@/test/harness';

vi.mock('@/data/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/client')>();
  const { fakeClient } = await import('@/test/client-mock');
  return {
    ...actual,
    isConfigured: true,
    get supabase() {
      return fakeClient();
    },
    requireClient: () => fakeClient(),
  };
});

const { AuthScreen } = await import('./AuthScreen');

/**
 * The door.
 *
 * This was the last screen in the app with no coverage at all, which is
 * a strange place for a blind spot: if it breaks, none of the other
 * tests matter, and it is the one page where a person has no prior sense
 * of what should happen — so a dead button reads as a broken product.
 */

beforeEach(() => {
  window.localStorage.clear();
});

describe('signing in', () => {
  it('sends what was typed, trimmed of nothing it should not trim', async () => {
    const user = userEvent.setup();
    const { db } = mountSignedOut(<AuthScreen />);

    await user.type(await screen.findByLabelText(/Email/i), 'leo@example.com');
    await user.type(screen.getByLabelText(/Password/i), 'correct-horse');
    await user.click(screen.getByRole('button', { name: /Sign in/i }));

    await waitFor(() => {
      expect(db.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'leo@example.com',
        password: 'correct-horse',
      });
    });
  });

  it('says the credentials were wrong rather than failing silently', async () => {
    const user = userEvent.setup();
    const { db } = mountSignedOut(<AuthScreen />);
    db.auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { message: 'Invalid login credentials' },
    });

    await user.type(await screen.findByLabelText(/Email/i), 'leo@example.com');
    await user.type(screen.getByLabelText(/Password/i), 'wrong-one');
    await user.click(screen.getByRole('button', { name: /Sign in/i }));

    // The real string, not one I invented: 'That email and password didn't match.'
    expect(await screen.findByText(/didn’t match/i)).toBeInTheDocument();
  });
});

describe('what it refuses before touching the network', () => {
  /**
   * Each of these is a round trip saved and, more to the point, a
   * clearer message: the server's answer to a malformed address is not
   * a sentence anybody wants to read.
   */
  it('will not send an address that is not one', async () => {
    const user = userEvent.setup();
    const { db } = mountSignedOut(<AuthScreen />);

    await user.type(await screen.findByLabelText(/Email/i), 'leo@example');
    await user.type(screen.getByLabelText(/Password/i), 'long-enough');
    await user.click(screen.getByRole('button', { name: /Sign in/i }));

    expect(await screen.findByText(/doesn’t look like an email/i)).toBeInTheDocument();
    expect(db.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('holds the line on eight characters', async () => {
    const user = userEvent.setup();
    const { db } = mountSignedOut(<AuthScreen />);

    await user.type(await screen.findByLabelText(/Email/i), 'leo@example.com');
    await user.type(screen.getByLabelText(/Password/i), 'short');
    await user.click(screen.getByRole('button', { name: /Sign in/i }));

    expect(await screen.findByText(/at least 8/i)).toBeInTheDocument();
    expect(db.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('creating an account', () => {
  it('switches to sign-up and asks for a name as well', async () => {
    const user = userEvent.setup();
    mountSignedOut(<AuthScreen />);

    await user.click(await screen.findByRole('button', { name: /No account yet/i }));
    expect(await screen.findByLabelText(/Your name/i)).toBeInTheDocument();
  });

  it('carries the name through, so the seal is not blank on the first screen', async () => {
    const user = userEvent.setup();
    const { db } = mountSignedOut(<AuthScreen />);

    await user.click(await screen.findByRole('button', { name: /No account yet/i }));
    await user.type(await screen.findByLabelText(/Your name/i), 'Léo');
    await user.type(screen.getByLabelText(/Email/i), 'leo@example.com');
    await user.type(screen.getByLabelText(/Password/i), 'long-enough');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => {
      expect(db.auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'leo@example.com',
          options: expect.objectContaining({
            data: expect.objectContaining({ display_name: 'Léo' }),
          }),
        }),
      );
    });
  });

  /**
   * The name field carries `required`, so the browser's own constraint
   * validation stops the submit before any of this component's code
   * runs. That is fine behaviour — the native message is clear and
   * localised for free — but it does mean `s.errors.nameRequired` can
   * never appear, and asserting on it would be testing a string that has
   * no path to the screen. What matters is that nothing is sent.
   */
  it('will not create an account with no name on it', async () => {
    const user = userEvent.setup();
    const { db } = mountSignedOut(<AuthScreen />);

    await user.click(await screen.findByRole('button', { name: /No account yet/i }));
    await user.type(await screen.findByLabelText(/Email/i), 'leo@example.com');
    await user.type(screen.getByLabelText(/Password/i), 'long-enough');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    expect(screen.getByLabelText(/Your name/i)).toBeInvalid();
    expect(db.auth.signUp).not.toHaveBeenCalled();
  });

  /**
   * With "Confirm email" left on in Supabase, sign-up succeeds and
   * nothing happens — no session, no error. Without this screen the
   * person sits looking at a form that appeared to do nothing.
   */
  it('explains the wait when the address has to be confirmed first', async () => {
    const user = userEvent.setup();
    const { db } = mountSignedOut(<AuthScreen />);
    db.auth.signUp.mockResolvedValueOnce({
      data: { user: { id: 'x' }, session: null },
      error: null,
    });

    await user.click(await screen.findByRole('button', { name: /No account yet/i }));
    await user.type(await screen.findByLabelText(/Your name/i), 'Léo');
    await user.type(screen.getByLabelText(/Email/i), 'leo@example.com');
    await user.type(screen.getByLabelText(/Password/i), 'long-enough');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    expect(await screen.findByText(/Check your email/i)).toBeInTheDocument();
  });
});
