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

const { MyWishesSection, PartnerWishesSection } = await import('./WishesSection');

/**
 * Three wishes, from both sides.
 *
 * The maths is covered in wishes.test.ts. What is checked here is the
 * seam, which is where this feature can quietly go wrong: that the person
 * writing a wish is told their partner will read it, that the partner can
 * grant one and cannot reword one, and that granting frees a seat rather
 * than leaving somebody stuck at three for ever.
 */

function wishRow(overrides: Record<string, unknown> = {}) {
  return {
    id: `wish-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    profile_id: HIM_ID,
    title: 'The green coat',
    note: null,
    photo_path: null,
    link: null,
    slot: 1,
    granted_on: null,
    granted_by: null,
    granted_note: null,
    created_at: '2026-03-01T09:00:00.000Z',
    updated_at: '2026-03-01T09:00:00.000Z',
    ...overrides,
  };
}

function mountMine(rows: Record<string, unknown>[] = [], options = {}) {
  return mountSignedIn(<MyWishesSection />, {
    ...options,
    seed: (db) => db.seed('wishes', rows),
  });
}

function mountTheirs(rows: Record<string, unknown>[] = []) {
  return mountSignedIn(<PartnerWishesSection />, {
    seed: (db) => db.seed('wishes', rows),
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0));
});

describe('your own three', () => {
  /**
   * The single most important sentence on the page. The whole feature
   * depends on knowing the list is read by somebody else, and nothing
   * else on screen implies it.
   */
  it('says outright that the partner will read them', async () => {
    mountMine();
    expect(await screen.findByText(/can see these/)).toBeInTheDocument();
  });

  it('says so differently when nobody has joined yet', async () => {
    mountMine([], { partner: null });
    expect(await screen.findByText(/once they’ve joined/)).toBeInTheDocument();
  });

  it('writes a wish into the lowest free seat', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { db } = mountMine([wishRow({ slot: 2 })]);

    await user.click(await screen.findByRole('button', { name: /Add a wish/ }));
    await user.type(await screen.findByLabelText(/What is it/), 'A day with no plans');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const write = lastWriteTo(db, 'wishes');
      expect(write?.op).toBe('insert');
      expect(write?.values).toMatchObject({
        profile_id: HIM_ID,
        title: 'A day with no plans',
        slot: 1,
      });
    });
  });

  /**
   * `couple_id` is filled in by a trigger from the profile. Sending one
   * from the client would be a way to write a wish into another couple's
   * space, so the screen must never include it.
   */
  it('never sends a couple_id, because the trigger owns it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { db } = mountMine();

    await user.click(await screen.findByRole('button', { name: /Add a wish/ }));
    await user.type(await screen.findByLabelText(/What is it/), 'Something');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'wishes')?.values).not.toHaveProperty('couple_id');
    });
  });

  it('stops offering a fourth, and says why', async () => {
    mountMine([wishRow({ slot: 1 }), wishRow({ slot: 2 }), wishRow({ slot: 3 })]);

    expect(await screen.findByText(/All three taken/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a wish/ })).not.toBeInTheDocument();
  });

  it('counts the spaces left', async () => {
    mountMine([wishRow({ slot: 1 })]);
    expect(await screen.findByText('2 spaces left')).toBeInTheDocument();
  });

  it('shows only your own wishes, never your partner’s, on your own page', async () => {
    mountMine([
      wishRow({ profile_id: HIM_ID, title: 'Mine' }),
      wishRow({ profile_id: HER_ID, title: 'Theirs' }),
    ]);

    await screen.findByText('Mine');
    expect(screen.queryByText('Theirs')).not.toBeInTheDocument();
  });

  it('keeps granted ones as history rather than deleting them', async () => {
    mountMine([
      wishRow({
        slot: null,
        title: 'That book about rivers',
        granted_on: '2026-06-01',
        granted_by: HER_ID,
        granted_note: 'for your birthday',
      }),
    ]);

    expect(await screen.findByText('That book about rivers')).toBeInTheDocument();
    // The giver's own words, kept with the wish so it reads as a memory.
    expect(screen.getByText('for your birthday')).toBeInTheDocument();
  });
});

describe('their three, on the gift page', () => {
  it('reads the partner’s list, not your own', async () => {
    mountTheirs([
      wishRow({ profile_id: HER_ID, title: 'Theirs' }),
      wishRow({ profile_id: HIM_ID, title: 'Mine' }),
    ]);

    expect(await screen.findByText('Theirs')).toBeInTheDocument();
    expect(screen.queryByText('Mine')).not.toBeInTheDocument();
  });

  /**
   * An empty list is not a slight and must not read as one — plenty of
   * people find asking for things hard.
   */
  it('says something kind when their list is empty', async () => {
    mountTheirs([]);
    expect(await screen.findByText(/hasn’t written anything here yet/)).toBeInTheDocument();
    expect(screen.getByText(/find it hard to ask for things/)).toBeInTheDocument();
  });

  it('grants one, freeing the seat in the same write', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { db } = mountTheirs([wishRow({ id: 'w1', profile_id: HER_ID, slot: 2 })]);

    await user.click(await screen.findByRole('button', { name: /I got this/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/Anything to remember/),
      'the one with wooden buttons',
    );
    await user.click(within(dialog).getByRole('button', { name: /I got this/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'wishes')?.values).toEqual({
        // Both together: the constraint refuses a wish that is granted
        // and still holding a seat.
        slot: null,
        granted_on: '2026-08-14',
        granted_by: HIM_ID,
        granted_note: 'the one with wooden buttons',
      });
    });
  });

  it('asks before granting, since it takes the wish off their list', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { db } = mountTheirs([wishRow({ profile_id: HER_ID })]);

    await user.click(await screen.findByRole('button', { name: /I got this/ }));
    expect(db.writes.filter((write) => write.table === 'wishes')).toHaveLength(0);
  });

  /**
   * Only the wisher may change the words — a trigger in 0013 refuses it
   * outright, and the interface must not offer what the database will
   * reject.
   */
  it('offers no way to edit or delete somebody else’s wish', async () => {
    mountTheirs([wishRow({ profile_id: HER_ID })]);

    await screen.findByText('The green coat');
    expect(screen.queryByRole('button', { name: /^Edit$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Take this wish back/ })).not.toBeInTheDocument();
  });

  it('can put a granted wish back, because marking the wrong one is one mis-tap', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { db } = mountTheirs([
      wishRow({
        id: 'granted',
        profile_id: HER_ID,
        slot: null,
        granted_on: '2026-08-01',
        granted_by: HIM_ID,
      }),
    ]);

    await user.click(await screen.findByRole('button', { name: /Put it back/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'wishes')?.values).toEqual({
        slot: 1,
        granted_on: null,
        granted_by: null,
        granted_note: null,
      });
    });
  });

  it('offers no undo when their three are full, rather than overwriting one', async () => {
    mountTheirs([
      wishRow({ profile_id: HER_ID, slot: 1 }),
      wishRow({ profile_id: HER_ID, slot: 2 }),
      wishRow({ profile_id: HER_ID, slot: 3 }),
      wishRow({ profile_id: HER_ID, slot: null, granted_on: '2026-08-01', title: 'Done' }),
    ]);

    await screen.findAllByText('The green coat');
    expect(screen.queryByRole('button', { name: /Put it back/ })).not.toBeInTheDocument();
  });

  it('shows nothing at all before a partner has joined', () => {
    mountSignedIn(<PartnerWishesSection />, {
      partner: null,
      seed: (db) => db.seed('wishes', []),
    });
    expect(screen.queryByText(/would love/)).not.toBeInTheDocument();
  });
});

describe('what a wishlist never becomes', () => {
  it('shows no price anywhere', async () => {
    mountTheirs([wishRow({ profile_id: HER_ID, note: 'Size M, the one on the corner' })]);

    await screen.findByText('The green coat');
    const page = within(document.body);
    // A wish with a price on it is an invoice, and reading one feels
    // like being billed.
    expect(page.queryByText(/€|R\$|¥|\$/)).not.toBeInTheDocument();
  });

  it('never tallies who granted more', async () => {
    mountMine([
      wishRow({ slot: null, granted_on: '2026-06-01', granted_by: HER_ID, title: 'One' }),
      wishRow({ slot: null, granted_on: '2026-07-01', granted_by: HIM_ID, title: 'Two' }),
    ]);

    await screen.findByText('One');
    const page = within(document.body);
    expect(page.queryByText(/you granted/i)).not.toBeInTheDocument();
    expect(page.queryByText(/\bmore than\b/i)).not.toBeInTheDocument();
  });
});
