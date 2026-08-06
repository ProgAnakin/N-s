import type { FakeSupabase } from './fake-supabase';

/**
 * The fake the mocked `@/data/client` hands out.
 *
 * `vi.mock` factories are hoisted above everything in the test file, so they
 * cannot close over a variable declared there. They can import a module
 * though — so the factory reads from here, and each test writes here during
 * setup. Slightly indirect, and the only way to give every test its own
 * database.
 */
let current: FakeSupabase | null = null;

export function setFakeClient(db: FakeSupabase | null): void {
  current = db;
}

export function fakeClient(): FakeSupabase {
  if (!current) throw new Error('No fake client set — call setFakeClient() first.');
  return current;
}
