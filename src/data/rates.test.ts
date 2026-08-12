import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSupabase } from '@/test/fake-supabase';
import { setFakeClient } from '@/test/client-mock';

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

const { captureRatesOn, currentRates, rateBook, ratesOn } = await import('./rates');

/**
 * Asking the provider for a day in the past — and, when this browser
 * cannot reach it at all, asking Supabase whether another one already did.
 *
 * The historical-date piece is what lets an expense written down offline
 * get the rate it should have had rather than today's — the difference
 * between a dinner in March being worth what it was worth in March and
 * being quietly restated at whatever the market did since.
 *
 * The shared-table piece exists because reaching the provider directly
 * turned out not to be a safe assumption: a firewall, a blocker, or a
 * country's own filtering can and does stop one partner's browser while
 * leaving the other's alone. `fx_rates` has no couple_id — an ECB
 * reference rate is the same fact for every couple in the app — so
 * whichever browser succeeds leaves the answer for the one that could not.
 *
 * The caching is not an optimisation here so much as a correctness aid: a
 * past day's rates are a settled fact, so a cache hit and a fresh fetch must
 * give the same answer forever. That also means a page repairing fifty
 * expenses from one week must not fire fifty requests.
 */

const PER_EUR = { BRL: 6.2, CNY: 7.9, USD: 1.08 };

function reply(date: string, rates: Record<string, number> = PER_EUR) {
  return {
    ok: true,
    json: async () => ({ amount: 1, base: 'EUR', date, rates }),
  } as unknown as Response;
}

/** A row exactly as `shareWithPartner` would have written it. */
function sharedRow(date: string, rates: Record<string, number> = PER_EUR) {
  return { date, base: 'EUR', per_base: { EUR: 1, ...rates } };
}

let fetchMock: ReturnType<typeof vi.fn>;
let db: FakeSupabase;

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn(async (url: string) => {
    // The provider echoes the day it actually used. For a weekend that is
    // the Friday before, which is the whole reason we keep its answer
    // rather than the date we asked for.
    const asked = new URL(url).pathname.slice(1);
    return reply(asked === 'latest' ? '2026-08-12' : asked);
  });
  vi.stubGlobal('fetch', fetchMock);

  // Empty by default: most tests are about the direct fetch, and an
  // unmocked Supabase table would silently rescue a "the provider is
  // unreachable" test that is supposed to prove there is nothing to fall
  // back on.
  db = new FakeSupabase().seed('fx_rates', []);
  setFakeClient(db);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setFakeClient(null);
});

