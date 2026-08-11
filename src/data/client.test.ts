import { describe, expect, it } from 'vitest';
import { classifyWriteError } from './client';

/**
 * Naming a failure correctly is the whole job here.
 *
 * Every one of these codes has been seen against the real project, because
 * migrations are run by hand and the app is routinely ahead of the schema.
 * The classification decides which sentence the banner shows, and the only
 * sentence that saves anybody time is `missing_schema` — "run the
 * migrations" is a five-second fix that is otherwise an afternoon.
 */

describe('a schema that has not caught up', () => {
  it.each([
    ['42703', 'undefined column'],
    ['42P01', 'undefined table'],
    ['42883', 'undefined function'],
    ['PGRST204', 'column missing from the schema cache'],
    ['PGRST202', 'function missing from the schema cache'],
  ])('%s (%s) says the migrations need running', (code) => {
    expect(classifyWriteError({ code, message: 'anything' })).toBe('missing_schema');
  });

  /**
   * The failure that motivated the function codes.
   *
   * `leave_couple`, `end_couple` and `reopen_couple` are added by 0005 and
   * 0011. Running the migrations out of order — which happened, because
   * 0005 depends on a table 0004 creates — rolls both files back and leaves
   * those three functions absent. Pressing *End it* then reported a generic
   * failure on the single hardest screen in the app.
   */
  it('recognises a missing RPC, not just a missing column', () => {
    expect(
      classifyWriteError({
        code: '42883',
        message: 'function public.end_couple() does not exist',
      }),
    ).toBe('missing_schema');
  });

  it('falls back to the message when a code never arrives', () => {
    expect(
      classifyWriteError({ message: 'relation "public.flowers" does not exist' }),
    ).toBe('missing_schema');
  });
});

describe('everything else keeps its own name', () => {
  it('separates a refusal from a gap', () => {
    expect(classifyWriteError({ code: '42501', message: 'permission denied' })).toBe(
      'not_allowed',
    );
    expect(
      classifyWriteError({ message: 'new row violates row-level security policy' }),
    ).toBe('not_allowed');
  });

  it('separates a constraint from a refusal', () => {
    expect(classifyWriteError({ code: '23514', message: 'check constraint' })).toBe('rejected');
    expect(classifyWriteError({ code: '23505', message: 'duplicate key' })).toBe('rejected');
  });

  it('calls a dead connection offline rather than blaming the schema', () => {
    expect(classifyWriteError({ message: 'Failed to fetch' })).toBe('offline');
  });

  it('admits when it does not know', () => {
    expect(classifyWriteError({ code: 'XX000', message: 'internal error' })).toBe('unknown');
    expect(classifyWriteError(null)).toBe('unknown');
    expect(classifyWriteError(new Error('boom'))).toBe('unknown');
  });
});

/**
 * A closed space refuses writes with 42501, deliberately — the trigger in
 * 0012 raises `insufficient_privilege` so it lands on the same path as an
 * RLS refusal, which is what it is.
 */
describe('a space that has ended', () => {
  it('reads as not allowed, not as a broken database', () => {
    expect(classifyWriteError({ code: '42501', message: 'this space is closed' })).toBe(
      'not_allowed',
    );
  });
});
