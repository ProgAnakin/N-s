import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requireClient } from './client';
import type { InsertOf, RowOf, TableName, UpdateOf } from './database.types';

/**
 * One hook for reading and writing a table.
 *
 * Every table in this app is scoped by a single column — `couple_id` for the
 * shared ones, `author_id` for the private ones, `trip_id` for trip items —
 * so a single equality filter plus an order covers the whole app. RLS is the
 * real boundary; this filter is just so we do not fetch more than we need.
 *
 * Reads are cached in localStorage and replayed on mount, so opening the app
 * on a train shows the last known state immediately instead of a spinner that
 * never resolves.
 */

export interface UseTableOptions {
  /** Column to filter on, e.g. `couple_id`. */
  column: string;
  value: string | null | undefined;
  orderBy?: string;
  ascending?: boolean;
  /** Secondary sort, used where one column is not enough (e.g. trip items). */
  thenBy?: string;
  thenAscending?: boolean;
  enabled?: boolean;
}

export interface Table<T extends TableName> {
  rows: RowOf<T>[];
  loading: boolean;
  error: string | null;
  /** True while showing cached rows that have not been confirmed yet. */
  stale: boolean;
  refresh: () => Promise<void>;
  create: (values: InsertOf<T>) => Promise<RowOf<T> | null>;
  update: (id: string, values: UpdateOf<T>) => Promise<RowOf<T> | null>;
  remove: (id: string) => Promise<boolean>;
}

const CACHE_PREFIX = 'nos.cache.';
const CACHE_VERSION = 'v1';

function cacheKey(table: string, column: string, value: string, orderBy: string): string {
  return `${CACHE_PREFIX}${CACHE_VERSION}.${table}.${column}.${value}.${orderBy}`;
}

function readCache<Row>(key: string): Row[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Row[]) : null;
  } catch {
    return null;
  }
}

function writeCache<Row>(key: string, rows: Row[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Quota, private mode, or a disabled store. The cache is an optimisation,
    // never a requirement.
  }
}

export function clearTableCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear if the store is unavailable.
  }
}

export function useTable<T extends TableName>(table: T, options: UseTableOptions): Table<T> {
  const {
    column,
    value,
    orderBy = 'created_at',
    ascending = false,
    thenBy,
    thenAscending = true,
    enabled = true,
  } = options;

  const active = enabled && Boolean(value);
  const key = useMemo(
    () => cacheKey(table, column, value ?? '', orderBy),
    [table, column, value, orderBy],
  );

  const [rows, setRows] = useState<RowOf<T>[]>([]);
  const [loading, setLoading] = useState(active);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!active || !value) {
      setRows([]);
      setLoading(false);
      setStale(false);
      return;
    }

    const token = ++requestId.current;
    setError(null);

    const client = requireClient();
    // The generic table name defeats supabase-js's per-table column
    // inference, so the filter and order arguments are handed over as plain
    // strings. Everything coming back out is still typed as RowOf<T>.
    const query = client.from(table).select('*');
    const filtered = query.eq(column as never, value as never);
    const ordered = thenBy
      ? filtered.order(orderBy, { ascending }).order(thenBy, { ascending: thenAscending })
      : filtered.order(orderBy, { ascending });

    const { data, error: queryError } = await ordered;
    if (token !== requestId.current) return;

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      // Cached rows stay on screen: a failed refresh should not blank a page
      // that was perfectly readable a second ago.
      setStale(true);
      return;
    }

    const nextRows = (data ?? []) as unknown as RowOf<T>[];
    setRows(nextRows);
    writeCache(key, nextRows);
    setLoading(false);
    setStale(false);
  }, [active, ascending, column, key, orderBy, table, thenAscending, thenBy, value]);

  useEffect(() => {
    if (!active) {
      setRows([]);
      setLoading(false);
      return;
    }
    const cached = readCache<RowOf<T>>(key);
    if (cached) {
      setRows(cached);
      setLoading(false);
      setStale(true);
    } else {
      setLoading(true);
    }
    void refresh();
  }, [active, key, refresh]);

  const create = useCallback<Table<T>['create']>(
    async (values) => {
      const client = requireClient();
      const { data, error: insertError } = await client
        .from(table)
        .insert(values as never)
        .select('*')
        .single();
      if (insertError) {
        setError(insertError.message);
        return null;
      }
      const row = data as unknown as RowOf<T>;
      setRows((current) => {
        const next = [row, ...current];
        writeCache(key, next);
        return next;
      });
      // Re-fetch so the new row lands in the server's sort order rather than
      // sitting at the top until the next visit.
      void refresh();
      return row;
    },
    [key, refresh, table],
  );

  const update = useCallback<Table<T>['update']>(
    async (id, values) => {
      const client = requireClient();
      const { data, error: updateError } = await client
        .from(table)
        .update(values as never)
        .eq('id' as never, id as never)
        .select('*')
        .single();
      if (updateError) {
        setError(updateError.message);
        return null;
      }
      const row = data as unknown as RowOf<T>;
      setRows((current) => {
        const next = current.map((existing) =>
          (existing as { id: string }).id === id ? row : existing,
        );
        writeCache(key, next);
        return next;
      });
      return row;
    },
    [key, table],
  );

  const remove = useCallback<Table<T>['remove']>(
    async (id) => {
      const client = requireClient();
      const { error: deleteError } = await client
        .from(table)
        .delete()
        .eq('id' as never, id as never);
      if (deleteError) {
        setError(deleteError.message);
        return false;
      }
      setRows((current) => {
        const next = current.filter((existing) => (existing as { id: string }).id !== id);
        writeCache(key, next);
        return next;
      });
      return true;
    },
    [key, table],
  );

  return { rows, loading, error, stale, refresh, create, update, remove };
}
