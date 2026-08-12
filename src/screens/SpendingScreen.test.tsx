import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, lastWriteTo, mountSignedIn } from '@/test/harness';
import { resetWriteFailure } from '@/data/write-status';

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

// Rates come from the network. Frozen here so the tests are about which
// rate is used, never about what it happens to be today.
vi.mock('@/data/rates', () => ({
  captureRates: vi.fn(async (currency: string) => ({
    fx: { EUR: 1, BRL: 6.2, CNY: 7.9, USD: 1.1, [currency]: 1 },
    on: '2026-08-14',
  })),
}));

const { SpendingScreen } = await import('./SpendingScreen');

/**
 * The rate an expense is converted at.
 *
 * This is the one rule the money side of the app makes a promise about:
 * a rate is frozen the day an expense is written down and never
 * revisited, because recomputing an old expense at today's rate silently
 * rewrites what somebody carried.
 *
 * It was broken in exactly one place — the edit path re-captured on every
 * save — and the fix shipped without a test, which is why this file
 * exists.
 */

function expenseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    label: 'Dinner',
    amount_cents: 4500,
    currency: 'EUR',
    paid_by: 'partner_a',
    date: '2025-08-14',
    category: 'food',
    split_rule: '50_50',
    partner_a_percent: null,
    trip_id: null,
    note: null,
    // A year old, and converted at a rate that is nothing like today's.
    fx: { EUR: 1, BRL: 5.1, CNY: 7.1, USD: 1.05 },
    fx_on: '2025-08-14',
    edited_at: null,
    created_by: null,
    created_at: '2025-08-14T20:00:00.000Z',
    updated_at: '2025-08-14T20:00:00.000Z',
    // Spread last, and it was missing the first time: every override was
    // silently discarded, so four tests were quietly asserting against
    // the default row rather than the one they set up.
    ...overrides,
  };
}

function mount(rows: Record<string, unknown>[] = []) {
  return mountSignedIn(<SpendingScreen />, {
    seed: (db) => {
      db.seed('expenses', rows);
      db.seed('trips', []);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('the rate is frozen the day it was written down', () => {
  /**
   * The bug this file was written for. Correcting a typo in a label used
   * to re-capture the rate, restating a year-old expense at today's — the
   * exact drift the whole design exists to prevent, reached through the
   * edit button instead of through arithmetic.
   */
  it('does not re-freeze a year-old expense when its label is corrected', async () => {
    const user = userEvent.setup();
    const { db } = mount([expenseRow({ id: 'old', label: 'Diner' })]);

    await user.click(await screen.findByRole('button', { name: /Edit/i }));
    const field = await screen.findByLabelText(/What for/i);
    await user.clear(field);
    await user.type(field, 'Dinner by the river');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'expenses')?.values).toMatchObject({
        label: 'Dinner by the river',
      });
    });
    const written = lastWriteTo(db, 'expenses')?.values as Record<string, unknown>;
    expect(written).not.toHaveProperty('fx');
    expect(written).not.toHaveProperty('fx_on');
  });

  it('does capture a rate for something new', async () => {
    const user = userEvent.setup();
    const { db } = mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText(/What for/i), 'Coffee');
    await user.type(screen.getByLabelText(/How much/i), '4,50');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const values = lastWriteTo(db, 'expenses')?.values as Record<string, unknown>;
      expect(values?.fx_on).toBe('2026-08-14');
    });
  });

  it('captures a new rate when the currency itself changed', async () => {
    const user = userEvent.setup();
    const { db } = mount([expenseRow({ id: 'old' })]);

    await user.click(await screen.findByRole('button', { name: /Edit/i }));
    await user.selectOptions(await screen.findByLabelText(/Currency/i), 'BRL');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const values = lastWriteTo(db, 'expenses')?.values as Record<string, unknown>;
      expect(values?.currency).toBe('BRL');
      // A snapshot for euros cannot convert reais; a new one is required.
      expect(values?.fx_on).toBe('2026-08-14');
    });
  });

  it('fills in a rate for an expense that never got one', async () => {
    const user = userEvent.setup();
    const { db } = mount([expenseRow({ id: 'offline', fx: null, fx_on: null })]);

    await user.click(await screen.findByRole('button', { name: /Edit/i }));
    const field = await screen.findByLabelText(/What for/i);
    await user.clear(field);
    await user.type(field, 'Recovered');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const values = lastWriteTo(db, 'expenses')?.values as Record<string, unknown>;
      expect(values?.fx_on).toBe('2026-08-14');
    });
  });
});

describe('a corrected expense says so', () => {
  it('marks a row whose amount or payer changed after the fact', async () => {
    mount([expenseRow({ label: 'Rent', edited_at: '2026-08-01T10:00:00.000Z' })]);
    await screen.findByText('Rent');
    expect(screen.getByText('edited')).toBeInTheDocument();
  });

  it('says nothing on an expense nobody has touched', async () => {
    mount([expenseRow({ label: 'Rent' })]);
    await screen.findByText('Rent');
    expect(screen.queryByText('edited')).not.toBeInTheDocument();
  });
});

describe('what the page shows about currencies', () => {
  /**
   * The categories were converted into the currency being read and then
   * labelled with the couple's — a euro sign in front of a number of yuan.
   */
  it('labels the category totals with the currency being read', async () => {
    const user = userEvent.setup();
    mount([expenseRow({ amount_cents: 10000 })]);

    await screen.findByText(/Where it goes/i);
    await user.click(screen.getByRole('button', { name: 'BRL' }));

    await waitFor(() => {
      // 100 EUR at the frozen 2025 rate of 5.1 is R$510 — and it must say
      // R$, not €. It appears twice now: once in the category bar and
      // once as the row's "counts as", which is the point of both changes.
      expect(screen.getAllByText(/R\$\s?510/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/€\s?510/)).not.toBeInTheDocument();
  });

  it('shows what a row counts as, without hiding what was paid', async () => {
    const user = userEvent.setup();
    mount([expenseRow({ amount_cents: 10000, label: 'Rent' })]);

    await screen.findByText('Rent');
    await user.click(screen.getByRole('button', { name: 'CNY' }));

    await waitFor(() => {
      expect(screen.getByText(/counts as/i)).toBeInTheDocument();
    });
    // The original is still there. Nothing is replaced.
    expect(screen.getByText(/€\s?100/)).toBeInTheDocument();
  });

  it('says on the row itself when an expense has no rate', async () => {
    const user = userEvent.setup();
    mount([expenseRow({ label: 'Offline one', fx: null, fx_on: null })]);

    await screen.findByText('Offline one');
    await user.click(screen.getByRole('button', { name: 'BRL' }));

    expect(await screen.findByText(/no rate/i)).toBeInTheDocument();
  });
});
