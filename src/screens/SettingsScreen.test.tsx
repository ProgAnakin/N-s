import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSupabase } from '@/test/fake-supabase';
import { COUPLE_ID, HIM_ID, lastWriteTo, mountSignedIn } from '@/test/harness';
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

const { SettingsScreen } = await import('./SettingsScreen');
const { WriteFailureBanner } = await import('@/components/WriteFailureBanner');

/**
 * Settings, driven the way somebody actually uses it.
 *
 * The point of testing this screen specifically is that it is almost
 * entirely fire-and-forget writes, which is the shape most likely to look
 * like it works and not.
 */

function mount(options: Parameters<typeof mountSignedIn>[1] = {}) {
  return mountSignedIn(
    <>
      <SettingsScreen />
      <WriteFailureBanner />
    </>,
    {
      ...options,
      seed: (db) => {
        db.seed('places', []);
        db.seed('checkins', []);
        options.seed?.(db);
      },
    },
  );
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('the space', () => {
  it('saves the name and anniversary together, only once asked', async () => {
    const user = userEvent.setup();
    const { db } = mount({ couple: { couple_name: 'Léo & Yan' } });

    const nameField = await screen.findByLabelText(/^Name/);
    await user.clear(nameField);
    await user.type(nameField, 'Nós dois');

    // Typing alone must not write — the Save button is the commit.
    expect(lastWriteTo(db, 'couples')).toBeUndefined();

    await user.click(await screen.findByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(db.rowsOf('couples')[0]?.couple_name).toBe('Nós dois');
    });
  });

  it('changes the currency straight away', async () => {
    const user = userEvent.setup();
    const { db } = mount({ couple: { currency: 'EUR' } });

    await user.selectOptions(await screen.findByLabelText(/currency/i), 'BRL');

    await waitFor(() => {
      expect(lastWriteTo(db, 'couples')?.values).toEqual({ currency: 'BRL' });
    });
  });

  it('offers only currencies the database will accept', async () => {
    mount();
    const select = await screen.findByLabelText(/currency/i);
    const offered = within(select)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);
    // The CHECK constraint in 0001 lists exactly these.
    expect(offered).toEqual(['EUR', 'BRL', 'CNY', 'USD']);
  });
});

describe('the optional features', () => {
  it('turns the together log on, which is what reveals its page', async () => {
    const user = userEvent.setup();
    const { db } = mount({ couple: { intimacy_mode: false } });

    await user.click(await screen.findByRole('switch', { name: /Turn.*on|Together/i }));

    await waitFor(() => {
      expect(db.rowsOf('couples')[0]?.intimacy_mode).toBe(true);
    });
  });

  it('turns distance mode off', async () => {
    const user = userEvent.setup();
    const { db } = mount({ couple: { distance_mode: true } });

    const toggles = await screen.findAllByRole('switch');
    const distance = toggles.find((toggle) =>
      /distance|apart/i.test(toggle.closest('div')?.textContent ?? ''),
    );
    expect(distance).toBeDefined();
    await user.click(distance!);

    await waitFor(() => {
      expect(db.rowsOf('couples')[0]?.distance_mode).toBe(false);
    });
  });
});

describe('the invite code', () => {
  it('rotates through the function, not a direct write', async () => {
    const user = userEvent.setup();
    const { db } = mount();
    db.rpcs.set('rotate_invite_code', () => {
      const couple = db.rowsOf('couples')[0];
      if (couple) couple.invite_code = 'XYZ789';
      return { data: 'XYZ789', error: null };
    });

    await user.click(await screen.findByRole('button', { name: /Get a new code/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Get a new code/ }));

    await waitFor(() => {
      expect(db.rpcCalls.map((call) => call.name)).toContain('rotate_invite_code');
    });
    // A direct update would be refused by the freeze trigger in 0005.
    expect(lastWriteTo(db, 'couples')).toBeUndefined();
    expect(await screen.findByText('XYZ789')).toBeInTheDocument();
  });

  it('asks before replacing it, since the old one stops working', async () => {
    const user = userEvent.setup();
    const { db } = mount();
    db.rpcs.set('rotate_invite_code', () => ({ data: 'XYZ789', error: null }));

    await user.click(await screen.findByRole('button', { name: /Get a new code/ }));
    expect(db.rpcCalls).toHaveLength(0);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Cancel/ }));
    expect(db.rpcCalls).toHaveLength(0);
  });
});

describe('leaving the couple', () => {
  it('goes through leave_couple(), because a direct update is frozen', async () => {
    const user = userEvent.setup();
    const { db } = mount();
    db.rpcs.set('leave_couple', () => {
      const profile = db.rowsOf('profiles').find((row) => row.id === HIM_ID);
      if (profile) {
        profile.couple_id = null;
        profile.role = null;
      }
      return { data: null, error: null };
    });

    await user.click(await screen.findByRole('button', { name: /Leave this space/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Leave this space/ }));

    await waitFor(() => {
      expect(db.rpcCalls.map((call) => call.name)).toContain('leave_couple');
    });
    expect(
      db.writes.filter((w) => w.table === 'profiles' && w.op === 'update'),
    ).toHaveLength(0);
  });

  it('asks first, because it is not obviously reversible', async () => {
    const user = userEvent.setup();
    const { db } = mount();
    db.rpcs.set('leave_couple', () => ({ data: null, error: null }));

    await user.click(await screen.findByRole('button', { name: /Leave this space/ }));
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('empties the read cache, so the next space does not inherit this one’s rows', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      `nos.cache.v1.memories.couple_id.${COUPLE_ID}.date`,
      JSON.stringify([{ id: 'x', title: 'ours' }]),
    );

    const { db } = mount();
    db.rpcs.set('leave_couple', () => ({ data: null, error: null }));

    await user.click(await screen.findByRole('button', { name: /Leave this space/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Leave this space/ }));

    await waitFor(() => {
      const leftOver = Object.keys(window.localStorage).filter((key) =>
        key.startsWith('nos.cache.'),
      );
      expect(leftOver).toEqual([]);
    });
  });
});

describe('signing out', () => {
  it('clears the cache before ending the session', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      `nos.cache.v1.expenses.couple_id.${COUPLE_ID}.date`,
      JSON.stringify([{ id: 'e1' }]),
    );

    const { db } = mount();
    await user.click(await screen.findByRole('button', { name: /Sign out/ }));

    await waitFor(() => {
      expect(db.auth.signOut).toHaveBeenCalled();
    });
    expect(
      Object.keys(window.localStorage).filter((key) => key.startsWith('nos.cache.')),
    ).toEqual([]);
  });
});

describe('when a write is refused', () => {
  it('says so rather than reverting in silence', async () => {
    const user = userEvent.setup();
    const { db } = mount({ couple: { currency: 'EUR' } });
    db.refuse('couples', 'update', FakeSupabase.rlsRefusal());

    await user.selectOptions(await screen.findByLabelText(/currency/i), 'CNY');

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t save/i);
  });
});
