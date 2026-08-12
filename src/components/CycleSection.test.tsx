import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, HER_ID, HIM_ID, lastWriteTo, mountSignedIn } from '@/test/harness';
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

const { CycleSection } = await import('./CycleSection');

/**
 * The two switches, driven.
 *
 * `cycle.ts` has fourteen tests for the arithmetic. The control that
 * decides who is allowed to see any of it had none — which is an odd
 * place for the gap, because the maths being wrong is an inconvenience
 * and the consent being wrong is the thing the whole table was designed
 * around.
 *
 * What is checked here is the separation: that tracking and sharing are
 * two decisions, that turning tracking off never turns sharing on, and
 * that the partner's view stays a date and nothing more.
 */

function cycleRow(profileId: string, startedOn: string) {
  return {
    id: `c-${startedOn}-${profileId.slice(0, 4)}`,
    profile_id: profileId,
    couple_id: COUPLE_ID,
    started_on: startedOn,
    note: null,
    created_at: `${startedOn}T08:00:00.000Z`,
  };
}

function mount(options: Parameters<typeof mountSignedIn>[1] = {}) {
  return mountSignedIn(<CycleSection />, {
    ...options,
    seed: (db) => {
      db.seed('cycle_events', []);
      options.seed?.(db);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('two switches, not one', () => {
  it('offers nothing but the tracking switch until tracking is on', async () => {
    mount({ profile: { cycle_tracking: false, cycle_shared: false } });

    await screen.findByRole('switch', { name: /Track my cycle/i });
    expect(
      screen.queryByRole('switch', { name: /Let my partner see/i }),
    ).not.toBeInTheDocument();
  });

  it('turns tracking on without turning sharing on with it', async () => {
    const user = userEvent.setup();
    const { db } = mount({ profile: { cycle_tracking: false, cycle_shared: false } });

    await user.click(await screen.findByRole('switch', { name: /Track my cycle/i }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'profiles')?.values).toEqual({ cycle_tracking: true });
    });
    // Wanting to know your own cycle and wanting somebody else to know it
    // are two decisions. Bundling them decides the second one for you.
    expect(lastWriteTo(db, 'profiles')?.values).not.toHaveProperty('cycle_shared');
  });

  it('shares only when asked, and revokes on the same switch', async () => {
    const user = userEvent.setup();
    const { db } = mount({ profile: { cycle_tracking: true, cycle_shared: false } });

    const share = await screen.findByRole('switch', { name: /Let my partner see/i });
    await user.click(share);
    await waitFor(() => {
      expect(lastWriteTo(db, 'profiles')?.values).toEqual({ cycle_shared: true });
    });
  });

  it('takes it back', async () => {
    const user = userEvent.setup();
    const { db } = mount({ profile: { cycle_tracking: true, cycle_shared: true } });

    await user.click(await screen.findByRole('switch', { name: /Let my partner see/i }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'profiles')?.values).toEqual({ cycle_shared: false });
    });
  });
});

describe('recording one', () => {
  it('writes the day, and never a couple_id', async () => {
    const user = userEvent.setup();
    const { db } = mount({ profile: { cycle_tracking: true } });

    await user.click(await screen.findByRole('button', { name: /Started today|Add/i }));

    await waitFor(() => {
      const write = lastWriteTo(db, 'cycle_events');
      expect(write?.op).toBe('insert');
      expect(write?.values).toHaveProperty('started_on');
    });
    // The trigger in 0011 fills couple_id in from the profile. Sending one
    // would be a way to write into somebody else's space.
    expect(lastWriteTo(db, 'cycle_events')?.values).not.toHaveProperty('couple_id');
  });
});

describe('what the partner is shown', () => {
  const history = (id: string) => [
    cycleRow(id, '2026-06-04'),
    cycleRow(id, '2026-05-06'),
    cycleRow(id, '2026-04-08'),
    cycleRow(id, '2026-03-11'),
  ];

  it('shows nothing at all while it is unshared', async () => {
    mount({
      profile: { cycle_tracking: false, cycle_shared: false },
      partner: { cycle_tracking: true, cycle_shared: false },
      seed: (db) => db.seed('cycle_events', history(HER_ID)),
    });

    await screen.findByRole('switch', { name: /Track my cycle/i });
    const page = within(document.body);
    expect(page.queryByText(/next is expected/i)).not.toBeInTheDocument();
  });

  /**
   * The line this feature is built on. A date and a countdown is
   * information; a mood forecast turns a person's body into a weather
   * report to be managed around, which is degrading in a way that is
   * easy to miss when it is phrased helpfully.
   */
  it('never offers advice about how to behave', async () => {
    mount({
      profile: { cycle_tracking: false, cycle_shared: false },
      partner: { cycle_tracking: true, cycle_shared: true },
      seed: (db) => db.seed('cycle_events', history(HER_ID)),
    });

    await screen.findByRole('switch', { name: /Track my cycle/i });
    const page = within(document.body);
    for (const forbidden of [/moody/i, /irritable/i, /be patient/i, /be gentle/i, /pms/i]) {
      expect(page.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });

  it('keeps one person’s history out of the other’s estimate', async () => {
    mount({
      profile: { cycle_tracking: true, cycle_shared: false },
      seed: (db) =>
        db.seed('cycle_events', [...history(HER_ID), cycleRow(HIM_ID, '2026-06-20')]),
    });

    await screen.findByRole('switch', { name: /Track my cycle/i });
    // One observation of mine is not a cycle length, and the partner's
    // four are not mine. Nothing should be predicted from the mix.
    expect(screen.queryByText(/Next expected/i)).not.toBeInTheDocument();
  });
});
