import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RebalanceNote, ShareBar, SpentTotals, TreatsNote } from './Balance';
import { computeBalance, type Expense, type PartnerRole, type SplitRule } from '@/lib/money';
import type { PartnerNames } from '@/screens/shared';

const names: PartnerNames = {
  partner_a: 'Léo',
  partner_b: 'Ana',
  me: 'partner_a',
  myName: 'Léo',
  partnerName: 'Ana',
  hasPartner: true,
};

let counter = 0;
function expense(
  amountCents: number,
  paidBy: PartnerRole,
  splitRule: SplitRule = { kind: '50_50' },
): Expense {
  counter += 1;
  return {
    id: `e${counter}`,
    label: `expense ${counter}`,
    amountCents,
    currency: 'EUR',
    paidBy,
    splitRule,
    category: 'food',
    date: { year: 2026, month: 3, day: 14 },
  };
}

/**
 * Language the spending feature must never use.
 *
 * This is the app's one non-negotiable product rule expressed as a test: the
 * moment someone adds "Ana owes you €40" to this component, the suite fails.
 * Rendering a heavily lopsided balance is the case most likely to tempt it.
 */
const FORBIDDEN = [
  /\bowes?\b/i,
  /\bowed\b/i,
  /\bdebt/i,
  /\bsettle up\b/i,
  /\bbalance due\b/i,
  /\brepay\b/i,
  /\byou owe\b/i,
  /\bIOU\b/i,
];

function expectNoDebtLanguage(text: string) {
  for (const pattern of FORBIDDEN) {
    expect(text).not.toMatch(pattern);
  }
}

/**
 * The complaint this block exists for.
 *
 * Somebody logged a €50 expense split down the middle and paid for by their
 * partner, and reported that "my number didn't go up, only hers did". They
 * were right, and so was the arithmetic: only one card was charged. What
 * was missing is the other reading — half of that €50 was theirs — which
 * the page computed and never showed.
 */
