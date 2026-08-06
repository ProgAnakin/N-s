import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, mountSignedIn } from '@/test/harness';
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

const { EndingSection } = await import('./EndingSection');

/**
 * The hardest screen in the app.
 *
 * These tests are about restraint as much as function: that it does not
 * appear until somebody looks for it, that it cannot be triggered by a
 * thumb landing somewhere, that it never destroys anything on the first
 * press — and that it does not deliver a solemn speech to a couple undoing
 * a pairing they made by mistake last week.
 */

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function mount(options: Parameters<typeof mountSignedIn>[1] = {}) {
  return mountSignedIn(<EndingSection />, {
    ...options,
    seed: (db) => {
      for (const table of ['memories', 'memory_photos', 'letters', 'plans', 'places']) {
        db.seed(table, []);
      }
      options.seed?.(db);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('how it is reached', () => {
  it('is a quiet link, not a red button sitting on the page', async () => {
    mount();
    const trigger = await screen.findByRole('button', { name: /End this/i });
    // A destructive action nobody is looking for should not look like the
    // primary thing to do on the page.
    expect(trigger.className).not.toMatch(/bg-(stamp|cinnabar)\b/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('what it asks before it acts', () => {
  it('will not proceed on a tap alone', async () => {
    const user = userEvent.setup();
    const { db } = mount();
    db.rpcs.set('end_couple', () => ({ data: null, error: null }));

    await user.click(await screen.findByRole('button', { name: /End this/i }));
    const dialog = await screen.findByRole('dialog');

    // The confirm is disabled until the word is typed. This is not friction
    // for its own sake — it is the difference between a thumb landing
    // somewhere and a decision.
    expect(within(dialog).getByRole('button', { name: /Close the space/i })).toBeDisabled();
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('proceeds once the word is typed, and only then', async () => {
    const user = userEvent.setup();
    const { db } = mount();
    db.rpcs.set('end_couple', () => ({ data: null, error: null }));

    await user.click(await screen.findByRole('button', { name: /End this/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Type END/i), 'END');
    await user.click(within(dialog).getByRole('button', { name: /Close the space/i }));

    await waitFor(() => {
      expect(db.rpcCalls.map((call) => call.name)).toContain('end_couple');
    });
  });

  it('is not fooled by nearly the right word', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: /End this/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Type END/i), 'ENDD');

    expect(within(dialog).getByRole('button', { name: /Close the space/i })).toBeDisabled();
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('says plainly that nothing is deleted and that either of them can undo it', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /End this/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(/Nothing is deleted/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/not just whoever pressed this/i)).toBeInTheDocument();
    // And that the app will not go behind their back.
    expect(within(dialog).getByText(/not notified by the app/i)).toBeInTheDocument();
  });

  it('does not argue for staying', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /End this/i }));

    // Somebody leaving a relationship that was hurting them should not have
    // to argue with a piece of software on the way out.
    expect(
      screen.getByText(/None of this is an argument for staying/i),
    ).toBeInTheDocument();
  });
});

describe('what it shows first', () => {
  it('shows what is in the space when there is something to look at', async () => {
    const user = userEvent.setup();
    mount({
      couple: { anniversary_date: '2023-06-12' },
      seed: (db) => {
        db.seed('memories', [
          { id: 'm1', couple_id: COUPLE_ID },
          { id: 'm2', couple_id: COUPLE_ID },
          { id: 'm3', couple_id: COUPLE_ID },
        ]);
      },
    });

    await user.click(await screen.findByRole('button', { name: /End this/i }));
    expect(await screen.findByText(/3 memories/)).toBeInTheDocument();
    expect(screen.getByText(/days together/)).toBeInTheDocument();
  });

  it('stays quiet for a pairing made by mistake last week', async () => {
    const user = userEvent.setup();
    const recent = isoDaysAgo(3);
    mount({ couple: { anniversary_date: recent } });

    await user.click(await screen.findByRole('button', { name: /End this/i }));
    // A solemn page about three days together is the app being
    // self-important, and it cheapens the gesture for whoever needs it.
    await screen.findByRole('dialog');
    expect(screen.queryByText(/What’s in here right now/)).not.toBeInTheDocument();
  });
});

describe('after it has ended', () => {
  it('offers to reopen it, and says either of them can', async () => {
    mount({ couple: { ended_on: isoDaysAgo(5) } });

    expect(await screen.findByText(/This space is closed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reopen it/i })).toBeInTheDocument();
    expect(screen.getByText(/Either of you can/i)).toBeInTheDocument();
    // And no way to end something already ended.
    expect(screen.queryByRole('button', { name: /End this/i })).not.toBeInTheDocument();
  });

  it('reopens through the function', async () => {
    const user = userEvent.setup();
    const { db } = mount({ couple: { ended_on: isoDaysAgo(5) } });
    db.rpcs.set('reopen_couple', () => ({ data: null, error: null }));

    await user.click(await screen.findByRole('button', { name: /Reopen it/i }));
    await waitFor(() => {
      expect(db.rpcCalls.map((call) => call.name)).toContain('reopen_couple');
    });
  });

  it('counts down the window honestly', async () => {
    mount({ couple: { ended_on: isoDaysAgo(10) } });
    expect(await screen.findByText(/20 more days/)).toBeInTheDocument();
  });

  it('stops offering to reopen once the window has passed, and still says it is readable', async () => {
    mount({ couple: { ended_on: isoDaysAgo(45) } });

    await screen.findByText(/This space is closed/i);
    expect(screen.queryByRole('button', { name: /Reopen it/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Everything is still here to read/i)).toBeInTheDocument();
  });

  it('reminds them the memories are still theirs to take', async () => {
    mount({ couple: { ended_on: isoDaysAgo(45) } });
    expect(await screen.findByText(/still yours/i)).toBeInTheDocument();
  });
});
