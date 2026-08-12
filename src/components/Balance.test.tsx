import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RebalanceNote, ShareBar, TreatsNote } from './Balance';
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

  it('says nothing has been logged rather than showing a zeroed bar', () => {
    render(<ShareBar balance={computeBalance([], 'EUR')} names={names} />);
    expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument();
  });

  it('describes the split for screen readers without naming a creditor', () => {
    const balance = computeBalance([expense(10000, 'partner_a')], 'EUR');
    render(<ShareBar balance={balance} names={names} />);
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toContain('Léo');
    expect(label).toContain('Ana');
    expectNoDebtLanguage(label);
  });

  it('owns up to the treats the total leaves out', () => {
    const balance = computeBalance(
      [expense(4000, 'partner_a'), expense(3000, 'partner_b', { kind: 'treat' })],
      'EUR',
    );
    render(<ShareBar balance={balance} names={names} />);

    // Otherwise somebody adds the list up by hand, gets €70, and stops
    // believing the page.
    expect(screen.getByText(/€40 shared so far/)).toBeInTheDocument();
    expect(screen.getByText(/with €30 of treats kept out of it/)).toBeInTheDocument();
  });

  it('names personal spending apart, never inside the split', () => {
    const balance = computeBalance(
      [
        expense(10000, 'partner_a', { kind: 'mine' }),
        expense(949, 'partner_b', { kind: '50_50' }),
      ],
      'EUR',
    );
    render(<ShareBar balance={balance} names={names} />);

    // €4.74 and €4.75 — the shared pool, split as agreed. The €100 of his
    // own is said out loud and kept out of every percentage on the bar.
    expect(screen.getByText('€4.74')).toBeInTheDocument();
    expect(screen.getByText('€4.75')).toBeInTheDocument();
    expect(
      screen.getByText(/€9\.49 shared so far, with €100 of personal spending kept out of it/),
    ).toBeInTheDocument();
    expect(screen.queryByText('95.7%')).not.toBeInTheDocument();
  });

  it('says nothing was shared rather than nothing was logged', () => {
    const balance = computeBalance(
      [
        expense(10000, 'partner_a', { kind: 'mine' }),
        expense(5000, 'partner_b', { kind: 'mine' }),
      ],
      'EUR',
    );
    render(<ShareBar balance={balance} names={names} />);

    expect(screen.getByText(/nothing shared yet/i)).toBeInTheDocument();
    expect(screen.getByText(/€150 logged, all of it each of your own/i)).toBeInTheDocument();
  });

  it('keeps the total plain when there are no treats', () => {
    const balance = computeBalance([expense(4000, 'partner_a')], 'EUR');
    render(<ShareBar balance={balance} names={names} />);
    expect(screen.getByText('€40 shared so far')).toBeInTheDocument();
    expect(screen.queryByText(/treats/i)).not.toBeInTheDocument();
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
