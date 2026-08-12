import { vi } from 'vitest';

/**
 * An in-memory stand-in for the Supabase client.
 *
 * The point of this file is to make it possible to test a *process* rather
 * than a rendering. "The chip is on screen" and "tapping the chip changes
 * what the couple sees tomorrow" are different claims, and only the second
 * one matters — an entire settings section once rendered perfectly and did
 * nothing at all, because every write it fired was rejected by a database
 * that had never been migrated, and nothing anywhere caught it.
 *
 * So this fake records every write and can be told to refuse one. A test can
 * then assert both halves: that the right row and columns went out, and that
 * the interface behaves honestly when they come back rejected.
 *
 * It is not a Postgres. It does not evaluate RLS or CHECK constraints — the
 * database is the only honest test of those, and pretending otherwise here
 * would produce tests that pass while the real thing refuses. What it models
 * is the shape of the client: chained filters, `.select().single()`, and the
 * `{ data, error }` envelope every call resolves to.
 */

export interface FakeError {
  code?: string;
  message: string;
}

export interface RecordedWrite {
  table: string;
  op: 'insert' | 'update' | 'delete';
  values: Record<string, unknown> | null;
  match: Record<string, unknown>;
}

type Row = Record<string, unknown>;

export class FakeSupabase {
  /** Seeded rows, by table. Mutated by writes so reads stay consistent. */
  tables = new Map<string, Row[]>();
  /** Every write attempted, in order — the record a test asserts against. */
  writes: RecordedWrite[] = [];
  /** Every read, so a test can assert what was asked for and how much. */
  selects: { table: string; columns: string; limit?: number }[] = [];
  /** Errors to return instead of performing a write, keyed `table:op`. */
  private refusals = new Map<string, FakeError>();
  /** RPC handlers, keyed by function name. */
  rpcs = new Map<string, (args: unknown) => { data: unknown; error: FakeError | null }>();
  rpcCalls: { name: string; args: unknown }[] = [];

  seed(table: string, rows: Row[]): this {
    this.tables.set(table, rows.map((row) => ({ ...row })));
    return this;
  }