describe('ShareBar', () => {
  it('moves for both of them when one pays for something shared', () => {
    const before = computeBalance([expense(10000, 'partner_a')], 'EUR');
    const after = computeBalance(
      [expense(10000, 'partner_a'), expense(5000, 'partner_b')],
      'EUR',
    );

    // Cash out: Léo's does not move, and that is correct.
    expect(after.contributed.partner_a).toBe(before.contributed.partner_a);

    // Whose spending it was: Léo's climbs by half the new expense.
    expect(before.fairShare.partner_a).toBe(5000);
    expect(after.fairShare.partner_a).toBe(7500);
    expect(after.fairShare.partner_b).toBe(7500);

    render(<ShareBar balance={after} names={names} />);
    expect(screen.getAllByText('€75.00')).toHaveLength(2);
  });

  it('follows the rule when the split is not down the middle', () => {
    const balance = computeBalance(
      [expense(10000, 'partner_a', { kind: 'custom_pct', partnerAPercent: 70 })],
      'EUR',
    );
    render(<ShareBar balance={balance} names={names} />);

    expect(screen.getByText('€70.00')).toBeInTheDocument();
    expect(screen.getByText('€30.00')).toBeInTheDocument();
  });

  it('leaves treats out, the same as the balance does', () => {
    const balance = computeBalance(
      [expense(4000, 'partner_a'), expense(9000, 'partner_b', { kind: 'treat' })],
      'EUR',
    );
    render(<ShareBar balance={balance} names={names} />);

    // €20 each from the shared expense. The €90 gift is not anybody's share.
    expect(screen.getAllByText('€20.00')).toHaveLength(2);
    expect(screen.queryByText(/45\.00/)).not.toBeInTheDocument();
  });


  it('describes the split for screen readers without naming a creditor', () => {
    const balance = computeBalance([expense(10000, 'partner_a')], 'EUR');
    render(<ShareBar balance={balance} names={names} />);
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toContain('Léo');
    expect(label).toContain('Ana');
    expectNoDebtLanguage(label);
  });





  it('draws nothing at all when nothing was divided', () => {
    // An empty bar with two zeroes under it says less than nothing, and
    // the totals above have already reported what was logged.
    const balance = computeBalance([expense(10000, 'partner_a', { kind: 'mine' })], 'EUR');
    const { container } = render(<ShareBar balance={balance} names={names} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the divided pool, never the personal one', () => {
    const balance = computeBalance(
      [
        expense(10000, 'partner_a', { kind: 'mine' }),
        expense(949, 'partner_b', { kind: '50_50' }),
      ],
      'EUR',
    );
    render(<ShareBar balance={balance} names={names} />);

    // €4.74 and €4.75 — the pool they agreed to divide, split as agreed.
    // The €100 of his own is nowhere near any percentage here.
    expect(screen.getByText('€4.74')).toBeInTheDocument();
    expect(screen.getByText('€4.75')).toBeInTheDocument();
    expect(screen.getByText('€9.49 shared so far')).toBeInTheDocument();
    expect(screen.queryByText('95.7%')).not.toBeInTheDocument();
    expect(screen.queryByText(/€100/)).not.toBeInTheDocument();
  });

  it('never uses debt language either', () => {
    const balance = computeBalance(
      [expense(500000, 'partner_a'), expense(1000, 'partner_b')],
      'EUR',
    );
    const { container } = render(<ShareBar balance={balance} names={names} />);
    expectNoDebtLanguage(container.textContent ?? '');
  });
});

/**
 * The figure a person means when they ask "how much have I spent".
 *
 * Reported as: "the value added in just mine doesn't increase my spent
 * value." It didn't — personal spending had been moved out of the balance
 * to stop it swamping the bar, and moved clean out of sight with it.
 */
describe('SpentTotals', () => {
  it('counts a personal expense toward the person who made it', () => {
    const balance = computeBalance([expense(10000, 'partner_a', { kind: 'mine' })], 'EUR');
    render(<SpentTotals balance={balance} names={names} />);
    expect(screen.getByText('€100.00')).toBeInTheDocument();
  });

  it('adds their own to their share of what was divided', () => {
    const balance = computeBalance(
      [
        expense(10000, 'partner_a', { kind: 'mine' }),
        expense(949, 'partner_b', { kind: '50_50' }),
      ],
      'EUR',
    );
    render(<SpentTotals balance={balance} names={names} />);

    // €100 of his own plus €4.74 of the medicine they split.
    expect(balance.spentCents).toEqual({ partner_a: 10474, partner_b: 475 });
    expect(screen.getByText('€104.74')).toBeInTheDocument();
    expect(screen.getByText('€4.75')).toBeInTheDocument();
    // And the composition, so the sum is checkable rather than asserted.
    expect(screen.getByText('€100 personal · €4.74 split')).toBeInTheDocument();
  });

  it('leaves a gift out of the giver’s spending', () => {
    // The whole difference between "just mine" and "my treat", and it was
    // asked as a question, which means the app had not answered it.
    const mine = computeBalance([expense(3000, 'partner_a', { kind: 'mine' })], 'EUR');
    const gift = computeBalance([expense(3000, 'partner_a', { kind: 'treat' })], 'EUR');

    expect(mine.spentCents.partner_a).toBe(3000);
    expect(gift.spentCents.partner_a).toBe(0);
    expect(gift.treatedCents.partner_a).toBe(3000);
  });

  it('sets no percentage and no shared axis between the two', () => {
    const balance = computeBalance(
      [
        expense(500000, 'partner_a', { kind: 'mine' }),
        expense(1000, 'partner_b', { kind: 'mine' }),
      ],
      'EUR',
    );
    const { container } = render(<SpentTotals balance={balance} names={names} />);

    // Two facts, not one quantity divided. A bar here would rank them.
    expect(container.textContent).not.toMatch(/%/);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expectNoDebtLanguage(container.textContent ?? '');
  });

  it('says nothing has been logged rather than showing two zeroes', () => {
    render(<SpentTotals balance={computeBalance([], 'EUR')} names={names} />);
    expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument();
  });

  it('does not report a gift as two people having spent nothing', () => {
    // Found by walking the empty/loading/extreme checklist rather than by
    // anybody hitting it. A treat is logged, so the page is not empty —
    // but nobody has spent anything, and two cards reading "€0.00 · €0
    // split" made it look as though the gift had been dropped.
    const balance = computeBalance([expense(3000, 'partner_a', { kind: 'treat' })], 'EUR');
    render(<SpentTotals balance={balance} names={names} />);

    expect(screen.getByText(/nothing spent yet/i)).toBeInTheDocument();
    expect(screen.queryByText('€0.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing logged yet/i)).not.toBeInTheDocument();
  });

  it('holds at a phone width with long names and seven-figure amounts', () => {
    const big = (cents: number, by: PartnerRole, kind: SplitRule): Expense => ({
      ...expense(cents, by, kind),
      currency: 'CNY',
    });
    const balance = computeBalance(
      [big(123_456_789, 'partner_a', { kind: 'mine' }), big(98_765_432, 'partner_b', { kind: '50_50' })],
      'CNY',
    );
    render(<SpentTotals balance={balance} names={names} />);

    // The figures are the ones that must survive: ¥1,234,567.89 of his own
    // plus his ¥493,827.16 half. Names truncate; amounts never do.
    expect(balance.spentCents.partner_a).toBe(123_456_789 + 49_382_716);
    expect(screen.getByText('CN¥1,728,395.05')).toBeInTheDocument();
    expect(screen.getByText('CN¥493,827.16')).toBeInTheDocument();
  });
});

describe('RebalanceNote', () => {
  it('points forward at whoever is behind, as a suggestion', () => {
    const balance = computeBalance([expense(10000, 'partner_a')], 'EUR');
    render(<RebalanceNote balance={balance} names={names} />);

    // Twice the gap: what actually brings the two level.
    expect(screen.getByText(/The next .*100\.00.* is on Ana/)).toBeInTheDocument();
    expect(screen.getByText(/no rush/i)).toBeInTheDocument();
  });

  it('celebrates being level instead of showing a zero', () => {
    const balance = computeBalance(
      [expense(10000, 'partner_a'), expense(10000, 'partner_b')],
      'EUR',
    );
    const { container } = render(<RebalanceNote balance={balance} names={names} />);
    expect(screen.getByText(/you’re even/i)).toBeInTheDocument();
    expectNoDebtLanguage(container.textContent ?? '');
  });

  it('stays quiet about a drift within tolerance', () => {
    const balance = computeBalance(
      [expense(10000, 'partner_a'), expense(9900, 'partner_b')],
      'EUR',
    );
    render(<RebalanceNote balance={balance} names={names} />);
    expect(screen.getByText(/you’re even/i)).toBeInTheDocument();
  });
});

describe('TreatsNote', () => {
  it('shows treats as given, apart from the balance', () => {
    const balance = computeBalance(
      [expense(5000, 'partner_a', { kind: 'treat' }), expense(2000, 'partner_b')],
      'EUR',
    );
    const { container } = render(<TreatsNote balance={balance} names={names} />);

    expect(screen.getByText(/Léo gave/)).toBeInTheDocument();
    expectNoDebtLanguage(container.textContent ?? '');
  });

  it('renders nothing when no treats have been given', () => {
    const balance = computeBalance([expense(2000, 'partner_b')], 'EUR');
    const { container } = render(<TreatsNote balance={balance} names={names} />);
    expect(container).toBeEmptyDOMElement();
  });
});
