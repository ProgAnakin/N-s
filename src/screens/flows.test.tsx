import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, HIM_ID, lastWriteTo, mountSignedIn, mountUnpaired } from '@/test/harness';
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

/**
 * No network in here, on purpose.
 *
 * The spending page fetches rates for expenses that have none of their own.
 * Left unmocked these tests would reach the real provider — slow, flaky, and
 * a different answer every day — so this stands in for it. `offlineRates`
 * flips it to the state where nothing can be fetched at all, which is the
 * only remaining way for an expense to fall out of the total.
 */
const rates = vi.hoisted(() => ({ reachable: true }));
const TODAY_PER_EUR: Record<string, number> = { EUR: 1, BRL: 6.2, CNY: 7.9, USD: 1.08 };

vi.mock('@/data/rates', () => {
  const snapshot = (from: string) =>
    Object.fromEntries(
      Object.entries(TODAY_PER_EUR).map(([code, rate]) => [
        code,
        rate / (TODAY_PER_EUR[from] ?? 1),
      ]),
    );
  return {
    captureRates: vi.fn(async (currency: string) =>
      rates.reachable ? { fx: snapshot(currency), on: '2026-03-14' } : null,
    ),
    captureRatesOn: vi.fn(async (currency: string, date: string) =>
      rates.reachable ? { fx: snapshot(currency), on: date } : null,
    ),
    rateBook: vi.fn(async () =>
      rates.reachable
        ? { EUR: snapshot('EUR'), BRL: snapshot('BRL'), CNY: snapshot('CNY'), USD: snapshot('USD') }
        : {},
    ),
  };
});

const { VaultScreen } = await import('./VaultScreen');
const { SpendingScreen } = await import('./SpendingScreen');
const { CalendarScreen } = await import('./CalendarScreen');
const { GiftsScreen } = await import('./GiftsScreen');
const { OnboardingScreen } = await import('./OnboardingScreen');

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
  rates.reachable = true;
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
    await user.type(within(dialog).getByLabelText(/What they said/), ' Or hungry.');
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

// ---------------------------------------------------------------------------
// One balance across currencies
// ---------------------------------------------------------------------------