  rowsOf(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  /** Makes the next and every subsequent write to `table` fail with `error`. */
  refuse(table: string, op: RecordedWrite['op'], error: FakeError): this {
    this.refusals.set(`${table}:${op}`, error);
    return this;
  }

  allow(table: string, op: RecordedWrite['op']): this {
    this.refusals.delete(`${table}:${op}`);
    return this;
  }

  /**
   * What Postgres says when the app is ahead of its migrations — the exact
   * failure that made a whole settings page look broken.
   */
  static missingColumn(column: string): FakeError {
    return {
      code: 'PGRST204',
      message: `Could not find the '${column}' column of 'couples' in the schema cache`,
    };
  }

  static rlsRefusal(): FakeError {
    return { code: '42501', message: 'new row violates row-level security policy' };
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  rpc(name: string, args?: unknown) {
    this.rpcCalls.push({ name, args });
    const handler = this.rpcs.get(name);
    const result = handler
      ? handler(args)
      : { data: null, error: { code: '42883', message: `function ${name} does not exist` } };
    return Promise.resolve(result);
  }

  /** Who is signed in, as far as the fake is concerned. Null means nobody. */
  signedInUser: { id: string; email: string } | null = null;

  auth = {
    getSession: () =>
      Promise.resolve({ data: { session: this.signedInUser ? { user: this.signedInUser } : null } }),
    getUser: () => Promise.resolve({ data: { user: this.signedInUser } }),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    // Typed loosely on purpose: a test that wants to see what happens on
    // a refused sign-in has to be able to hand back an error, and
    // inferring `null` from the happy path makes that a type error.
    signInWithPassword: vi.fn(
      (): Promise<{ data: unknown; error: FakeError | null }> =>
        Promise.resolve({ data: {}, error: null }),
    ),
    signUp: vi.fn(
      (): Promise<{ data: unknown; error: FakeError | null }> =>
        Promise.resolve({ data: {}, error: null }),
    ),
    signOut: vi.fn(() => {
      this.signedInUser = null;
      return Promise.resolve({ error: null });
    }),
  };

  /**
   * Storage, to the depth the app touches it.
   *
   * Absent, every test that seeds a photograph threw an unhandled
   * rejection from inside a passive effect — which vitest reports at the
   * end of the run rather than against the test that caused it, so it
   * reads as ambient noise instead of as a component reaching for
   * something that is not there.
   *
   * Signed URLs come back as data URIs so an `<img>` in jsdom has a
   * plausible `src` without a network anywhere near it.
   */
  /** Every object path handed to `remove`, in order. */
  removedPaths: string[] = [];
  /** Every object path uploaded, in order. */
  uploadedPaths: string[] = [];

  storage = {
    from: (bucket: string) => ({
      createSignedUrl: (path: string) =>
        Promise.resolve({
          data: { signedUrl: `data:image/gif;base64,R0lGODlhAQABAAAAACw=#${bucket}/${path}` },
          error: null,
        }),
      createSignedUrls: (paths: string[]) =>
        Promise.resolve({
          data: paths.map((path) => ({
            path,
            signedUrl: `data:image/gif;base64,R0lGODlhAQABAAAAACw=#${bucket}/${path}`,
            error: null,
          })),
          error: null,
        }),
      // Recorded on the instance rather than on a per-call spy: `from()`
      // hands back a new object every time, so a `vi.fn` on it is a
      // different function by the time a test tries to read it.
      upload: (path: string) => {
        this.uploadedPaths.push(path);
        return Promise.resolve({ data: { path }, error: null });
      },
      remove: (paths: string[]) => {
        this.removedPaths.push(...paths);
        return Promise.resolve({ data: [], error: null });
      },
    }),
  };

  /** @internal */
  refusalFor(table: string, op: RecordedWrite['op']): FakeError | undefined {
    return this.refusals.get(`${table}:${op}`);
  }
}

/**
 * One query being built up.
 *
 * supabase-js queries are thenable builders: filters chain, and awaiting the
 * chain runs it. This mirrors that closely enough that the app's own code
 * runs unmodified, which is the whole point — a fake the app has to be
 * adapted to would be testing the adaptation.
 */
class FakeQuery implements PromiseLike<{ data: unknown; error: FakeError | null }> {
  private filters: { column: string; value: unknown }[] = [];
  private op: RecordedWrite['op'] | 'select' = 'select';
  private payload: Row | null = null;
  private wantsSingle = false;
  private orders: { column: string; ascending: boolean }[] = [];
  private columns = '*';
  private rowLimit: number | undefined;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(columns = '*'): this {
    this.columns = columns;
    return this;
  }

  limit(count: number): this {
    this.rowLimit = count;
    return this;
  }

  insert(values: Row): this {
    this.op = 'insert';
    this.payload = values;
    return this;
  }

  update(values: Row): this {
    this.op = 'update';
    this.payload = values;
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  single(): this {
    this.wantsSingle = true;
    return this;
  }

  maybeSingle(): this {
    this.wantsSingle = true;
    return this;
  }

  then<TResult1 = { data: unknown; error: FakeError | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: FakeError | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => row[filter.column] === filter.value);
  }

  private run(): { data: unknown; error: FakeError | null } {
    const rows = this.db.tables.get(this.table) ?? [];
    const match = Object.fromEntries(this.filters.map((f) => [f.column, f.value]));

    if (this.op !== 'select') {
      this.db.writes.push({
        table: this.table,
        op: this.op,
        values: this.payload,
        match,
      });

      const refusal = this.db.refusalFor(this.table, this.op);
      if (refusal) return { data: null, error: refusal };
    }

    switch (this.op) {
      case 'insert': {
        const created: Row = {
          id: `generated-${this.db.writes.length}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...this.payload,
        };
        rows.push(created);
        this.db.tables.set(this.table, rows);
        return { data: this.wantsSingle ? created : [created], error: null };
      }
      case 'update': {
        const touched = rows.filter((row) => this.matches(row));
        for (const row of touched) Object.assign(row, this.payload);
        return {
          data: this.wantsSingle ? (touched[0] ?? null) : touched,
          error: null,
        };
      }
      case 'delete': {
        const kept = rows.filter((row) => !this.matches(row));
        this.db.tables.set(this.table, kept);
        return { data: null, error: null };
      }
      default: {
        this.db.selects.push({
          table: this.table,
          columns: this.columns,
          limit: this.rowLimit,
        });
        let found = rows.filter((row) => this.matches(row));
        for (const { column, ascending } of [...this.orders].reverse()) {
          found = [...found].sort((a, b) => {
            const left = String(a[column] ?? '');
            const right = String(b[column] ?? '');
            return ascending ? left.localeCompare(right) : right.localeCompare(left);
          });
        }
        if (this.rowLimit !== undefined) found = found.slice(0, this.rowLimit);
        return { data: this.wantsSingle ? (found[0] ?? null) : found, error: null };
      }
    }
  }
}
