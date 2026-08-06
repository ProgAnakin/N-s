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

const { VaultScreen } = await import('./VaultScreen');
const { SpendingScreen } = await import('./SpendingScreen');
const { CalendarScreen } = await import('./CalendarScreen');

/**
 * The processes with the most riding on them, driven end to end.
 *
 * Two of these are load-bearing in a way the others are not. A note saved as
 * shared when the author meant private is the single worst thing this app
 * could do, and it would be invisible — the row would look perfectly normal.
 * An expense saved at the wrong amount is the second worst, because the
 * spending page's whole claim is that the arithmetic is trustworthy.
 */

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// The private half
// ---------------------------------------------------------------------------

describe('a note about your partner', () => {
  function mountVault() {
    return mountSignedIn(<VaultScreen />, {
      seed: (db) => {
        db.seed('remember_facts', []);
        db.seed('dismissed_questions', []);
        db.seed('gift_ideas', []);
      },
    });
  }

  it('is private unless the author says otherwise', async () => {
    const user = userEvent.setup();
    const { db } = mountVault();

    await user.click(await screen.findByRole('button', { name: /Add something/ }));
    await user.type(
      await screen.findByLabelText(/What you asked/),
      'When you go quiet, what does it mean?',
    );
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const write = lastWriteTo(db, 'remember_facts');
      expect(write?.op).toBe('insert');
      // The default has to be the safe one. Sharing something you wrote about
      // your partner should take a deliberate act, not the absence of one.
      expect(write?.values).toMatchObject({ visibility: 'private', author_id: HIM_ID });
    });
  });

  it('is shared only when shared was actually chosen', async () => {
    const user = userEvent.setup();
    const { db } = mountVault();

    await user.click(await screen.findByRole('button', { name: /Add something/ }));
    await user.type(await screen.findByLabelText(/What you asked/), 'Favourite tea?');

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Shared/ }));
    await user.click(within(dialog).getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'remember_facts')?.values).toMatchObject({ visibility: 'shared' });
    });
  });

  it('says plainly who can read it, on the form and on the note', async () => {
    const user = userEvent.setup();
    mountVault();

    await user.click(await screen.findByRole('button', { name: /Add something/ }));
    const dialog = await screen.findByRole('dialog');

    // The one thing this app must never do is leave somebody unsure.
    expect(
      within(dialog).getByText(/Only you can see this. Not even your partner./),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Both of you can see and edit this./)).toBeInTheDocument();
  });

  it('keeps the visibility it was given when edited', async () => {
    const user = userEvent.setup();
    const { db } = mountSignedIn(<VaultScreen />, {
      seed: (db) => {
        db.seed('remember_facts', [
          {
            id: 'fact-1',
            couple_id: COUPLE_ID,
            author_id: HIM_ID,
            category: 'communication',
            question: 'What does the silence mean?',
            answer: 'Usually tired.',
            visibility: 'private',
            remind_on: null,
            created_at: '2026-03-01T00:00:00.000Z',
            updated_at: '2026-03-01T00:00:00.000Z',
          },
        ]);
        db.seed('dismissed_questions', []);
        db.seed('gift_ideas', []);
      },
    });

    await screen.findByText('What does the silence mean?');
    await user.click(screen.getByRole('button', { name: /Edit/ }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/What she said/), ' Or hungry.');
    await user.click(within(dialog).getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const write = lastWriteTo(db, 'remember_facts');
      expect(write?.op).toBe('update');
      expect(write?.values).toMatchObject({ visibility: 'private' });
    });
  });
});

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

