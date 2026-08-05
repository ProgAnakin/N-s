import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BalanceBar, RebalanceNote, TreatsNote } from './BalanceBar';
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

describe('BalanceBar', () => {
  it('shows each partner’s share of what has been contributed', () => {
    const balance = computeBalance([expense(10000, 'partner_a'), expense(5000, 'partner_b')], 'EUR');
    render(<BalanceBar balance={balance} names={names} />);

    expect(screen.getByText('Léo')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText('33.3%')).toBeInTheDocument();
  });

  it('never uses debt language, even when badly lopsided', () => {
    const balance = computeBalance(
      [expense(500000, 'partner_a'), expense(1000, 'partner_b')],
      'EUR',
    );
    const { container } = render(
      <>
        <BalanceBar balance={balance} names={names} />
        <RebalanceNote balance={balance} names={names} />
      </>,
    );
    expectNoDebtLanguage(container.textContent ?? '');
  });

  it('describes the split for screen readers without naming a creditor', () => {
    const balance = computeBalance([expense(10000, 'partner_a')], 'EUR');
    render(<BalanceBar balance={balance} names={names} />);
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toContain('Léo');
    expect(label).toContain('Ana');
    expectNoDebtLanguage(label);
  });

  it('says nothing has been logged rather than showing a zeroed bar', () => {
    render(<BalanceBar balance={computeBalance([], 'EUR')} names={names} />);
    expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument();
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
