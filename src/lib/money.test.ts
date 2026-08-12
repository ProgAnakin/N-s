import { describe, expect, it } from 'vitest';
import {
  BALANCE_TOLERANCE_PERCENT,
  centsToInputValue,
  computeBalance,
  computeBalancesByCurrency,
  computeConvertedBalance,
  formatMoney,
  formatPercent,
  isLevel,
  otherPartner,
  parseAmountToCents,
  rebalanceSuggestion,
  shareOf,
  totalsByCategory,
  tripSpend,
  type CurrencyCode,
  type Expense,
  type PartnerRole,
  type SplitRule,
} from './money';
import type { CalendarDate } from './calendar';

const DAY: CalendarDate = { year: 2026, month: 3, day: 14 };

let counter = 0;
function expense(
  amountCents: number,
  paidBy: PartnerRole,
  splitRule: SplitRule = { kind: '50_50' },
  currency: CurrencyCode = 'EUR',
): Expense {
  counter += 1;
  return {
    id: `e${counter}`,
    label: `expense ${counter}`,
    amountCents,
    currency,
    paidBy,
    splitRule,
    category: 'food',
    date: DAY,
  };
}

describe('shareOf', () => {
  it('splits an even amount down the middle', () => {
    expect(shareOf(5000, { kind: '50_50' }, 'partner_a')).toEqual({
      partner_a: 2500,
      partner_b: 2500,
    });
  });

  it('leaves the indivisible cent with whoever paid', () => {
    expect(shareOf(1001, { kind: '50_50' }, 'partner_a')).toEqual({
      partner_a: 501,
      partner_b: 500,
    });
    expect(shareOf(1001, { kind: '50_50' }, 'partner_b')).toEqual({
      partner_a: 500,
      partner_b: 501,
    });
  });

  it('always sums back to the exact amount', () => {
    for (let amount = 1; amount <= 400; amount += 1) {
      for (const percent of [0, 1, 33, 50, 67, 99, 100]) {
        const rule: SplitRule = { kind: 'custom_pct', partnerAPercent: percent };
        for (const payer of ['partner_a', 'partner_b'] as const) {
          const share = shareOf(amount, rule, payer);
          expect(share.partner_a + share.partner_b).toBe(amount);
        }
      }
    }
  });

  it('honours a custom percentage', () => {
    expect(shareOf(10000, { kind: 'custom_pct', partnerAPercent: 70 }, 'partner_a')).toEqual({
      partner_a: 7000,
      partner_b: 3000,
    });
  });

  it('clamps nonsense percentages instead of producing negative shares', () => {
    const share = shareOf(10000, { kind: 'custom_pct', partnerAPercent: 140 }, 'partner_a');
    expect(share).toEqual({ partner_a: 10000, partner_b: 0 });
  });

  it('assigns no share at all for a treat', () => {
    expect(shareOf(9999, { kind: 'treat' }, 'partner_a')).toEqual({
      partner_a: 0,
      partner_b: 0,
    });
  });
});

describe('computeBalance', () => {
  it('is level and empty with no expenses', () => {
    const balance = computeBalance([], 'EUR');
    expect(balance.totalCents).toBe(0);
    expect(balance.aheadPartner).toBeNull();
    expect(isLevel(balance)).toBe(true);
    expect(rebalanceSuggestion(balance)).toBeNull();
  });

  it('tracks contribution and fair share separately', () => {
    const balance = computeBalance([expense(10000, 'partner_a')], 'EUR');
    expect(balance.contributed).toEqual({ partner_a: 10000, partner_b: 0 });
    expect(balance.fairShare).toEqual({ partner_a: 5000, partner_b: 5000 });
    expect(balance.differenceCents).toBe(5000);
    expect(balance.aheadPartner).toBe('partner_a');
  });

  it('reports contribution percentages that always sum to 100', () => {
    const balance = computeBalance(
      [expense(10000, 'partner_a'), expense(5000, 'partner_b')],
      'EUR',
    );
    const { partner_a: a, partner_b: b } = balance.contributionPercent;
    expect(a + b).toBeCloseTo(100, 6);
    expect(a).toBeCloseTo(66.7, 6);
  });

  it('keeps repeating decimals summing to exactly 100 rather than 99.9', () => {
    // A third and two thirds: the case where naive rounding loses a tenth.
    const balance = computeBalance(
      [expense(1000, 'partner_a'), expense(2000, 'partner_b')],
      'EUR',
    );
    expect(balance.contributionPercent.partner_a).toBeCloseTo(33.3, 6);
    expect(balance.contributionPercent.partner_b).toBeCloseTo(66.7, 6);
    expect(
      balance.contributionPercent.partner_a + balance.contributionPercent.partner_b,
    ).toBeCloseTo(100, 6);
  });

  it('excludes treats from the shared total and from the gap', () => {
    const balance = computeBalance(
      [expense(10000, 'partner_a', { kind: 'treat' }), expense(4000, 'partner_a')],
      'EUR',
    );
    expect(balance.totalCents).toBe(4000);
    expect(balance.treatedCents.partner_a).toBe(10000);
    expect(balance.treatCount).toBe(1);
    // Only the 40.00 counts toward the gap; the gift does not become leverage.
    expect(balance.differenceCents).toBe(2000);
  });

  it('ignores expenses in other currencies', () => {
    const balance = computeBalance(
      [expense(10000, 'partner_a'), expense(50000, 'partner_b', { kind: '50_50' }, 'CNY')],
      'EUR',
    );
    expect(balance.totalCents).toBe(10000);
    expect(balance.sharedCount).toBe(1);
  });

  it('respects a custom split when deciding who is ahead', () => {
    // A earns more and carries 70%. A pays the whole 100, so A is ahead by 30.
    const balance = computeBalance(
      [expense(10000, 'partner_a', { kind: 'custom_pct', partnerAPercent: 70 })],
      'EUR',
    );
    expect(balance.differenceCents).toBe(3000);
    expect(balance.aheadPartner).toBe('partner_a');
  });

  it('reports nobody ahead when a custom split is settled exactly', () => {
    const balance = computeBalance(
      [
        expense(10000, 'partner_a', { kind: 'custom_pct', partnerAPercent: 70 }),
        expense(10000, 'partner_b', { kind: 'custom_pct', partnerAPercent: 30 }),
      ],
      'EUR',
    );
    expect(balance.differenceCents).toBe(0);
    expect(balance.aheadPartner).toBeNull();
  });
});

