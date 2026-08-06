import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requireClient } from './client';
import { reportWriteFailure } from './write-status';
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
  /**
   * Which columns to fetch. Defaults to all of them.
   *
   * Worth setting on anything that grows without bound. Home reads seven
   * tables to draw a countdown and a balance, and `select('*')` on expenses
   * drags every note and every foreign key across the wire to add up two
   * numbers.
   */
  columns?: string;
  /**
   * Stop after this many rows.
   *
   * There is no pagination anywhere in this app, and for a keepsake that is
   * mostly right — you want the whole album. But the front page does not:
   * it needs the next date and the recent expenses, not eight years of them.
   */
  limit?: number;
}

export interface Table<T extends TableName> {
  rows: RowOf<T>[];
  loading: boolean;
  /**
   * A failed *read*, for the screen to show in place of its list.
   *
   * Failed writes deliberately do not land here. They go to the app-wide
   * banner instead (see write-status.ts), because a write is fired from a
   * modal that has already closed by the time it fails — there is nothing
   * left on screen to attach the message to. Keeping the two apart also
   * stops one failure raising two alerts.
   */
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

/**
 * Tables whose rows never touch localStorage.
 *
 * The read cache exists so opening the app on a train shows something
 * instead of a spinner, and for a memory or an expense that trade is
 * obviously worth it. For these four it is not.
 *
 * `remember_facts` holds private notes the author's own partner cannot read
 * — the app's central promise. `gift_ideas` is a surprise. `letters` may be
 * sealed until a date the recipient has not reached. `intimacy_entries` is
 * the most private thing here by some distance. Caching any of them writes
 * plaintext to a device that two people share, survives locking the screen,
 * and is one DevTools tab away from undoing the whole privacy model.
 *
 * The cost is a spinner on those four pages when offline. That is the right
 * side of the trade.
 */
const UNCACHED_TABLES: ReadonlySet<string> = new Set([
  'remember_facts',
  'gift_ideas',
  'letters',
  'intimacy_entries',
]);

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

/**
 * Requests currently in the air, so two components asking the same question
 * ask it once.
 *
 * Home reads seven tables directly and mounts three components that read
 * five more, and two of those overlap — `remember_facts` and `letters` were
 * each being fetched twice on one page, identically, milliseconds apart.
 * That is not a component doing anything wrong; it is the cost of building
 * self-contained sections, and the right place to fix it is here rather
 * than by making every section take its data as props and pushing the
 * plumbing back up into the screens.
 *
 * Keyed by the whole query, so a section asking for four columns never
 * receives the answer to somebody else's ten-column question. Entries clear
 * the moment they settle: this deduplicates concurrent work, it is not a
 * response cache, and a later mount still gets fresh data.
 */
const inFlight = new Map<string, Promise<{ data: unknown; error: { message: string } | null }>>();

function share<R extends { data: unknown; error: { message: string } | null }>(
  key: string,
  run: () => Promise<R>,
): Promise<R> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<R>;

  const promise = run().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
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
    columns = '*',
    limit,
  } = options;

  const cacheable = !UNCACHED_TABLES.has(table);

  const active = enabled && Boolean(value);
  const key = useMemo(
    () => cacheKey(table, column, value ?? '', orderBy),
    [table, column, value, orderBy],
  );

  // Distinct from the cache key: two sections may read the same rows in the
  // same order and want different columns, and sharing a request between
  // them would hand one of them a row with fields missing.
  const requestKey = useMemo(
    () => `${key}|${columns}|${ascending}|${thenBy ?? ''}|${thenAscending}|${limit ?? ''}`,
    [key, columns, ascending, thenBy, thenAscending, limit],
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
    const query = client.from(table).select(columns);
    const filtered = query.eq(column as never, value as never);
    const ordered = thenBy
      ? filtered.order(orderBy, { ascending }).order(thenBy, { ascending: thenAscending })
      : filtered.order(orderBy, { ascending });
    const bounded = limit === undefined ? ordered : ordered.limit(limit);

    const { data, error: queryError } = await share(requestKey, async () => await bounded);
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
    if (cacheable) writeCache(key, nextRows);
    setLoading(false);
    setStale(false);
  }, [
    active,
    ascending,
    cacheable,
    column,
    columns,
    key,
    limit,
    orderBy,
    requestKey,
    table,
    thenAscending,
    thenBy,
    value,
  ]);

  useEffect(() => {
    if (!active) {
      setRows([]);
      setLoading(false);
      return;
    }
    const cached = cacheable ? readCache<RowOf<T>>(key) : null;
    if (cached) {
      setRows(cached);
      setLoading(false);
      setStale(true);
    } else {
      setLoading(true);
    }
    void refresh();
  }, [active, cacheable, key, refresh]);

  const create = useCallback<Table<T>['create']>(
    async (values) => {
      const client = requireClient();
      const { data, error: insertError } = await client
        .from(table)
        .insert(values as never)
        .select('*')
        .single();
      if (insertError) {
        reportWriteFailure(insertError);
        return null;
      }
      const row = data as unknown as RowOf<T>;
      setRows((current) => {
        const next = [row, ...current];
        if (cacheable) writeCache(key, next);
        return next;
      });
      // Re-fetch so the new row lands in the server's sort order rather than
      // sitting at the top until the next visit.
      void refresh();
      return row;
    },
    [cacheable, key, refresh, table],
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
        reportWriteFailure(updateError);
        return null;
      }
      const row = data as unknown as RowOf<T>;
      setRows((current) => {
        const next = current.map((existing) =>
          (existing as { id: string }).id === id ? row : existing,
        );
        if (cacheable) writeCache(key, next);
        return next;
      });
      return row;
    },
    [cacheable, key, table],
  );

  const remove = useCallback<Table<T>['remove']>(
    async (id) => {
      const client = requireClient();
      const { error: deleteError } = await client
        .from(table)
        .delete()
        .eq('id' as never, id as never);
      if (deleteError) {
        reportWriteFailure(deleteError);
        return false;
      }
      setRows((current) => {
        const next = current.filter((existing) => (existing as { id: string }).id !== id);
        if (cacheable) writeCache(key, next);
        return next;
      });
      return true;
    },
    [cacheable, key, table],
  );

  return { rows, loading, error, stale, refresh, create, update, remove };
}
