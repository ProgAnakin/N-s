import { describe, expect, it } from 'vitest';
import {
  convertAll,
  convertCents,
  convertExpense,
  identitySnapshot,
  isRateSnapshot,
  snapshotFrom,
  type RateSnapshot,
} from './fx';

/** One euro, on a day the euro was worth 6.20 BRL, 7.90 CNY, 1.08 USD. */
const EUR_SNAPSHOT: RateSnapshot = { EUR: 1, BRL: 6.2, CNY: 7.9, USD: 1.08 };

describe('isRateSnapshot', () => {
  it('accepts a complete table', () => {
    expect(isRateSnapshot(EUR_SNAPSHOT)).toBe(true);
  });

  it('rejects one missing a currency', () => {
    // A partial table would convert three currencies and silently drop the
    // fourth out of the total, which is worse than converting none.
    expect(isRateSnapshot({ EUR: 1, BRL: 6.2, CNY: 7.9 })).toBe(false);
  });

  it('rejects rates that are not usable numbers', () => {
    expect(isRateSnapshot({ ...EUR_SNAPSHOT, USD: 0 })).toBe(false);
    expect(isRateSnapshot({ ...EUR_SNAPSHOT, USD: -1 })).toBe(false);
    expect(isRateSnapshot({ ...EUR_SNAPSHOT, USD: Number.NaN })).toBe(false);
    expect(isRateSnapshot({ ...EUR_SNAPSHOT, USD: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isRateSnapshot({ ...EUR_SNAPSHOT, USD: '1.08' })).toBe(false);
  });

  it('rejects things that are not tables at all', () => {
    expect(isRateSnapshot(null)).toBe(false);
    expect(isRateSnapshot(undefined)).toBe(false);
    expect(isRateSnapshot('EUR')).toBe(false);
  });
});

describe('convertCents', () => {
  it('leaves an amount in its own currency exactly alone', () => {
    expect(convertCents(1999, EUR_SNAPSHOT, 'EUR')).toBe(1999);
  });

  it('converts to another currency', () => {
    // €19.99 at 6.20 is R$123.94 (12393.8 rounded).
    expect(convertCents(1999, EUR_SNAPSHOT, 'BRL')).toBe(12394);
  });

  it('always returns whole minor units', () => {
    const result = convertCents(333, EUR_SNAPSHOT, 'CNY');
    expect(Number.isInteger(result)).toBe(true);
  });

  it('rounds half away from zero rather than to even', () => {
    // 1 cent at a rate of exactly 2.5 is 2.5 — which must not become 2.
    const half: RateSnapshot = { EUR: 1, BRL: 2.5, CNY: 1, USD: 1 };
    expect(convertCents(1, half, 'BRL')).toBe(3);
  });

  it('is zero for zero', () => {
    expect(convertCents(0, EUR_SNAPSHOT, 'USD')).toBe(0);
  });

  it('refuses to invent a number from a broken rate', () => {
    const broken = { ...EUR_SNAPSHOT, USD: 0 } as RateSnapshot;
    expect(convertCents(1000, broken, 'USD')).toBe(0);
  });
});

describe('snapshotFrom', () => {
  const perEur = { BRL: 6.2, CNY: 7.9, USD: 1.08 };

  it('gives the base currency a rate of one against itself', () => {
    const snapshot = snapshotFrom('EUR', perEur, 'EUR');
    expect(snapshot?.EUR).toBe(1);
    expect(snapshot?.BRL).toBeCloseTo(6.2, 10);
  });

  it('inverts correctly for a currency that is not the base', () => {
    const snapshot = snapshotFrom('EUR', perEur, 'BRL');
    expect(snapshot?.BRL).toBe(1);
    expect(snapshot?.EUR).toBeCloseTo(1 / 6.2, 10);
  });

  it('crosses two non-base currencies', () => {
    // One real should be 7.9/6.2 yuan.
    const snapshot = snapshotFrom('EUR', perEur, 'BRL');
    expect(snapshot?.CNY).toBeCloseTo(7.9 / 6.2, 10);
  });

  it('round-trips: converting there and back lands where it started', () => {
    const fromEur = snapshotFrom('EUR', perEur, 'EUR')!;
    const inBrl = convertCents(10_000, fromEur, 'BRL');
    const fromBrl = snapshotFrom('EUR', perEur, 'BRL')!;
    expect(convertCents(inBrl, fromBrl, 'EUR')).toBe(10_000);
  });

  it('gives up rather than returning a partial table', () => {
    expect(snapshotFrom('EUR', { BRL: 6.2, CNY: 7.9 }, 'EUR')).toBeNull();
    expect(snapshotFrom('EUR', perEur, 'CNY')).not.toBeNull();
  });

  it('gives up when the source currency has no rate', () => {
    expect(snapshotFrom('EUR', { BRL: 6.2, CNY: 7.9, USD: 0 }, 'USD')).toBeNull();
  });
});

describe('convertExpense', () => {
  it('needs no rate at all when the currency already matches', () => {
    // A couple who never leaves one currency must never be told their total
    // is incomplete because a rate fetch failed.
    const result = convertExpense({ amountCents: 500, currency: 'EUR', fx: null }, 'EUR');
    expect(result).toEqual({ cents: 500, exact: true });
  });

  it('converts with the snapshot frozen on the expense', () => {
    const result = convertExpense({ amountCents: 1000, currency: 'EUR', fx: EUR_SNAPSHOT }, 'BRL');
    expect(result).toEqual({ cents: 6200, exact: false });
  });

  it('returns null rather than guessing when there is no snapshot', () => {
    expect(convertExpense({ amountCents: 1000, currency: 'EUR', fx: null }, 'BRL')).toBeNull();
  });

  // The whole point of freezing: an old expense keeps its old rate even
  // after the market has moved.
  it('uses the expense’s own rate, not a newer one', () => {
    const then: RateSnapshot = { EUR: 1, BRL: 5.0, CNY: 7.9, USD: 1.08 };
    const old = { amountCents: 10_000, currency: 'EUR' as const, fx: then };
    expect(convertExpense(old, 'BRL')?.cents).toBe(50_000);

    const now = { amountCents: 10_000, currency: 'EUR' as const, fx: EUR_SNAPSHOT };
    expect(convertExpense(now, 'BRL')?.cents).toBe(62_000);
  });
});

describe('convertAll', () => {
  const brlSnapshot = snapshotFrom('EUR', { BRL: 6.2, CNY: 7.9, USD: 1.08 }, 'BRL')!;

  it('keeps what it cannot convert apart rather than dropping it', () => {
    const { converted, unconvertible } = convertAll(
      [
        { amountCents: 1000, currency: 'EUR', fx: EUR_SNAPSHOT },
        { amountCents: 6200, currency: 'BRL', fx: brlSnapshot },
        { amountCents: 500, currency: 'CNY', fx: null },
      ],
      'EUR',
    );

    expect(converted).toHaveLength(2);
    expect(unconvertible).toHaveLength(1);
    // Silently omitting the third would make the total quietly wrong, which
    // is the one thing a money page cannot do.
    expect(unconvertible[0]?.currency).toBe('CNY');
  });

  it('adds up to the right total in the target currency', () => {
    const { converted } = convertAll(
      [
        { amountCents: 1000, currency: 'EUR', fx: EUR_SNAPSHOT },
        { amountCents: 6200, currency: 'BRL', fx: brlSnapshot },
      ],
      'EUR',
    );
    const total = converted.reduce((sum, row) => sum + row.cents, 0);
    // €10 plus R$62 at 6.2 is €20.
    expect(total).toBe(2000);
  });

  it('handles an empty list', () => {
    expect(convertAll([], 'EUR')).toEqual({ converted: [], unconvertible: [] });
  });
});

describe('identitySnapshot', () => {
  it('is one against itself and refuses every other conversion', () => {
    const snapshot = identitySnapshot('CNY');
    expect(snapshot.CNY).toBe(1);
    expect(convertCents(100, snapshot, 'EUR')).toBe(0);
  });
});
