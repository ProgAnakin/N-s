import { describe, expect, it } from 'vitest';
import {
  costRatio,
  type SplitRuleKind,
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
  REBALANCE_FLOOR_CENTS,
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

  /**
   * Eighty cents of drift on a €20 total is over the proportional tolerance
   * and still not worth a sentence. "The next €1.60 is on Ling" reads as
   * pettiness, which is the one tone this whole module exists to avoid.
   */
  it('stays quiet about small change, even past the proportional tolerance', () => {
    // €5.25 and €4.75 on a €10 total: 2.5% apart, so the proportional
    // tolerance alone would speak up — about fifty cents.
    const balance = computeBalance(
      [expense(525, 'partner_a'), expense(475, 'partner_b')],
      'EUR',
    );
    expect(isLevel(balance)).toBe(false);
    expect(balance.differenceCents * 2).toBeLessThan(REBALANCE_FLOOR_CENTS);
    expect(rebalanceSuggestion(balance)).toBeNull();
  });

  it('speaks up as soon as a whole unit is at stake', () => {
    const balance = computeBalance(
      [expense(550, 'partner_a'), expense(450, 'partner_b')],
      'EUR',
    );
    expect(rebalanceSuggestion(balance)?.amountCents).toBe(REBALANCE_FLOOR_CENTS);
  });
});

/**
 * The figure the page shows, checked the only way that really proves it.
 *
 * A user reported the suggestion as obviously wrong: €100 in from one of
 * them, €9.49 from the other, and the app asking for €90.52 — more than
 * eight times what she had put in, on a total of €109.49. It reads as
 * absurd, and it is exactly right, because half of anything she pays is her
 * own share to begin with. The gap is €45.26; closing it takes twice that.
 *
 * Asserting a hard-coded €90.52 would only prove the code agrees with
 * itself. So these apply the suggestion to the history it came from and
 * assert the balance genuinely lands level — the claim the sentence on
 * screen actually makes.
 */