describe('rebalanceSuggestion', () => {
  it('names the partner who is behind, never a debt', () => {
    const balance = computeBalance([expense(10000, 'partner_a')], 'EUR');
    const suggestion = rebalanceSuggestion(balance);
    expect(suggestion?.partner).toBe('partner_b');
  });

  it('suggests twice the gap, which is what actually squares it', () => {
    const balance = computeBalance([expense(10000, 'partner_a')], 'EUR');
    expect(rebalanceSuggestion(balance)?.amountCents).toBe(10000);
  });

  it('lands exactly level once the suggestion is followed', () => {
    const history = [expense(10000, 'partner_a'), expense(3000, 'partner_a'), expense(2500, 'partner_b')];
    const before = computeBalance(history, 'EUR');
    const suggestion = rebalanceSuggestion(before);
    expect(suggestion).not.toBeNull();

    const after = computeBalance(
      [...history, expense(suggestion!.amountCents, suggestion!.partner)],
      'EUR',
    );
    expect(after.differenceCents).toBe(0);
    expect(after.aheadPartner).toBeNull();
    expect(rebalanceSuggestion(after)).toBeNull();
  });

  it('squares an uneven custom split too', () => {
    const history = [
      expense(20000, 'partner_a', { kind: 'custom_pct', partnerAPercent: 70 }),
      expense(4000, 'partner_a', { kind: 'custom_pct', partnerAPercent: 70 }),
    ];
    const before = computeBalance(history, 'EUR');
    const suggestion = rebalanceSuggestion(before)!;
    // The follow-up is split evenly, which is the default the UI offers.
    const after = computeBalance([...history, expense(suggestion.amountCents, suggestion.partner)], 'EUR');
    expect(after.differenceCents).toBe(0);
  });

  it('stays quiet while the two are within tolerance', () => {
    // 100.00 vs 98.00 — a 1% drift is not worth a nudge.
    const balance = computeBalance(
      [expense(10000, 'partner_a'), expense(9800, 'partner_b')],
      'EUR',
    );
    expect(balance.differenceCents).toBeLessThan(
      (balance.totalCents * BALANCE_TOLERANCE_PERCENT) / 100,
    );
    expect(isLevel(balance)).toBe(true);
    expect(rebalanceSuggestion(balance)).toBeNull();
  });

  it('speaks up once the drift is real', () => {
    const balance = computeBalance(
      [expense(50000, 'partner_a'), expense(10000, 'partner_b')],
      'EUR',
    );
    expect(isLevel(balance)).toBe(false);
    expect(rebalanceSuggestion(balance)).not.toBeNull();
  });

  it('never suggests anything when one partner only ever gave gifts', () => {
    const balance = computeBalance(
      [expense(30000, 'partner_a', { kind: 'treat' }), expense(20000, 'partner_b', { kind: 'treat' })],
      'EUR',
    );
    expect(balance.totalCents).toBe(0);
    expect(rebalanceSuggestion(balance)).toBeNull();
  });
});

