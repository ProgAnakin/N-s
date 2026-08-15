import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
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
    // Wrapped, because `create` refreshes the hook's rows when it resolves
    // and that lands as a state update outside React's control otherwise.
    // The warning it produced was the only genuine one in the suite once
    // the known-benign SessionProvider noise was filtered out.
    await act(async () => {
      await result.current.create({ couple_id: 'c1', author_id: 'a', idea: 'a scarf' });
    });

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

describe('two sections asking the same question', () => {
  it('asks it once', async () => {
    // Home reads seven tables directly and mounts three components that read
    // five more; two of those overlapped, so the same rows were fetched
    // twice on one page, identically, milliseconds apart.
    db.seed('letters', [{ id: 'l1', couple_id: 'c1' }]);

    const options = { column: 'couple_id', value: 'c1', columns: 'id,created_at' };
    const a = renderHook(() => useTable('letters', options));
    const b = renderHook(() => useTable('letters', options));

    await waitFor(() => {
      expect(a.result.current.loading).toBe(false);
      expect(b.result.current.loading).toBe(false);
    });

    expect(db.selects.filter((s) => s.table === 'letters')).toHaveLength(1);
    expect(a.result.current.rows).toHaveLength(1);
    expect(b.result.current.rows).toHaveLength(1);
  });

  it('does not share between sections wanting different columns', async () => {
    // Sharing here would hand one section a row with fields missing.
    db.seed('remember_facts', [{ id: 'f1', couple_id: 'c1' }]);

    renderHook(() =>
      useTable('remember_facts', { column: 'couple_id', value: 'c1', columns: 'id' }),
    );
    renderHook(() =>
      useTable('remember_facts', {
        column: 'couple_id',
        value: 'c1',
        columns: 'id,answer,answer_kind',
      }),
    );

    await waitFor(() => {
      expect(db.selects.filter((s) => s.table === 'remember_facts').length).toBe(2);
    });
  });

  it('lets a later mount fetch fresh rows rather than replaying an old answer', async () => {
    // This deduplicates concurrent work; it is not a response cache.
    db.seed('memories', []);
    const first = renderHook(() => useTable('memories', { column: 'couple_id', value: 'c1' }));
    await waitFor(() => expect(first.result.current.loading).toBe(false));

    renderHook(() => useTable('memories', { column: 'couple_id', value: 'c1' }));
    await waitFor(() => {
      expect(db.selects.filter((s) => s.table === 'memories').length).toBe(2);
    });
  });
});
