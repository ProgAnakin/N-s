import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, HIM_ID, lastWriteTo, mountSignedIn } from '@/test/harness';
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

const { TripsScreen } = await import('./TripsScreen');

/**
 * Trips.
 *
 * Two things on this page are arithmetic dressed as a progress bar, and
 * both are the kind of wrong that looks right: a budget that quietly counts
 * expenses from a different trip, and a checklist that says "3 of 4 sorted"
 * when the fourth belongs to somebody else's holiday. Those are what these
 * tests are for. The rest is that a page with no trips on it offers a way
 * to start rather than an empty heading.
 */

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function tripRow(over: Record<string, unknown> = {}) {
  return {
    id: `t-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    destination: 'Lisbon',
    start_date: daysFromNow(20),
    end_date: daysFromNow(24),
    budget_total_cents: null,
    currency: 'EUR',
    notes: null,
    created_by: HIM_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function itemRow(over: Record<string, unknown> = {}) {
  return {
    id: `i-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    trip_id: 't1',
    title: 'Flight',
    type: 'flight',
    day: null,
    time: null,
    note: null,
    attachment_path: null,
    done: false,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function expenseRow(over: Record<string, unknown> = {}) {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    label: 'Hotel',
    amount_cents: 10_000,
    currency: 'EUR',
    paid_by: 'partner_a',
    date: daysFromNow(21),
    category: 'stay',
    split_rule: '50_50',
    partner_a_percent: null,
    trip_id: 't1',
    note: null,
    fx: { EUR: 1, BRL: 6.2, CNY: 7.9, USD: 1.08 },
    fx_on: '2026-01-01',
    edited_at: null,
    created_by: HIM_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function mount(seed: Record<string, Record<string, unknown>[]> = {}) {
  return mountSignedIn(<TripsScreen />, {
    seed: (db) => {
      db.seed('trips', seed.trips ?? []);
      db.seed('trip_items', seed.trip_items ?? []);
      db.seed('expenses', seed.expenses ?? []);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('with nothing planned', () => {
  it('offers a way to start rather than an empty heading', async () => {
    mount();
    expect(await screen.findByText('No trips planned')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plan a trip' })).toBeInTheDocument();
    expect(screen.queryByText('Coming up')).not.toBeInTheDocument();
  });
});

describe('sorting what is ahead from what is behind', () => {
  it('separates the two, and does not show a heading for a section with nothing in it', async () => {
    mount({
      trips: [
        tripRow({ id: 't1', destination: 'Lisbon', start_date: daysFromNow(20), end_date: daysFromNow(24) }),
      ],
    });

    await screen.findByText('Lisbon');
    expect(screen.getByText('Coming up')).toBeInTheDocument();
    expect(screen.queryByText('Been there')).not.toBeInTheDocument();
  });

  it('counts a trip as past once its last day has gone', async () => {
    mount({
      trips: [
        tripRow({ id: 't1', destination: 'Porto', start_date: daysFromNow(-30), end_date: daysFromNow(-25) }),
        tripRow({ id: 't2', destination: 'Lisbon' }),
      ],
    });

    await screen.findByText('Porto');
    const been = screen.getByText('Been there').closest('section')!;
    expect(within(been).getByText('Porto')).toBeInTheDocument();
    expect(within(been).queryByText('Lisbon')).not.toBeInTheDocument();
  });

  /**
   * An open-ended trip has no end date. Falling back to the start is what
   * keeps a one-day thing from sitting in "coming up" for ever.
   */
  it('falls back to the start date when there is no end date', async () => {
    mount({
      trips: [tripRow({ id: 't1', destination: 'Day out', start_date: daysFromNow(-3), end_date: null })],
    });

    await screen.findByText('Day out');
    expect(screen.getByText('Been there')).toBeInTheDocument();
  });

  it('leaves a trip with no dates at all in the coming-up list', async () => {
    mount({
      trips: [tripRow({ id: 't1', destination: 'Someday', start_date: null, end_date: null })],
    });

    await screen.findByText('Someday');
    expect(screen.getByText('Coming up')).toBeInTheDocument();
  });
});

describe('the two bars', () => {
  /**
   * The failure worth catching: a checklist that counts somebody else's
   * holiday. It reads perfectly plausibly and is simply untrue.
   */
  it('counts only the items belonging to this trip', async () => {
    mount({
      trips: [tripRow({ id: 't1', destination: 'Lisbon' }), tripRow({ id: 't2', destination: 'Rome' })],
      trip_items: [
        itemRow({ trip_id: 't1', done: true }),
        itemRow({ trip_id: 't1', done: false }),
        itemRow({ trip_id: 't2', done: false }),
        itemRow({ trip_id: 't2', done: false }),
      ],
    });

    const lisbon = (await screen.findByText('Lisbon')).closest('article')!;
    expect(within(lisbon).getByText('1 of 2 sorted')).toBeInTheDocument();
  });

  it('counts only the expenses tied to this trip against its budget', async () => {
    mount({
      trips: [
        tripRow({ id: 't1', destination: 'Lisbon', budget_total_cents: 50_000 }),
        tripRow({ id: 't2', destination: 'Rome', budget_total_cents: 50_000 }),
      ],
      expenses: [
        expenseRow({ trip_id: 't1', amount_cents: 10_000 }),
        expenseRow({ trip_id: 't2', amount_cents: 40_000 }),
        // Not part of any trip, and must count against neither.
        expenseRow({ trip_id: null, amount_cents: 90_000 }),
      ],
    });

    const lisbon = (await screen.findByText('Lisbon')).closest('article')!;
    expect(within(lisbon).getByText(/€100(\.00)? of €500(\.00)?/)).toBeInTheDocument();
    expect(within(lisbon).getByText(/€400(\.00)? left/)).toBeInTheDocument();
  });

  it('says how far over rather than showing a negative amount left', async () => {
    mount({
      trips: [tripRow({ id: 't1', destination: 'Lisbon', budget_total_cents: 10_000 })],
      expenses: [expenseRow({ trip_id: 't1', amount_cents: 15_000 })],
    });

    const lisbon = (await screen.findByText('Lisbon')).closest('article')!;
    expect(within(lisbon).getByText(/€50(\.00)? over/)).toBeInTheDocument();
    expect(within(lisbon).queryByText(/-€/)).not.toBeInTheDocument();
  });

  it('shows no bars at all when there is nothing to measure', async () => {
    mount({ trips: [tripRow({ id: 't1', destination: 'Lisbon', budget_total_cents: null })] });
    await screen.findByText('Lisbon');
    expect(screen.queryByText(/sorted/)).not.toBeInTheDocument();
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });
});

describe('planning one', () => {
  it('saves what was typed, with the empty optional fields as null', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText('Where'), 'Lisbon');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'trips')?.values).toMatchObject({
        destination: 'Lisbon',
        start_date: null,
        end_date: null,
        budget_total_cents: null,
        notes: null,
      });
    });
  });

  it('stores the budget as integer cents, not as a float', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText('Where'), 'Lisbon');
    await user.type(screen.getByLabelText(/Budget/), '1250,90');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'trips')?.values).toMatchObject({ budget_total_cents: 125_090 });
    });
  });

  it('will not save a trip with nowhere to go', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await screen.findByLabelText('Where');
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
    expect(db.writes).toHaveLength(0);
  });

  it('opens the editor already filled in', async () => {
    const user = userEvent.setup();
    mount({
      trips: [tripRow({ id: 't1', destination: 'Lisbon', budget_total_cents: 50_000, notes: 'Take the tram' })],
    });

    await user.click(await screen.findByRole('button', { name: /Edit/i }));
    expect(await screen.findByLabelText('Where')).toHaveValue('Lisbon');
    expect(screen.getByLabelText(/Budget/)).toHaveValue('500.00');
    expect(screen.getByLabelText(/Notes/)).toHaveValue('Take the tram');
  });
});

describe('getting to one', () => {
  it('links each trip through to its own page', async () => {
    mount({ trips: [tripRow({ id: 'abc', destination: 'Lisbon' })] });
    const link = (await screen.findByText('Lisbon')).closest('a')!;
    expect(link).toHaveAttribute('href', '/trips/abc');
  });
});