describe('computeBalancesByCurrency', () => {
  it('keeps currencies apart instead of inventing an exchange rate', () => {
    const balances = computeBalancesByCurrency(
      [expense(10000, 'partner_a'), expense(70000, 'partner_b', { kind: '50_50' }, 'CNY')],
      'EUR',
    );
    expect(balances.map((b) => b.currency)).toEqual(['EUR', 'CNY']);
    expect(balances[0]!.totalCents).toBe(10000);
    expect(balances[1]!.totalCents).toBe(70000);
  });

  it('always includes the primary currency, even with no expenses in it', () => {
    const balances = computeBalancesByCurrency([expense(500, 'partner_a', { kind: '50_50' }, 'USD')], 'EUR');
    expect(balances[0]!.currency).toBe('EUR');
    expect(balances[0]!.totalCents).toBe(0);
  });
});

describe('breakdowns', () => {
  it('totals by category, largest first', () => {
    const rows = totalsByCategory(
      [
        { ...expense(1000, 'partner_a'), category: 'food' },
        { ...expense(5000, 'partner_a'), category: 'stay' },
        { ...expense(2000, 'partner_b'), category: 'food' },
      ],
      'EUR',
    );
    expect(rows[0]).toEqual({ category: 'stay', totalCents: 5000 });
    expect(rows[1]).toEqual({ category: 'food', totalCents: 3000 });
  });

  it('counts trip spending including treats, since the money still left', () => {
    const rows: Expense[] = [
      { ...expense(1000, 'partner_a'), tripId: 't1' },
      { ...expense(2000, 'partner_a', { kind: 'treat' }), tripId: 't1' },
      { ...expense(9999, 'partner_a'), tripId: 't2' },
    ];
    expect(tripSpend(rows, 't1', 'EUR')).toBe(3000);
  });
});

describe('parseAmountToCents', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['12,50', 1250],
    ['0.99', 99],
    ['1,234.56', 123456],
    ['1.234,56', 123456],
    ['1.234', 123400],
    ['1 234,56', 123456],
    ['€ 42,00', 4200],
    ['R$ 1.500,00', 150000],
    ['¥ 88', 8800],
    ['.5', 50],
  ])('reads %s as %i cents', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it('rejects what it cannot read', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('   ')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('-')).toBeNull();
  });

  it('never leaves a float artefact behind', () => {
    // 0.1 + 0.2 territory: the classic way money features go wrong.
    expect(parseAmountToCents('19.99')).toBe(1999);
    expect(parseAmountToCents('0.07')).toBe(7);
    expect(parseAmountToCents('1234567.89')).toBe(123456789);
    expect(Number.isInteger(parseAmountToCents('8.87')!)).toBe(true);
  });

  it('round-trips through the input helper', () => {
    for (const cents of [0, 5, 99, 100, 1250, 123456]) {
      expect(parseAmountToCents(centsToInputValue(cents))).toBe(cents);
    }
  });
});

describe('formatting', () => {
  it('always shows two decimals for a currency amount', () => {
    expect(formatMoney(1250, 'EUR')).toMatch(/12[.,]50/);
    expect(formatMoney(1200, 'EUR')).toMatch(/12[.,]00/);
  });

  it('can drop decimals on a whole headline figure', () => {
    expect(formatMoney(120000, 'EUR', { compactWhole: true })).not.toMatch(/[.,]00/);
  });

  it('formats every supported currency', () => {
    for (const code of ['EUR', 'BRL', 'CNY', 'USD'] as const) {
      expect(formatMoney(9999, code)).toContain('99');
    }
  });

  it('rounds percentages cleanly', () => {
    expect(formatPercent(66.66666)).toBe('66.7%');
    expect(formatPercent(50)).toBe('50%');
  });
});

describe('otherPartner', () => {
  it('is its own inverse', () => {
    expect(otherPartner('partner_a')).toBe('partner_b');
    expect(otherPartner(otherPartner('partner_a'))).toBe('partner_a');
  });
});

// ---------------------------------------------------------------------------
// One balance across currencies
// ---------------------------------------------------------------------------

