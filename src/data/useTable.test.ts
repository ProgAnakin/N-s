import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { FakeSupabase } from '@/test/fake-supabase';
import { setFakeClient } from '@/test/client-mock';

vi.mock('@/data/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/client')>();
  const { fakeClient } = await import('@/test/client-mock');
  return { ...actual, isConfigured: true, requireClient: () => fakeClient() };
});

const { useTable, clearTableCache } = await import('./useTable');

/**
 * The read layer's two promises: it does not fetch more than it needs, and
 * it does not write anybody's private notes to the device.
 */

let db: FakeSupabase;

beforeEach(() => {
  window.localStorage.clear();
  clearTableCache();
  db = new FakeSupabase();
  setFakeClient(db);
});

function cachedKeys(): string[] {
  return Object.keys(window.localStorage).filter((key) => key.startsWith('nos.cache.'));
}

describe('what gets cached on the device', () => {
  it('caches an ordinary shared table, so a train journey shows something', async () => {
    db.seed('memories', [{ id: 'm1', couple_id: 'c1', title: 'Porto' }]);
    renderHook(() => useTable('memories', { column: 'couple_id', value: 'c1' }));

    await waitFor(() => expect(cachedKeys().length).toBe(1));
  });

  // The four below are the app's whole privacy promise. Caching them writes
  // plaintext to a device two people share.
  it.each(['remember_facts', 'gift_ideas', 'letters', 'intimacy_entries'] as const)(
    'never writes %s to localStorage',
    async (table) => {
      db.seed(table, [{ id: 'x1', couple_id: 'c1' }]);
      const { result } = renderHook(() =>
        useTable(table, { column: 'couple_id', value: 'c1' }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.rows).toHaveLength(1);
      expect(cachedKeys()).toEqual([]);
    },
  );

  it('still keeps a private table out of the cache after writing to it', async () => {
    db.seed('gift_ideas', []);
    const { result } = renderHook(() =>
      useTable('gift_ideas', { column: 'couple_id', value: 'c1' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.create({ couple_id: 'c1', author_id: 'a', idea: 'a scarf' });

    await waitFor(() => expect(db.rowsOf('gift_ideas')).toHaveLength(1));
    expect(cachedKeys()).toEqual([]);
  });
});

describe('not fetching more than is needed', () => {
  it('asks for every column by default', async () => {
    db.seed('memories', []);
    renderHook(() => useTable('memories', { column: 'couple_id', value: 'c1' }));
    await waitFor(() => expect(db.selects).toHaveLength(1));
    expect(db.selects[0]).toMatchObject({ table: 'memories', columns: '*' });
  });

  it('asks only for the columns it was given', async () => {
    db.seed('expenses', []);
    renderHook(() =>
      useTable('expenses', {
        column: 'couple_id',
        value: 'c1',
        columns: 'id,amount_cents,currency,paid_by',
      }),
    );

    await waitFor(() => expect(db.selects).toHaveLength(1));
    expect(db.selects[0]?.columns).toBe('id,amount_cents,currency,paid_by');
  });

  it('passes a limit through when one is set', async () => {
    db.seed('expenses', []);
    renderHook(() =>
      useTable('expenses', { column: 'couple_id', value: 'c1', limit: 25 }),
    );

    await waitFor(() => expect(db.selects).toHaveLength(1));
    expect(db.selects[0]?.limit).toBe(25);
  });

  it('sends no limit at all when none is set, so an album stays whole', async () => {
    db.seed('memories', []);
    renderHook(() => useTable('memories', { column: 'couple_id', value: 'c1' }));
    await waitFor(() => expect(db.selects).toHaveLength(1));
    expect(db.selects[0]?.limit).toBeUndefined();
  });
});