describe('the suggestion, proved by following it', () => {
  it('squares the exact case that was reported as wrong', () => {
    // €100 from him, ¥75 converted to €9.49 from her.
    const history = [expense(10000, 'partner_a'), expense(949, 'partner_b')];
    const before = computeBalance(history, 'EUR');

    expect(before.contributed).toEqual({ partner_a: 10000, partner_b: 949 });
    expect(before.totalCents).toBe(10949);

    const suggestion = rebalanceSuggestion(before)!;
    expect(suggestion.partner).toBe('partner_b');
    expect(suggestion.amountCents).toBe(9052);

    // The three figures the screen now shows, so the reader can check it.
    expect(suggestion.contributed.partner_a).toBe(10000);
    expect(suggestion.contributed.partner_b).toBe(949);
    // The pair the sentence on screen actually names: what she has put in
    // against what she has spent. Not "you'll both be at X" — that was the
    // old copy, and it was only ever true when every split was even.
    expect(suggestion.fairShare).toEqual(before.fairShare);
    expect(suggestion.fairShare.partner_b).toBe(5475);

    const after = computeBalance(
      [...history, expense(suggestion.amountCents, suggestion.partner)],
      'EUR',
    );
    expect(after.aheadPartner).toBeNull();
    expect(after.contributed.partner_a).toBe(10000);
    expect(after.contributed.partner_b).toBe(10001);
    // And the claim the copy makes: her two figures are now in line.
    expect(after.contributed.partner_b).toBe(after.fairShare.partner_b);
  });

  /**
   * The bug the new copy exists to fix. One uneven split is enough to make
   * "you'll both be at X" false, and the old shape of the suggestion could
   * not express anything else.
   */
  it('does not claim the two contributions meet when a split is uneven', () => {
    const history = [
      expense(10000, 'partner_a'),
      expense(5000, 'partner_b', { kind: 'custom_pct', partnerAPercent: 70 }),
    ];
    const before = computeBalance(history, 'EUR');
    const suggestion = rebalanceSuggestion(before)!;

    const after = computeBalance(
      [...history, expense(suggestion.amountCents, suggestion.partner)],
      'EUR',
    );

    expect(after.aheadPartner).toBeNull();
    // Level, and yet the two contributions are nowhere near each other.
    expect(after.contributed.partner_a).not.toBe(after.contributed.partner_b);
    // What is true of each of them is that their own pair has met.
    expect(after.contributed.partner_a).toBe(after.fairShare.partner_a);
    expect(after.contributed.partner_b).toBe(after.fairShare.partner_b);
  });

  it('is a cent short if the naive gap is used instead', () => {
    // Guards against "simplifying" the doubling back out. The difference
    // between the two contributions looks like the obvious answer and
    // leaves the two of them one cent apart for ever.
    const history = [expense(10000, 'partner_a'), expense(949, 'partner_b')];
    const naive = 10000 - 949;
    const after = computeBalance([...history, expense(naive, 'partner_b')], 'EUR');
    expect(after.differenceCents).toBe(1);
  });

  /**
   * Every history, not just the convenient ones. Mixed percentages, treats,
   * either partner paying, amounts up to €500 — following the suggestion
   * must land exactly level every single time.
   */
  it('lands exactly level across thousands of random histories', () => {
    // A fixed seed: a property test that fails only sometimes is worse than
    // no property test, because nobody can reproduce it.
    let seed = 12345;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);

    let checked = 0;
    for (let trial = 0; trial < 3000; trial += 1) {
      const history: Expense[] = [];
      for (let i = 0; i <= rand(5); i += 1) {
        const kind = rand(10);
        const rule: SplitRule =
          kind === 9
            ? { kind: 'treat' }
            : kind < 6
              ? { kind: '50_50' }
              : { kind: 'custom_pct', partnerAPercent: rand(101) };
        history.push(expense(1 + rand(50000), rand(2) ? 'partner_a' : 'partner_b', rule));
      }

      const before = computeBalance(history, 'EUR');
      const suggestion = rebalanceSuggestion(before);
      if (!suggestion) continue;

      checked += 1;
      const after = computeBalance(
        [...history, expense(suggestion.amountCents, suggestion.partner)],
        'EUR',
      );
      expect(after.differenceCents).toBe(0);
      expect(after.aheadPartner).toBeNull();
    }

    // If a refactor ever made the guard clauses reject everything, the loop
    // above would pass by doing nothing at all.
    expect(checked).toBeGreaterThan(1000);
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

/**
 * The colour of a row in the history.
 *
 * Reported as: "I add a 50/50 expense and the row shows up in red, as if
 * it were mine, while the badge beside it says €50 each." The stripe was
 * the payer's colour flat, which is a fact about the card and reads as a
 * claim about the cost.
 */
describe('how a row should be coloured', () => {
  it('splits a shared expense down the middle whoever paid', () => {
    expect(costRatio(10000, { kind: '50_50' }, 'partner_a')).toBe(50);
    expect(costRatio(10000, { kind: '50_50' }, 'partner_b')).toBe(50);
  });

  it('follows an uneven rule, and does not flip with the payer', () => {
    const rule: SplitRule = { kind: 'custom_pct', partnerAPercent: 70 };
    expect(costRatio(10000, rule, 'partner_a')).toBeCloseTo(70, 6);
    expect(costRatio(10000, rule, 'partner_b')).toBeCloseTo(70, 6);
  });

  it('gives a treat entirely to whoever gave it', () => {
    expect(costRatio(9000, { kind: 'treat' }, 'partner_a')).toBe(100);
    expect(costRatio(9000, { kind: 'treat' }, 'partner_b')).toBe(0);
  });

  it('stays inside 0–100 for every rule, payer and amount', () => {
    const rules: SplitRule[] = [
      { kind: '50_50' },
      { kind: 'treat' },
      { kind: 'custom_pct', partnerAPercent: 0 },
      { kind: 'custom_pct', partnerAPercent: 100 },
      { kind: 'custom_pct', partnerAPercent: 33 },
    ];
    for (const rule of rules) {
      for (const paidBy of ['partner_a', 'partner_b'] as const) {
        for (const amount of [0, 1, 3, 999, 123456]) {
          const ratio = costRatio(amount, rule, paidBy);
          expect(ratio).toBeGreaterThanOrEqual(0);
          expect(ratio).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('falls back to the payer when there is nothing to divide', () => {
    expect(costRatio(0, { kind: '50_50' }, 'partner_b')).toBe(0);
    expect(costRatio(0, { kind: '50_50' }, 'partner_a')).toBe(100);
  });
});

/**
 * An expense that is simply one person's own.
 *
 * The app had three rules and none of them was "I bought this for myself".
 * The default was `50_50`, so a solo coffee logged without a thought put
 * half its cost on somebody who never saw it.
 */
describe('an expense that belongs to one person', () => {
  it('counts in full to whoever spent it', () => {
    expect(shareOf(10000, { kind: 'mine' }, 'partner_a')).toEqual({
      partner_a: 10000,
      partner_b: 0,
    });
    expect(shareOf(10000, { kind: 'mine' }, 'partner_b')).toEqual({
      partner_a: 0,
      partner_b: 10000,
    });
  });

  it('stays out of the balance entirely', () => {
    // He spends €100 of his own, she spends €100 of hers. Two different
    // purchases, nothing agreed between them, nothing to divide.
    const balance = computeBalance(
      [
        expense(10000, 'partner_a', { kind: 'mine' }),
        expense(10000, 'partner_b', { kind: 'mine' }),
      ],
      'EUR',
    );

    expect(balance.ownCents).toEqual({ partner_a: 10000, partner_b: 10000 });
    expect(balance.ownCount).toBe(2);

    // Not in the shared pool, in any of its forms.
    expect(balance.totalCents).toBe(0);
    expect(balance.fairShare).toEqual({ partner_a: 0, partner_b: 0 });
    expect(balance.contributed).toEqual({ partner_a: 0, partner_b: 0 });
    expect(balance.aheadPartner).toBeNull();
    expect(rebalanceSuggestion(balance)).toBeNull();
  });

  it('never moves anything between them, however lopsided', () => {
    // One of them logs a great deal more of their own spending than the
    // other. That is a fact about their week, not a debt, and there is no
    // percentage anywhere that sets the two figures against each other.
    const balance = computeBalance(
      [
        expense(500000, 'partner_a', { kind: 'mine' }),
        expense(1000, 'partner_b', { kind: 'mine' }),
      ],
      'EUR',
    );

    expect(balance.ownCents).toEqual({ partner_a: 500000, partner_b: 1000 });
    expect(balance.differenceCents).toBe(0);
    expect(balance.contributionPercent).toEqual({ partner_a: 50, partner_b: 50 });
    expect(rebalanceSuggestion(balance)).toBeNull();
  });

  it('is kept apart from a treat, which is a different thing', () => {
    const mine = computeBalance([expense(5000, 'partner_a', { kind: 'mine' })], 'EUR');
    const gift = computeBalance([expense(5000, 'partner_a', { kind: 'treat' })], 'EUR');

    // Both sit outside the shared pool, and they are not interchangeable:
    // one is money spent on yourself, the other money spent on them. The
    // screen says different things about each, so the model has to keep
    // them in different places.
    expect(mine.ownCents.partner_a).toBe(5000);
    expect(mine.treatedCents.partner_a).toBe(0);
    expect(gift.ownCents.partner_a).toBe(0);
    expect(gift.treatedCents.partner_a).toBe(5000);

    expect(mine.totalCents).toBe(0);
    expect(gift.totalCents).toBe(0);
  });

  it('does not disturb the divided expenses it sits beside', () => {
    const withOwn = computeBalance(
      [
        expense(10000, 'partner_a', { kind: 'mine' }),
        expense(4000, 'partner_a', { kind: '50_50' }),
      ],
      'EUR',
    );
    const without = computeBalance([expense(4000, 'partner_a', { kind: '50_50' })], 'EUR');

    // The €100 of his own is recorded and changes nothing about the €40
    // they split. This is the property the whole separation exists for:
    // a €100 personal purchase used to swamp a €4.75 shared one, produce a
    // bar reading 95.7% / 4.3%, and hang a fairness nudge off it.
    expect(withOwn.totalCents).toBe(without.totalCents);
    expect(withOwn.fairShare).toEqual(without.fairShare);
    expect(withOwn.contributed).toEqual(without.contributed);
    expect(withOwn.contributionPercent).toEqual(without.contributionPercent);
    expect(rebalanceSuggestion(withOwn)?.amountCents).toBe(
      rebalanceSuggestion(without)?.amountCents,
    );

    expect(withOwn.ownCents.partner_a).toBe(10000);
    expect(withOwn.fairShare).toEqual({ partner_a: 2000, partner_b: 2000 });
  });

  /**
   * The reported case, exactly. €100 of his own tools and €9.49 of shared
   * medicine she paid for produced "Costanzo €104.74, 95.7%" and, directly
   * underneath, "the next €9.48 is on Costanzo" — telling the person who
   * had apparently spent almost everything to spend more.
   */
  it('no longer swamps a small shared pool with a large personal one', () => {
    const balance = computeBalance(
      [
        expense(10000, 'partner_a', { kind: 'mine' }),
        expense(949, 'partner_b', { kind: '50_50' }),
      ],
      'EUR',
    );

    expect(balance.totalCents).toBe(949);
    expect(balance.fairShare).toEqual({ partner_a: 474, partner_b: 475 });
    // Near enough half each, which is what they agreed — not 95.7%.
    expect(balance.contributionPercent.partner_a).toBe(0);
    expect(balance.ownCents.partner_a).toBe(10000);

    // The nudge is still right, and now it is the only figure on the page
    // about the shared pool, so it reads as being about the €9.49.
    const suggestion = rebalanceSuggestion(balance)!;
    expect(suggestion.partner).toBe('partner_a');
    expect(suggestion.amountCents).toBe(948);
  });

  it('is drawn solid, in the colour of whoever spent it', () => {
    expect(costRatio(10000, { kind: 'mine' }, 'partner_a')).toBe(100);
    expect(costRatio(10000, { kind: 'mine' }, 'partner_b')).toBe(0);
  });
});

/**
 * Conservation.
 *
 * The property the whole screen rests on: every expense lands in exactly
 * one of three pools, and the three are disjoint and exhaustive. If that
 * holds, then no amount anybody typed in is anywhere other than exactly
 * one of the figures on the page — which is the only reason a person has
 * to believe a total they did not compute themselves.
 *
 * Asserted over random histories rather than a handful of examples,
 * because the ways to lose a cent are all in the corners: an odd amount,
 * a 0% or 100% custom split, a treat by the partner who paid for nothing
 * else, a rounding remainder that goes to the wrong side.
 */
describe('every cent is in exactly one place', () => {
  function seeded(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  it('accounts for every amount logged, across thousands of histories', () => {
    const rand = seeded(20260813);
    const kinds: SplitRuleKind[] = ['mine', '50_50', 'custom_pct', 'treat'];
    let checked = 0;

    for (let run = 0; run < 3000; run += 1) {
      const history: Expense[] = [];
      let typedIn = 0;

      const count = 1 + Math.floor(rand() * 6);
      for (let i = 0; i < count; i += 1) {
        const amount = Math.floor(rand() * 50_000) + 1;
        const kind = kinds[Math.floor(rand() * kinds.length)]!;
        const rule: SplitRule =
          kind === 'custom_pct'
            ? { kind, partnerAPercent: Math.floor(rand() * 101) }
            : { kind };
        history.push(expense(amount, rand() < 0.5 ? 'partner_a' : 'partner_b', rule));
        typedIn += amount;
      }

      const b = computeBalance(history, 'EUR');

      // Nothing lost, nothing counted twice.
      const accounted =
        b.spentCents.partner_a +
        b.spentCents.partner_b +
        b.treatedCents.partner_a +
        b.treatedCents.partner_b;
      expect(accounted).toBe(typedIn);

      // The split pool closes on itself from both directions.
      expect(b.fairShare.partner_a + b.fairShare.partner_b).toBe(b.totalCents);
      expect(b.contributed.partner_a + b.contributed.partner_b).toBe(b.totalCents);

      // Drift is a property of the split pool alone and always sums to nil.
      const driftA = b.contributed.partner_a - b.fairShare.partner_a;
      const driftB = b.contributed.partner_b - b.fairShare.partner_b;
      expect(driftA + driftB).toBe(0);
      expect(b.differenceCents).toBe(Math.abs(driftA));

      // Every row landed somewhere, and in one place only.
      expect(b.sharedCount + b.treatCount + b.ownCount).toBe(history.length);

      checked += 1;
    }

    expect(checked).toBe(3000);
  });

  it('holds when a custom split gives one of them nothing', () => {
    // 0% and 100% are where an off-by-one hides: one share is the whole
    // amount and the other is zero, and the remainder rule still has to
    // make them sum back.
    for (const percent of [0, 100]) {
      for (const paidBy of ['partner_a', 'partner_b'] as const) {
        const balance = computeBalance(
          [expense(999, paidBy, { kind: 'custom_pct', partnerAPercent: percent })],
          'EUR',
        );
        expect(balance.fairShare.partner_a + balance.fairShare.partner_b).toBe(999);
        expect(balance.spentCents.partner_a + balance.spentCents.partner_b).toBe(999);
      }
    }
  });

  it('survives the journey through a currency conversion', () => {
    // The screen never totals raw amounts — it totals converted ones. The
    // invariant has to hold on the far side of that too, or the page is
    // exact about numbers nobody is reading.
    const fx = { EUR: 1, BRL: 6.2, CNY: 7.9, USD: 1.1 };
    const cny = { CNY: 1, EUR: 1 / 7.9, BRL: 6.2 / 7.9, USD: 1.1 / 7.9 };

    const { balance } = computeConvertedBalance(
      [
        { ...expense(10_000, 'partner_a', { kind: 'mine' }), currency: 'EUR', fx },
        { ...expense(7_500, 'partner_b', { kind: '50_50' }), currency: 'CNY', fx: cny },
        { ...expense(3_000, 'partner_a', { kind: 'treat' }), currency: 'EUR', fx },
      ],
      'EUR',
    );

    const accounted =
      balance.spentCents.partner_a +
      balance.spentCents.partner_b +
      balance.treatedCents.partner_a +
      balance.treatedCents.partner_b;

    // €100 + ¥75 at 7.9 (€9.49, rounded once at conversion) + €30.
    expect(accounted).toBe(10_000 + 949 + 3_000);
    expect(balance.fairShare.partner_a + balance.fairShare.partner_b).toBe(balance.totalCents);
  });
});
