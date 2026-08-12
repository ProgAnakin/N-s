import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
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

// The screen reads the trip id from the route, so the harness's MemoryRouter
// has to actually be at that route rather than at `/`.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams: () => ({ tripId: 't1' }) };
});

const { TripDetailScreen } = await import('./TripDetailScreen');

/**
 * One trip.
 *
 * The piece worth testing is the itinerary's filing rules, because they are
 * where a plan silently loses something. An item dated outside the trip's own
 * range, and an item with no date at all, both have to appear somewhere: a
 * flight you have not booked yet still needs to be on the list, and a hotel
 * booked for the night before the trip starts must not vanish because the
 * loop only walks the days between the start and the end.
 */

function tripRow(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    couple_id: COUPLE_ID,
    destination: 'Lisbon',
    start_date: '2026-09-10',
    end_date: '2026-09-12',
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
    title: 'Something',
    type: 'activity',
    day: null,
    datetime: null,
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
    date: '2026-09-10',
    category: 'stay',
    split_rule: '50_50',
    partner_a_percent: null,
    trip_id: 't1',
    note: null,
    fx: { EUR: 1, BRL: 6.2, CNY: 7.9, USD: 1.08 },
    fx_on: '2026-09-10',
    edited_at: null,
    created_by: HIM_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function mount(seed: Record<string, Record<string, unknown>[]> = {}) {
  return mountSignedIn(
    <Routes>
      <Route path="*" element={<TripDetailScreen />} />
    </Routes>,
    {
      seed: (db) => {
        db.seed('trips', seed.trips ?? [tripRow()]);
        db.seed('trip_items', seed.trip_items ?? []);
        db.seed('expenses', seed.expenses ?? []);
      },
    },
  );
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('when the trip is not there', () => {
  it('says so and offers the way back, rather than rendering a blank page', async () => {
    mount({ trips: [] });
    expect(await screen.findByText(/isn’t here anymore/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/trips');
  });
});

/** The plan, not the whole page — the header repeats the trip's own dates. */
function planSection() {
  return within(screen.getByText('Plan').closest('section')!);
}

describe('the itinerary', () => {
  it('files an item under the day it happens on', async () => {
    mount({ trip_items: [itemRow({ title: 'Flight TP1234', day: '2026-09-10', type: 'flight' })] });
    await screen.findByText('Flight TP1234');
    expect(planSection().getByText(/10 September 2026|September 10, 2026/)).toBeInTheDocument();
  });

  /**
   * A flight you have not booked yet still needs to be on the list. Losing
   * it because it has no date is the failure this section exists to prevent.
   */
  it('keeps an item with no day in a holding area rather than dropping it', async () => {
    mount({ trip_items: [itemRow({ title: 'Book the ferry', day: null })] });
    const holding = (await screen.findByText('Not on a day yet')).closest('div')!;
    expect(within(holding).getByText('Book the ferry')).toBeInTheDocument();
  });

  /**
   * The subtler one: an item dated outside the trip's own range. The day
   * loop only walks start→end, so without the stray pass a hotel booked for
   * the night before disappears from a page that claims to be the plan.
   */
  it('still shows an item dated outside the trip’s own range', async () => {
    mount({
      trip_items: [itemRow({ title: 'Night before', day: '2026-09-09', type: 'stay' })],
    });
    expect(await screen.findByText('Night before')).toBeInTheDocument();
  });

  it('draws no heading for a day with nothing on it', async () => {
    mount({ trip_items: [itemRow({ title: 'Museum', day: '2026-09-11' })] });
    await screen.findByText('Museum');
    const plan = planSection();
    expect(plan.getByText(/11 September 2026|September 11, 2026/)).toBeInTheDocument();
    expect(plan.queryByText(/10 September 2026|September 10, 2026/)).not.toBeInTheDocument();
  });

  it('offers somewhere to start when the plan is empty', async () => {
    mount();
    expect(await screen.findByText('Nothing planned yet')).toBeInTheDocument();
  });
});

describe('ticking things off', () => {
  it('writes the change rather than only crossing it out on screen', async () => {
    const user = userEvent.setup();
    const { db } = mount({ trip_items: [itemRow({ id: 'i1', title: 'Passport', done: false })] });

    await screen.findByText('Passport');
    await user.click(screen.getByRole('button', { name: /^Done$/i }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'trip_items')?.values).toMatchObject({ done: true });
    });
  });

  it('counts progress across the whole plan, scheduled or not', async () => {
    mount({
      trip_items: [
        itemRow({ done: true, day: '2026-09-10' }),
        itemRow({ done: false, day: null }),
        itemRow({ done: false, day: '2026-09-11' }),
      ],
    });
    expect(await screen.findByText('1 of 3 sorted')).toBeInTheDocument();
  });
});

describe('the budget', () => {
  it('counts only the expenses tied to this trip', async () => {
    mount({
      trips: [tripRow({ budget_total_cents: 50_000 })],
      expenses: [
        expenseRow({ trip_id: 't1', amount_cents: 10_000 }),
        expenseRow({ trip_id: 'other', amount_cents: 40_000 }),
      ],
    });

    expect(await screen.findByText(/€100(\.00)? of €500(\.00)?/)).toBeInTheDocument();
    expect(screen.getByText('1 expense')).toBeInTheDocument();
  });

  it('still shows what has been spent when no budget was set', async () => {
    mount({
      trips: [tripRow({ budget_total_cents: null })],
      expenses: [expenseRow({ amount_cents: 10_000 })],
    });
    expect(await screen.findByText(/No budget set/)).toBeInTheDocument();
    expect(screen.getByText(/€100/)).toBeInTheDocument();
  });
});

describe('adding to the plan', () => {
  it('starts a new item on the first day of the trip', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('button', { name: /Add to the plan/ }));
    expect(await screen.findByLabelText(/Which day/)).toHaveValue('2026-09-10');
  });

  it('saves the title and leaves the blanks null', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: /Add to the plan/ }));
    await user.type(await screen.findByLabelText('What'), 'Ferry to Cacilhas');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'trip_items')?.values).toMatchObject({
        title: 'Ferry to Cacilhas',
        trip_id: 't1',
        note: null,
        datetime: null,
        attachment_path: null,
      });
    });
  });

  /** A time with no day is meaningless, and must not be stored as one. */
  it('records a time only when there is a day to hang it on', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: /Add to the plan/ }));
    await user.type(await screen.findByLabelText('What'), 'Flight');
    const day = screen.getByLabelText(/Which day/);
    await user.clear(day);
    await user.type(screen.getByLabelText(/Time/), '07:30');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const values = lastWriteTo(db, 'trip_items')?.values as Record<string, unknown>;
      expect(values.day).toBeNull();
      expect(values.datetime).toBeNull();
    });
  });
});
