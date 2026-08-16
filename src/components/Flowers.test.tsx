import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, HER_ID, HIM_ID, mountSignedIn } from '@/test/harness';
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

const { FlowerCounter } = await import('./Flowers');

function flowerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: `flower-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    from_profile: HER_ID,
    to_profile: HIM_ID,
    kind: 'rose',
    seen: false,
    created_at: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

function mount(rows: Record<string, unknown>[]) {
  return mountSignedIn(<FlowerCounter />, {
    seed: (db) => db.seed('flowers', rows),
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

/**
 * The dot that says flowers arrived is two pixels wide and `aria-hidden`,
 * so before this the only channel carrying "something new happened" was
 * one that a screen reader could not reach at all.
 *
 * Every assertion waits: the counter draws "Flowers: 0" before the table
 * resolves, and that matches the query used to find it.
 */
describe('telling you some are new', () => {
  it('says how many arrived, not only how many there are', async () => {
    mount([
      flowerRow({ seen: true }),
      flowerRow({ seen: false }),
      flowerRow({ seen: false }),
    ]);

    const counter = await screen.findByRole('button', { name: /flowers/i });
    await waitFor(() => expect(counter).toHaveAccessibleName(/3/));
    expect(counter).toHaveAccessibleName(/2 new/);
  });

  it('uses the singular for one', async () => {
    mount([flowerRow({ seen: true }), flowerRow({ seen: false })]);
    const counter = await screen.findByRole('button', { name: /flowers/i });
    await waitFor(() => expect(counter).toHaveAccessibleName(/1 new/));
  });

  it('says nothing about new ones when there are none', async () => {
    mount([flowerRow({ seen: true })]);

    const counter = await screen.findByRole('button', { name: /flowers/i });
    await waitFor(() => expect(counter).toHaveAccessibleName(/1/));
    expect(counter).not.toHaveAccessibleName(/new/);
  });

  it('counts only the ones sent to you', async () => {
    // Flowers you sent are on their counter, not yours — and an unseen
    // one of theirs must never announce itself as news to the sender.
    mount([
      flowerRow({ to_profile: HIM_ID, seen: true }),
      flowerRow({ from_profile: HIM_ID, to_profile: HER_ID, seen: false }),
    ]);

    const counter = await screen.findByRole('button', { name: /flowers/i });
    await waitFor(() => expect(counter).toHaveAccessibleName(/1/));
    expect(counter).not.toHaveAccessibleName(/new/);
  });
});