describe('computeConvertedBalance', () => {
  const eurRates = { EUR: 1, BRL: 6.2, CNY: 7.9, USD: 1.08 };
  const brlRates = { EUR: 1 / 6.2, BRL: 1, CNY: 7.9 / 6.2, USD: 1.08 / 6.2 };

  function withFx(
    amountCents: number,
    currency: 'EUR' | 'BRL' | 'CNY',
    paidBy: PartnerRole,
    fx: Record<string, number> | null,
  ): Expense {
    return {
      id: `x${amountCents}${currency}${paidBy}`,
      label: 'thing',
      amountCents,
      currency,
      paidBy,
      splitRule: { kind: '50_50' },
      category: 'food',
      date: { year: 2026, month: 3, day: 14 },
      fx: fx as never,
    };
  }

  it('folds two currencies into one honest total', () => {
    // €100 from him, R$620 from her — the same €100 — is level, not lopsided.
    const { balance, unconvertible } = computeConvertedBalance(
      [
        withFx(10_000, 'EUR', 'partner_a', eurRates),
        withFx(62_000, 'BRL', 'partner_b', brlRates),
      ],
      'EUR',
    );

    expect(unconvertible).toEqual([]);
    expect(balance.totalCents).toBe(20_000);
    expect(balance.contributed.partner_a).toBe(10_000);
    expect(balance.contributed.partner_b).toBe(10_000);
    expect(balance.differenceCents).toBe(0);
    expect(balance.aheadPartner).toBeNull();
  });

  it('is the fix for the two-bars-both-saying-100% problem', () => {
    // Separately these render as "100% him" in EUR and "100% her" in CNY,
    // which tells the couple nothing. Together they are 56/44.
    const separate = computeBalancesByCurrency(
      [
        withFx(10_000, 'EUR', 'partner_a', eurRates),
        withFx(79_000, 'CNY', 'partner_b', null),
      ],
      'EUR',
    );
    expect(separate).toHaveLength(2);

    const { balance } = computeConvertedBalance(
      [
        withFx(10_000, 'EUR', 'partner_a', eurRates),
        withFx(
          79_000,
          'CNY',
          'partner_b',
          { EUR: 1 / 7.9, BRL: 6.2 / 7.9, CNY: 1, USD: 1.08 / 7.9 },
        ),
      ],
      'EUR',
    );
    expect(balance.totalCents).toBe(20_000);
    expect(balance.contributionPercent.partner_a).toBe(50);
  });

  it('leaves an expense out only when there is nothing at all to convert it with', () => {
    const { balance, estimated, unconvertible } = computeConvertedBalance(
      [
        withFx(10_000, 'EUR', 'partner_a', eurRates),
        withFx(5_000, 'CNY', 'partner_b', null),
      ],
      'EUR',
    );

    expect(balance.totalCents).toBe(10_000);
    expect(estimated).toEqual([]);
    expect(unconvertible).toHaveLength(1);
    expect(unconvertible[0]?.currency).toBe('CNY');
  });

  /**
   * The behaviour that was asked for three times. Given anything to convert
   * with, the total is the total — and the expenses that needed a stand-in
   * come back named, so the page can say "about" rather than say nothing.
   */
  it('counts an expense written down offline, and names it as an estimate', () => {
    const cnyToday = { EUR: 1 / 7.9, BRL: 6.2 / 7.9, CNY: 1, USD: 1.08 / 7.9 };
    const { balance, estimated, unconvertible } = computeConvertedBalance(
      [
        withFx(10_000, 'EUR', 'partner_a', eurRates),
        withFx(79_000, 'CNY', 'partner_b', null),
      ],
      'EUR',
      { CNY: cnyToday },
    );

    expect(unconvertible).toEqual([]);
    expect(balance.totalCents).toBe(20_000);
    expect(estimated).toHaveLength(1);
    expect(estimated[0]?.currency).toBe('CNY');
  });

  it('never lets a stand-in override a rate the expense already has', () => {
    // Frozen at 5.0; today is 6.2. The frozen one wins, always.
    const frozen = { EUR: 1, BRL: 5.0, CNY: 7.9, USD: 1.08 };
    const { balance, estimated } = computeConvertedBalance(
      [withFx(10_000, 'EUR', 'partner_a', frozen)],
      'BRL',
      { EUR: eurRates },
    );
    expect(balance.totalCents).toBe(50_000);
    expect(estimated).toEqual([]);
  });

  it('needs no rate for an expense already in the display currency', () => {
    const { balance, unconvertible } = computeConvertedBalance(
      [withFx(10_000, 'EUR', 'partner_a', null)],
      'EUR',
    );
    expect(unconvertible).toEqual([]);
    expect(balance.totalCents).toBe(10_000);
  });

  it('still leaves treats out of the maths after converting', () => {
    const treat: Expense = {
      ...withFx(62_000, 'BRL', 'partner_b', brlRates),
      splitRule: { kind: 'treat' },
    };
    const { balance } = computeConvertedBalance(
      [withFx(10_000, 'EUR', 'partner_a', eurRates), treat],
      'EUR',
    );

    expect(balance.totalCents).toBe(10_000);
    expect(balance.treatedCents.partner_b).toBe(10_000);
    expect(balance.treatCount).toBe(1);
  });

  it('reports the balance in the currency asked for', () => {
    const { balance } = computeConvertedBalance(
      [withFx(10_000, 'EUR', 'partner_a', eurRates)],
      'BRL',
    );
    expect(balance.currency).toBe('BRL');
    expect(balance.totalCents).toBe(62_000);
  });
});