describe('the spending page across currencies', () => {
  const eurFx = { EUR: 1, BRL: 6.2, CNY: 7.9, USD: 1.08 };
  const cnyFx = { EUR: 1 / 7.9, BRL: 6.2 / 7.9, CNY: 1, USD: 1.08 / 7.9 };

  function expenseRow(over: Record<string, unknown>) {
    return {
      id: `e-${Math.random().toString(36).slice(2)}`,
      couple_id: COUPLE_ID,
      paid_by: 'partner_a',
      label: 'thing',
      amount_cents: 10_000,
      currency: 'EUR',
      date: '2026-03-01',
      category: 'food',
      split_rule: '50_50',
      partner_a_percent: null,
      trip_id: null,
      note: null,
      fx: eurFx,
      fx_on: '2026-03-01',
      created_by: HIM_ID,
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
      ...over,
    };
  }

  function mountSpendingWith(rows: Record<string, unknown>[]) {
    return mountSignedIn(<SpendingScreen />, {
      seed: (db) => {
        db.seed('expenses', rows);
        db.seed('trips', []);
      },
    });
  }

  it('shows one balance rather than one card per currency', async () => {
    mountSpendingWith([
      expenseRow({ paid_by: 'partner_a', currency: 'EUR', amount_cents: 10_000, fx: eurFx }),
      expenseRow({ paid_by: 'partner_b', currency: 'CNY', amount_cents: 79_000, fx: cnyFx }),
    ]);

    // €100 and ¥790 are the same €100: level, not two bars each reading 100%.
    expect(await screen.findByText(/€200(\.00)? shared so far/)).toBeInTheDocument();
  });

  it('restates the whole total when another currency is picked', async () => {
    const user = userEvent.setup();
    mountSpendingWith([
      expenseRow({ currency: 'EUR', amount_cents: 10_000, fx: eurFx }),
    ]);

    await screen.findByText(/€100(\.00)? shared so far/);
    await user.click(screen.getByRole('button', { name: 'BRL' }));

    expect(await screen.findByText(/R\$\s?620(\.00)? shared so far/)).toBeInTheDocument();
  });

  it('uses the rate the expense was written down at, not a newer one', async () => {
    // Same €100, recorded on a day the real was at 5.0 rather than 6.2.
    mountSpendingWith([
      expenseRow({
        currency: 'EUR',
        amount_cents: 10_000,
        fx: { EUR: 1, BRL: 5.0, CNY: 7.9, USD: 1.08 },
      }),
    ]);

    const user = userEvent.setup();
    await screen.findByText(/€100(\.00)? shared so far/);
    await user.click(screen.getByRole('button', { name: 'BRL' }));

    expect(await screen.findByText(/R\$\s?500(\.00)? shared so far/)).toBeInTheDocument();
  });

  /**
   * Asked for three separate times, and each time the same sentence: the
   * total should be everything, in whichever currency you're reading in.
   * An expense with no rate of its own used to be *subtracted from the
   * answer*. It is now counted at today's rate and repaired, in the
   * background, to the rate of the day it actually happened.
   */
  it('counts an expense that has no rate of its own, rather than dropping it', async () => {
    mountSpendingWith([
      expenseRow({ currency: 'EUR', amount_cents: 10_000, fx: eurFx }),
      expenseRow({ currency: 'CNY', amount_cents: 79_000, fx: null }),
    ]);

    // ¥790 is €100 at 7.9. The old answer here was €100 and an apology.
    expect(await screen.findByText(/€200(\.00)? shared so far/)).toBeInTheDocument();
  });

  it('leaves it out only when there is no rate to be had anywhere', async () => {
    rates.reachable = false;
    mountSpendingWith([
      expenseRow({ currency: 'EUR', amount_cents: 10_000, fx: eurFx }),
      expenseRow({ currency: 'CNY', amount_cents: 79_000, fx: null }),
    ]);

    expect(await screen.findByText(/€100(\.00)? shared so far/)).toBeInTheDocument();
    expect(
      await screen.findByText(/1 expense is in another currency/),
    ).toBeInTheDocument();
  });

  it('needs no rate at all when everything is already in the chosen currency', async () => {
    rates.reachable = false;
    mountSpendingWith([expenseRow({ currency: 'EUR', amount_cents: 10_000, fx: null })]);

    expect(await screen.findByText(/€100(\.00)? shared so far/)).toBeInTheDocument();
    expect(screen.queryByText(/isn’t in this total/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The discovery loop, end to end
// ---------------------------------------------------------------------------

describe('an answer given in March coming back in June', () => {
  function factRow(over: Record<string, unknown>) {
    return {
      id: `f-${Math.random().toString(36).slice(2)}`,
      couple_id: COUPLE_ID,
      author_id: HIM_ID,
      category: 'preferences',
      question: 'What flowers do you actually like?',
      answer: 'Peonies, the big pale ones.',
      visibility: 'shared',
      remind_on: null,
      question_id: 'q29',
      answer_kind: 'taste',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
      ...over,
    };
  }

  function mountGifts(facts: Record<string, unknown>[], dates: Record<string, unknown>[] = []) {
    return mountSignedIn(<GiftsScreen />, {
      seed: (db) => {
        db.seed('remember_facts', facts);
        db.seed('important_dates', dates);
        db.seed('plans', []);
        db.seed('gift_ideas', []);
      },
    });
  }

  it('brings a saved answer back as a gift idea, in their own words', async () => {
    mountGifts([factRow({})]);

    // Verbatim. Not "buy peonies" — the app has no opinion to add.
    expect(await screen.findByText(/Peonies, the big pale ones\./)).toBeInTheDocument();
    expect(
      screen.getByText(/You asked: What flowers do you actually like\?/),
    ).toBeInTheDocument();
  });

  it('says nothing about an answer that is just worth knowing', async () => {
    mountGifts([
      factRow({ answer_kind: 'insight', answer: 'She goes quiet when overwhelmed.' }),
    ]);

    await screen.findByRole('heading', { name: /Gift radar/i });
    expect(screen.queryByText(/She goes quiet when overwhelmed\./)).not.toBeInTheDocument();
  });

  it('shows a line they drew above an idea, so the mistake is prevented first', async () => {
    mountGifts([
      factRow({ answer_kind: 'taste', answer: 'Peonies.' }),
      factRow({
        answer_kind: 'boundary',
        answer: 'Never perfume — I react to it.',
        question: 'What would you never want as a gift?',
      }),
    ]);

    const cards = await screen.findAllByRole('listitem');
    const text = cards.map((card) => card.textContent ?? '');
    const caution = text.findIndex((entry) => entry.includes('Never perfume'));
    const idea = text.findIndex((entry) => entry.includes('Peonies'));
    expect(caution).toBeGreaterThanOrEqual(0);
    expect(caution).toBeLessThan(idea);
  });

  it('ties the idea to the occasion that makes it timely', async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 6);
    const iso = soon.toISOString().slice(0, 10);

    mountGifts(
      [factRow({})],
      [
        {
          id: 'd1',
          couple_id: COUPLE_ID,
          label: 'Their birthday',
          date: iso,
          type: 'birthday',
          recurring: true,
          icon: null,
          created_by: HIM_ID,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    );

    expect(await screen.findByText(/Their birthday/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The ways in
//
// Every one of these covers a feature that was fully built and completely
// unreachable — schema and logic done, no path for a person to use it. That
// is the same failure as the vault being write-only, and it is worth a test
// each so it cannot happen quietly again.
// ---------------------------------------------------------------------------

describe('saying how an evening went', () => {
  function planRow(day: string, over: Record<string, unknown> = {}) {
    return {
      id: 'plan-1',
      couple_id: COUPLE_ID,
      title: 'That ramen place',
      day,
      time_of_day: null,
      location: null,
      note: null,
      kind: 'date',
      done: false,
      went_well: null,
      reflection: null,
      tags: [],
      memory_id: null,
      created_by: HIM_ID,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...over,
    };
  }

  /** Clicks the grid cell for a day relative to today. */
  async function selectDay(user: ReturnType<typeof userEvent.setup>, offset: number) {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    const label = day.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    await user.click(await screen.findByRole('button', { name: label }));
  }

  function isoDaysFromNow(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function mountCalendarWith(plans: Record<string, unknown>[]) {
    return mountSignedIn(<CalendarScreen />, {
      seed: (db) => {
        db.seed('plans', plans);
        db.seed('important_dates', []);
        db.seed('trips', []);
        db.seed('intimacy_entries', []);
        db.seed('remember_facts', []);
      },
    });
  }

  it('does not ask about an evening that has not happened yet', async () => {
    mountCalendarWith([planRow(isoDaysFromNow(3))]);
    await screen.findByRole('heading', { name: 'Calendar' });
    expect(screen.queryByRole('button', { name: 'Again' })).not.toBeInTheDocument();
  });

  it('writes the answer to the column every "again?" suggestion is built on', async () => {
    const user = userEvent.setup();
    const yesterday = isoDaysFromNow(-1);
    const { db } = mountCalendarWith([planRow(yesterday)]);

    // Every day cell carries its full date as an accessible name, which is
    // the only stable way to reach one.
    await selectDay(user, -1);
    await user.click(await screen.findByRole('button', { name: 'Again' }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'plans')?.values).toEqual({ went_well: true });
    });
  });

  it('lets somebody take back an answer they gave by accident', async () => {
    const user = userEvent.setup();
    const yesterday = isoDaysFromNow(-1);
    const { db } = mountCalendarWith([planRow(yesterday, { went_well: true })]);

    await selectDay(user, -1);
    await user.click(await screen.findByRole('button', { name: 'Again' }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'plans')?.values).toEqual({ went_well: null });
    });
  });
});

describe('being asked where you are from', () => {
  it('offers the question on the way in, not buried in settings', async () => {
    const user = userEvent.setup();
    mountUnpaired(<OnboardingScreen />);

    await user.click(await screen.findByRole('button', { name: /Next/i }));
    await user.click(await screen.findByRole('button', { name: /Next/i }));
    await user.click(await screen.findByRole('button', { name: /Next/i }));
    await user.click(await screen.findByRole('button', { name: /Start a new space/i }));

    // Without this the cultural half of the app starts empty and stays
    // empty: nobody goes hunting in settings for a feature they have never
    // seen work.
    expect(await screen.findByLabelText(/Where are you from/i)).toBeInTheDocument();
  });

  it('says what it is for, so it does not read as demographic collection', async () => {
    const user = userEvent.setup();
    mountUnpaired(<OnboardingScreen />);
    for (let i = 0; i < 3; i += 1) {
      await user.click(await screen.findByRole('button', { name: /Next/i }));
    }
    await user.click(await screen.findByRole('button', { name: /Join your partner/i }));

    expect(await screen.findByText(/watch for the days your country keeps/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Rather not say/i })).toBeInTheDocument();
  });
});