describe('ratesOn', () => {
  it('asks the provider for the date, not for today', async () => {
    await ratesOn('2025-11-04');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/2025-11-04?');
  });

  it('asks once for a date, however many expenses share it', async () => {
    await Promise.all([
      ratesOn('2025-11-04'),
      ratesOn('2025-11-04'),
      ratesOn('2025-11-04'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('remembers a past day forever, because a past day cannot change', async () => {
    const first = await ratesOn('2025-11-04');
    fetchMock.mockClear();
    const second = await ratesOn('2025-11-04');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(second).toEqual(first);
  });

  it('keeps the provider’s own date, which for a Sunday is the Friday', async () => {
    fetchMock.mockImplementationOnce(async () => reply('2025-11-07'));
    const result = await ratesOn('2025-11-09');
    // Asked for Sunday, answered with Friday. Recording Sunday would be a
    // claim about a rate that never existed.
    expect(result?.date).toBe('2025-11-07');
  });

  it('refuses anything that is not a date', async () => {
    expect(await ratesOn('yesterday')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls through to today for a date that has not happened', async () => {
    // A clock askew, or an expense dated ahead. Today's is the only
    // defensible answer, and the provider has no other.
    await ratesOn('2099-01-01');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/latest?');
  });

  it('gives back null when the provider is unreachable', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    expect(await ratesOn('2025-11-04')).toBeNull();
  });

  it('gives back null when one currency is missing rather than a partial table', async () => {
    // A partial snapshot is worse than none: it would convert three
    // currencies and silently drop the fourth out of the total.
    fetchMock.mockImplementationOnce(async () => reply('2025-11-04', { BRL: 6.2, CNY: 7.9 }));
    expect(await ratesOn('2025-11-04')).toBeNull();
  });

  it('does not cache a failure as though it were an answer', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    expect(await ratesOn('2025-11-04')).toBeNull();
    const second = await ratesOn('2025-11-04');
    expect(second?.perBase.BRL).toBe(6.2);
  });
});

describe('when this browser cannot reach the provider itself', () => {
  it('falls back to a day another browser already shared', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    db.seed('fx_rates', [sharedRow('2025-11-04')]);

    const result = await ratesOn('2025-11-04');
    expect(result?.perBase.BRL).toBe(6.2);
  });

  /**
   * Deliberately not "the nearest day anybody shared". A value frozen onto
   * an expense claims to be *that day's* rate — falling back to a nearby
   * one would write it down as though it were exact, which is the drift
   * this whole design exists to prevent.
   */
  it('does not accept a shared day that is not the exact one asked for', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    db.seed('fx_rates', [sharedRow('2025-11-01'), sharedRow('2025-11-10')]);

    expect(await ratesOn('2025-11-04')).toBeNull();
  });

  it('has nothing to fall back on when nobody has shared that day either', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    db.seed('fx_rates', [sharedRow('2025-12-25')]);

    expect(await ratesOn('2025-11-04')).toBeNull();
  });
});

describe('leaving the answer for the other browser', () => {
  it('shares a historical fetch once it succeeds', async () => {
    await ratesOn('2025-11-04');

    const write = db.writes.find((w) => w.table === 'fx_rates');
    expect(write?.op).toBe('upsert');
    expect(write?.values).toMatchObject({ date: '2025-11-04', base: 'EUR' });
    expect((write?.values?.per_base as Record<string, number>).BRL).toBe(6.2);
  });

  it('shares today’s fetch too', async () => {
    await currentRates();
    const write = db.writes.find((w) => w.table === 'fx_rates');
    expect(write?.values).toMatchObject({ date: '2026-08-12' });
  });

  /**
   * Sharing is a courtesy to the partner, not something this browser's own
   * answer depends on — a couple where Supabase refuses the write for some
   * reason must not lose the rate they just successfully fetched.
   */
  it('still returns the fetched rate when sharing it fails', async () => {
    db.refuse('fx_rates', 'upsert', { message: 'refused' });
    const result = await ratesOn('2025-11-04');
    expect(result?.perBase.BRL).toBe(6.2);
  });

  it('does not overwrite a day that is already there', async () => {
    db.seed('fx_rates', [sharedRow('2025-11-04', { BRL: 1, CNY: 1, USD: 1 })]);
    await ratesOn('2025-11-04');

    // ignoreDuplicates: the row already there is left exactly as it was —
    // there is nothing to correct in an ECB rate that has not changed.
    expect(db.rowsOf('fx_rates')[0]?.per_base).toEqual({ EUR: 1, BRL: 1, CNY: 1, USD: 1 });
  });
});

describe('currentRates falls back the same way', () => {
  it('uses whatever the shared table has when the provider is unreachable', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    db.seed('fx_rates', [sharedRow('2026-08-11')]);

    const result = await currentRates();
    expect(result?.perBase.BRL).toBe(6.2);
  });

  it('prefers the most recent shared day when several are there', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    db.seed('fx_rates', [
      sharedRow('2026-08-01', { BRL: 1, CNY: 1, USD: 1 }),
      sharedRow('2026-08-11', { BRL: 6.2, CNY: 7.9, USD: 1.08 }),
    ]);

    const result = await currentRates();
    expect(result?.date).toBe('2026-08-11');
  });

  it('has nothing left to try when both the provider and the shared table are empty', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    expect(await currentRates()).toBeNull();
  });
});

describe('captureRatesOn', () => {
  it('gives a snapshot in the expense’s own currency', async () => {
    const captured = await captureRatesOn('BRL', '2025-11-04');
    expect(captured?.on).toBe('2025-11-04');
    expect(captured?.fx.BRL).toBe(1);
    // One real was 1/6.2 of a euro that day.
    expect(captured?.fx.EUR).toBeCloseTo(1 / 6.2, 10);
  });

  it('is null, not a throw, when there is nothing to be had', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    expect(await captureRatesOn('EUR', '2025-11-04')).toBeNull();
  });
});

describe('rateBook', () => {
  it('covers all four currencies from one request', async () => {
    const book = await rateBook();
    expect(Object.keys(book).sort()).toEqual(['BRL', 'CNY', 'EUR', 'USD']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Each entry is quoted against its own currency.
    expect(book.CNY?.CNY).toBe(1);
    expect(book.CNY?.EUR).toBeCloseTo(1 / 7.9, 10);
  });

  it('is empty rather than partial when the provider is unreachable', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    expect(await rateBook()).toEqual({});
  });
});

describe('currentRates', () => {
  it('prefers yesterday’s cached rates to none at all', async () => {
    // An expense recorded against rates a day old is far closer to the
    // truth than one recorded with none.
    window.localStorage.setItem(
      'nos.rates.v1',
      JSON.stringify({ date: '2020-01-01', perBase: { EUR: 1, ...PER_EUR }, fetchedOn: '2020-01-01' }),
    );
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });

    const result = await currentRates();
    expect(result?.date).toBe('2020-01-01');
  });

  it('treats a corrupt cache as no cache', async () => {
    window.localStorage.setItem('nos.rates.v1', 'not json');
    const result = await currentRates();
    expect(result?.perBase.BRL).toBe(6.2);
  });
});
