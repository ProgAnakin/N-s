import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const { IdeasScreen } = await import('./IdeasScreen');

/**
 * The shelf, driven the way somebody uses it on a Friday.
 *
 * The filter is the whole feature, so most of these are about what it
 * does to the page rather than about the maths — that is covered in
 * dateideas.test.ts. What is checked here is the seam: that a filter
 * narrows the page, that what it removed is still reachable, and that
 * pressing a button writes the row the database expects.
 */

function ideaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: `idea-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    title: 'Walk by the river',
    note: null,
    cost: 'free',
    typical_cents: null,
    times: ['evening'],
    feeling: 'calm',
    bring: null,
    booking: 'none',
    book_days_ahead: null,
    outdoors: false,
    minutes: null,
    place_id: null,
    last_done_on: null,
    done_count: 0,
    favourite: false,
    created_by: HIM_ID,
    created_at: '2026-03-01T09:00:00.000Z',
    updated_at: '2026-03-01T09:00:00.000Z',
    ...overrides,
  };
}

function mount(rows: Record<string, unknown>[]) {
  return mountSignedIn(<IdeasScreen />, {
    seed: (db) => {
      db.seed('date_ideas', rows);
      db.seed('plans', []);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
  /*
   * Eight in the evening, local.
   *
   * The filter defaults to the time of day it actually is, so without a
   * fixed clock these tests pass in the evening and fail in the morning.
   * Local rather than UTC because the screen reads local hours and dates:
   * pinning it to a Z time moves the day in half the world's timezones,
   * and `last_done_on` then comes out as the 13th or the 15th.
   *
   * `shouldAdvanceTime` because user-event waits on real time between
   * synthetic events, and a frozen clock deadlocks it.
   */
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 14, 20, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('an empty shelf', () => {
  it('asks for the last thing somebody said “we should do that” about', async () => {
    mount([]);
    expect(await screen.findByText(/Nothing on the shelf yet/)).toBeInTheDocument();
  });
});

describe('adding one', () => {
  it('writes every field the shelf later filters on', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { db } = mount([]);

    await user.click(await screen.findByRole('button', { name: /Add an idea/ }));
    await user.type(
      await screen.findByLabelText(/What is it/),
      'The rooftop with the bad wine',
    );
    await user.click(screen.getByRole('button', { name: 'Cheap' }));
    await user.click(screen.getByRole('button', { name: 'Romantic' }));
    await user.click(screen.getByRole('button', { name: 'Evening' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'date_ideas')?.values).toMatchObject({
        title: 'The rooftop with the bad wine',
        cost: 'cheap',
        feeling: 'romantic',
        times: ['evening'],
        booking: 'none',
      });
    });
  });

  /**
   * A lead time left over from a booking that was switched back to "just
   * turn up" would resurface as a "book by" date on something you walk
   * into.
   */
  it('drops a lead time when the booking was turned off again', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { db } = mount([]);

    await user.click(await screen.findByRole('button', { name: /Add an idea/ }));
    await user.type(await screen.findByLabelText(/What is it/), 'Somewhere');
    await user.selectOptions(screen.getByLabelText(/Booking/), 'required');
    await user.type(await screen.findByLabelText(/How far ahead/), '14');
    await user.selectOptions(screen.getByLabelText(/Booking/), 'none');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'date_ideas')?.values).toMatchObject({
        booking: 'none',
        book_days_ahead: null,
      });
    });
  });
});

describe('the filter', () => {
  const shelf = [
    ideaRow({ title: 'Walk by the river', cost: 'free', outdoors: true, feeling: 'calm' }),
    ideaRow({ title: 'The expensive place', cost: 'splash', feeling: 'romantic' }),
    ideaRow({ title: 'Cook badly together', cost: 'cheap', feeling: 'playful' }),
  ];

  it('narrows the page to what fits', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount(shelf);

    await screen.findByText('The expensive place');
    await user.selectOptions(screen.getByLabelText(/Roughly what it costs/), 'cheap');

    await waitFor(() => {
      expect(screen.queryByText('The expensive place')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Cook badly together')).toBeInTheDocument();
  });

  /**
   * The rule that keeps the filter honest. A page quietly showing three of
   * twenty leaves you believing you own three, and next Friday you stop
   * opening it.
   */
  it('says how many it set aside, and can show them with the reason', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount(shelf);

    await screen.findByText('Cook badly together');
    await user.selectOptions(screen.getByLabelText(/Roughly what it costs/), 'free');

    expect(await screen.findByText('2 set aside')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show what was set aside/ }));
    expect(await screen.findByText('The expensive place')).toBeInTheDocument();
    expect(screen.getAllByText('Costs more than that').length).toBeGreaterThan(0);
  });

  it('offers the one loosening that would return the most', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount(shelf);

    await screen.findByText('Walk by the river');
    await user.click(screen.getByRole('button', { name: /It’s raining/ }));

    expect(await screen.findByText(/1 more if you’d go outdoors/)).toBeInTheDocument();
  });

  it('puts everything back', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount(shelf);

    await screen.findByText('Cook badly together');
    await user.selectOptions(screen.getByLabelText(/Roughly what it costs/), 'free');
    await screen.findByText('2 set aside');

    await user.click(screen.getByRole('button', { name: /Show everything/ }));
    await waitFor(() => {
      expect(screen.getByText('The expensive place')).toBeInTheDocument();
    });
  });
});

describe('using an idea', () => {
  it('marks it done rather than deleting it, because good ones come round again', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { db } = mount([ideaRow({ id: 'one', done_count: 2 })]);

    await user.click(await screen.findByRole('button', { name: /We did this/ }));

    await waitFor(() => {
      const write = lastWriteTo(db, 'date_ideas');
      expect(write?.op).toBe('update');
      expect(write?.values).toMatchObject({ done_count: 3, last_done_on: '2026-08-14' });
    });
  });

  it('puts it in the calendar, carrying the link back to the idea', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { db } = mount([ideaRow({ id: 'rooftop', title: 'The rooftop' })]);

    await user.click(await screen.findByRole('button', { name: /Put it in the calendar/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Put it in the calendar/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'plans')?.values).toMatchObject({
        title: 'The rooftop',
        kind: 'date',
        // Without this the idea can never learn it was used, and the shelf
        // keeps offering something already on the calendar.
        idea_id: 'rooftop',
      });
    });
  });

  it('shows that something is already planned instead of offering to plan it twice', async () => {
    mountSignedIn(<IdeasScreen />, {
      seed: (db) => {
        db.seed('date_ideas', [ideaRow({ id: 'rooftop', title: 'The rooftop' })]);
        db.seed('plans', [
          {
            id: 'p1',
            couple_id: COUPLE_ID,
            title: 'The rooftop',
            day: '2026-08-20',
            idea_id: 'rooftop',
            done: false,
            kind: 'date',
            time_of_day: null,
            location: null,
            note: null,
            went_well: null,
            reflection: null,
            tags: [],
            memory_id: null,
            created_by: HIM_ID,
            created_at: '2026-08-01T00:00:00Z',
            updated_at: '2026-08-01T00:00:00Z',
          },
        ]);
      },
    });

    expect(await screen.findByText(/Planned for/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Put it in the calendar/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps a favourite near the top', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { db } = mount([ideaRow({ id: 'one' })]);

    await user.click(await screen.findByRole('button', { name: /Keep this one near the top/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'date_ideas')?.values).toEqual({ favourite: true });
    });
  });
});

describe('what the shelf never says', () => {
  /**
   * An idea knows who wrote it down, for nothing more than its own row.
   * "You added 12, they added 3" is a scoreboard, and this app keeps none.
   */
  it('never attributes an idea to one of the two people', async () => {
    mount([
      ideaRow({ title: 'His idea', created_by: HIM_ID }),
      ideaRow({ title: 'Her idea', created_by: 'her-id' }),
    ]);

    await screen.findByText('His idea');
    const page = within(document.body);
    expect(page.queryByText(/you added/i)).not.toBeInTheDocument();
    expect(page.queryByText(/suggested by/i)).not.toBeInTheDocument();
  });
});