describe('logging an expense', () => {
  function mountSpending() {
    return mountSignedIn(<SpendingScreen />, {
      seed: (db) => {
        db.seed('expenses', []);
        db.seed('trips', []);
      },
    });
  }

  async function openForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Add' }));
    return screen.findByRole('dialog');
  }

  it('stores what was typed as integer cents, not as a float', async () => {
    const user = userEvent.setup();
    const { db } = mountSpending();

    const dialog = await openForm(user);
    await user.type(within(dialog).getByLabelText(/What for/i), 'Dinner');
    await user.type(within(dialog).getByLabelText(/How much/i), '19.99');
    await user.click(within(dialog).getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const write = lastWriteTo(db, 'expenses');
      expect(write?.op).toBe('insert');
      expect(write?.values).toMatchObject({ amount_cents: 1999, label: 'Dinner' });
    });
    // The classic failure is 19.99 arriving as 1998.9999999999998.
    expect(Number.isInteger(lastWriteTo(db, 'expenses')?.values?.amount_cents)).toBe(true);
  });

  it('accepts a comma, because half of Europe types one', async () => {
    const user = userEvent.setup();
    const { db } = mountSpending();

    const dialog = await openForm(user);
    await user.type(within(dialog).getByLabelText(/What for/i), 'Café');
    await user.type(within(dialog).getByLabelText(/How much/i), '4,50');
    await user.click(within(dialog).getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'expenses')?.values).toMatchObject({ amount_cents: 450 });
    });
  });

  it('refuses a number that is not one, and says why', async () => {
    const user = userEvent.setup();
    const { db } = mountSpending();

    const dialog = await openForm(user);
    await user.type(within(dialog).getByLabelText(/What for/i), 'Nonsense');
    await user.type(within(dialog).getByLabelText(/How much/i), 'abc');
    await user.click(within(dialog).getByRole('button', { name: /^Save$/ }));

    expect(await screen.findByText(/doesn’t look like a number/i)).toBeInTheDocument();
    expect(lastWriteTo(db, 'expenses')).toBeUndefined();
  });

  it('drops the percentage when the split is not a custom one', async () => {
    const user = userEvent.setup();
    const { db } = mountSpending();

    const dialog = await openForm(user);
    await user.type(within(dialog).getByLabelText(/What for/i), 'Present');
    await user.type(within(dialog).getByLabelText(/How much/i), '30');
    await user.click(within(dialog).getByRole('button', { name: /Treat/i }));
    await user.click(within(dialog).getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const values = lastWriteTo(db, 'expenses')?.values;
      expect(values).toMatchObject({ split_rule: 'treat' });
      // A leftover percentage on a treat would make the maths ambiguous.
      expect(values?.partner_a_percent).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// The calendar, and whose week it is
// ---------------------------------------------------------------------------

describe('the calendar grid', () => {
  function mountCalendar(weekStartsOn: number) {
    return mountSignedIn(<CalendarScreen />, {
      couple: { week_starts_on: weekStartsOn },
      seed: (db) => {
        db.seed('plans', []);
        db.seed('important_dates', []);
        db.seed('trips', []);
        db.seed('intimacy_entries', []);
      },
    });
  }

  it('starts the week on Monday when that is what the couple chose', async () => {
    mountCalendar(1);
    const headers = await screen.findAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    expect(headers.map((node) => node.textContent)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
  });

  it('starts it on Sunday for the household that counts that way', async () => {
    mountCalendar(0);
    const headers = await screen.findAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    // The labels have to rotate with the grid, or every date sits under the
    // wrong name — a calendar that is confidently, silently wrong.
    expect(headers.map((node) => node.textContent)).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
  });

  it('saves a plan on the day it was added to', async () => {
    const user = userEvent.setup();
    const { db } = mountCalendar(1);

    await user.click(await screen.findByRole('button', { name: 'Add a plan' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/What are you doing/), 'That ramen place');
    await user.click(within(dialog).getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const write = lastWriteTo(db, 'plans');
      expect(write?.op).toBe('insert');
      expect(write?.values).toMatchObject({
        couple_id: COUPLE_ID,
        title: 'That ramen place',
      });
      expect(write?.values?.day).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    });
  });
});
