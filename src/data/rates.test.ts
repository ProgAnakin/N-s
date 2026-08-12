import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureRatesOn, currentRates, rateBook, ratesOn } from './rates';

/**
 * Asking the provider for a day in the past.
 *
 * This is the piece that lets an expense written down offline get the rate
 * it should have had rather than today's — the difference between a dinner
 * in March being worth what it was worth in March and being quietly
 * restated at whatever the market did since.
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

let fetchMock: ReturnType<typeof vi.fn>;

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
});

afterEach(() => {
  vi.unstubAllGlobals();
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
