import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, mountUnpaired } from '@/test/harness';
import { resetWriteFailure } from '@/data/write-status';

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

const { OnboardingScreen } = await import('./OnboardingScreen');

/**
 * The first five minutes.
 *
 * If pairing fails nothing else in the app matters, and it is the one flow
 * where the reader has no prior sense of what should happen — so a dead
 * button here reads as a broken product rather than a broken button.
 *
 * Two of these check the explanation rather than the mechanism. The
 * shared/private split is the app's central promise, and a promise nobody
 * was shown is not one that was made.
 */

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

async function walkToChoice(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Next|Welcome|Start/i }));
  await user.click(await screen.findByRole('button', { name: /Next/i }));
  await user.click(await screen.findByRole('button', { name: /Next/i }));
}

describe('what the reader is told before anything else', () => {
  it('explains the two kinds of notes, in both directions', async () => {
    const user = userEvent.setup();
    mountUnpaired(<OnboardingScreen />);

    await user.click(await screen.findByRole('button', { name: /Next/i }));

    expect(await screen.findByText(/Two kinds of notes/)).toBeInTheDocument();
    expect(
      screen.getByText(/Your partner cannot see these, and the app will never show them a count/),
    ).toBeInTheDocument();
    // The sentence that stops the private half reading as surveillance.
    expect(screen.getByText(/This is not a file on your partner/)).toBeInTheDocument();
  });

  it('says outright that there is no running tab', async () => {
    const user = userEvent.setup();
    mountUnpaired(<OnboardingScreen />);

    await user.click(await screen.findByRole('button', { name: /Next/i }));
    await user.click(await screen.findByRole('button', { name: /Next/i }));

    expect(await screen.findByText(/no running tab, no “who owes whom”, and no debt/)).toBeInTheDocument();
  });
});

describe('creating a space', () => {
  it('calls the pairing function and then shows the code to share', async () => {
    const user = userEvent.setup();
    const { db } = mountUnpaired(<OnboardingScreen />);
    db.rpcs.set('create_couple', (args) => ({
      data: {
        id: COUPLE_ID,
        invite_code: 'JNK42X',
        couple_name: (args as { p_couple_name?: string }).p_couple_name ?? null,
        currency: 'BRL',
      },
      error: null,
    }));

    await walkToChoice(user);
    await user.click(await screen.findByRole('button', { name: /Start a new space/i }));

    await user.type(await screen.findByLabelText(/What should we call the two of you/), 'Nós');
    await user.selectOptions(await screen.findByLabelText(/currency/i), 'BRL');
    await user.click(screen.getByRole('button', { name: /Create our space/i }));

    await waitFor(() => {
      expect(db.rpcCalls.map((call) => call.name)).toContain('create_couple');
    });
    const call = db.rpcCalls.find((c) => c.name === 'create_couple');
    expect(call?.args).toMatchObject({ p_couple_name: 'Nós', p_currency: 'BRL' });

    // Creating without then seeing the code would leave the second person
    // with no way in.
    expect(await screen.findByText('JNK42X')).toBeInTheDocument();
  });

  it('creates through the function, never by inserting a couple directly', async () => {
    const user = userEvent.setup();
    const { db } = mountUnpaired(<OnboardingScreen />);
    db.rpcs.set('create_couple', () => ({
      data: { id: COUPLE_ID, invite_code: 'JNK42X', couple_name: null, currency: 'EUR' },
      error: null,
    }));

    await walkToChoice(user);
    await user.click(await screen.findByRole('button', { name: /Start a new space/i }));
    await user.click(await screen.findByRole('button', { name: /Create our space/i }));

    await waitFor(() => {
      expect(db.rpcCalls.map((c) => c.name)).toContain('create_couple');
    });
    // A direct insert would leave the profile unlinked, because only the
    // SECURITY DEFINER function may set couple_id and role.
    expect(db.writes.filter((w) => w.table === 'couples')).toHaveLength(0);
    expect(db.writes.filter((w) => w.table === 'profiles')).toHaveLength(0);
  });
});

describe('joining a space', () => {
  it('sends the code upper-cased and trimmed, so a pasted one still works', async () => {
    const user = userEvent.setup();
    const { db } = mountUnpaired(<OnboardingScreen />);
    db.rpcs.set('join_couple', () => ({ data: { id: COUPLE_ID }, error: null }));

    await walkToChoice(user);
    await user.click(await screen.findByRole('button', { name: /Join your partner/i }));
    await user.type(await screen.findByLabelText(/Invite code/i), '  jnk42x  ');
    await user.click(screen.getByRole('button', { name: /^Join$/i }));

    await waitFor(() => {
      const call = db.rpcCalls.find((c) => c.name === 'join_couple');
      expect(call?.args).toEqual({ p_invite_code: 'JNK42X' });
    });
  });

  it('says the code is wrong rather than failing silently', async () => {
    const user = userEvent.setup();
    const { db } = mountUnpaired(<OnboardingScreen />);
    db.rpcs.set('join_couple', () => ({
      data: null,
      error: { code: 'P0002', message: 'That invite code does not match anything.' },
    }));

    await walkToChoice(user);
    await user.click(await screen.findByRole('button', { name: /Join your partner/i }));
    await user.type(await screen.findByLabelText(/Invite code/i), 'NPE992');
    await user.click(screen.getByRole('button', { name: /^Join$/i }));

    expect(await screen.findByText(/doesn’t match anything/i)).toBeInTheDocument();
  });

  it('says the space is full when the second seat is already taken', async () => {
    const user = userEvent.setup();
    const { db } = mountUnpaired(<OnboardingScreen />);
    db.rpcs.set('join_couple', () => ({
      data: null,
      error: { code: 'P0003', message: 'This space already has two people in it.' },
    }));

    await walkToChoice(user);
    await user.click(await screen.findByRole('button', { name: /Join your partner/i }));
    await user.type(await screen.findByLabelText(/Invite code/i), 'FULLZ2');
    await user.click(screen.getByRole('button', { name: /^Join$/i }));

    expect(await screen.findByText(/already has two people/i)).toBeInTheDocument();
  });
});

describe('changing your mind', () => {
  it('can go back from creating to the choice', async () => {
    const user = userEvent.setup();
    mountUnpaired(<OnboardingScreen />);

    await walkToChoice(user);
    await user.click(await screen.findByRole('button', { name: /Start a new space/i }));
    await user.click(await screen.findByRole('button', { name: /^Back$/i }));

    expect(await screen.findByRole('button', { name: /Join your partner/i })).toBeInTheDocument();
  });
});
