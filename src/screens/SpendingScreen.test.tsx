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

// Rates come from the network. Frozen here so the tests are about which
// rate is used, never about what it happens to be today.
//
// Two tables, deliberately far apart: any test that confuses today's rate
// for the rate of the day an expense happened gets a visibly wrong number
// rather than one that is nearly right.
const TODAY = { EUR: 1, BRL: 6.2, CNY: 7.9, USD: 1.1 } as Record<string, number>;
const BACK_THEN = { EUR: 1, BRL: 5.1, CNY: 7.1, USD: 1.05 } as Record<string, number>;

function snapshot(table: Record<string, number>, from: string) {
  const base = table[from] ?? 1;
  return Object.fromEntries(
    Object.entries(table).map(([code, rate]) => [code, rate / base]),
  ) as Record<string, number>;
}

vi.mock('@/data/rates', () => ({
  captureRates: vi.fn(async (currency: string) => ({
    fx: snapshot(TODAY, currency),
    on: '2026-08-14',
  })),
  captureRatesOn: vi.fn(async (currency: string, date: string) => ({
    fx: snapshot(date < '2026-01-01' ? BACK_THEN : TODAY, currency),
    on: date,
  })),
  rateBook: vi.fn(async () => ({
    EUR: snapshot(TODAY, 'EUR'),
    BRL: snapshot(TODAY, 'BRL'),
    CNY: snapshot(TODAY, 'CNY'),
    USD: snapshot(TODAY, 'USD'),
  })),
}));

const { SpendingScreen } = await import('./SpendingScreen');
const { captureRatesOn, rateBook } = await import('@/data/rates');

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
  vi.mocked(captureRatesOn).mockClear();
  vi.mocked(rateBook).mockClear();
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
    const dated = screen.getByLabelText<HTMLInputElement>(/When/i).value;
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const values = lastWriteTo(db, 'expenses')?.values as Record<string, unknown>;
      // Dated today, so it gets today's rate — same request either way.
      expect(values?.fx_on).toBe(dated);
      expect((values?.fx as Record<string, number>).BRL).toBe(6.2);
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
      // A snapshot for euros cannot convert reais; a new one is required —
      // and for the day the expense is dated, which is still 2025.
      expect(values?.fx_on).toBe('2025-08-14');
    });
  });

  /**
   * Somebody catching up on the week's dinners on a Sunday evening types
   * Tuesday's date. Tuesday's rate is the one that belongs on it, and it is
   * a thing that can simply be asked for.
   */
  it('freezes a backdated expense at the rate of the day it is dated', async () => {
    const user = userEvent.setup();
    const { db } = mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText(/What for/i), 'Tuesday’s dinner');
    await user.type(screen.getByLabelText(/How much/i), '30');
    const when = screen.getByLabelText(/When/i);
    await user.clear(when);
    await user.type(when, '2025-11-04');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const values = lastWriteTo(db, 'expenses')?.values as Record<string, unknown>;
      expect(values?.fx_on).toBe('2025-11-04');
      expect((values?.fx as Record<string, number>).BRL).toBe(5.1);
    });
  });

  it('fills in a rate for an expense that never got one', async () => {
    // The silent repair can't reach the network, so the row is still
    // missing a rate by the time the edit is saved.
    vi.mocked(captureRatesOn).mockResolvedValueOnce(null);
    const user = userEvent.setup();
    const { db } = mount([expenseRow({ id: 'offline', fx: null, fx_on: null })]);

    await user.click(await screen.findByRole('button', { name: /Edit/i }));
    const field = await screen.findByLabelText(/What for/i);
    await user.clear(field);
    await user.type(field, 'Recovered');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const values = lastWriteTo(db, 'expenses')?.values as Record<string, unknown>;
      expect(values?.fx_on).toBe('2025-08-14');
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

});

/**
 * The complaint this describe block exists for, asked three times: the
 * total must be the total.
 *
 * An expense written down without a rate used to be *subtracted from the
 * answer* — left out of the one number the page exists to give, with a line
 * of grey text underneath and a button somebody had to find and press. A
 * total that skips rows is not a total, however honestly it says so.
 *
 * Two things had to be true instead. Nothing may be excluded; and nothing
 * may be quietly restated at today's rate either, because a dinner in March
 * is worth what it was worth in March. Both hold now, because the rate for
 * a past day is a thing you can simply ask for.
 */
describe('one total, with nothing left out of it', () => {
  it('counts an expense that has no rate of its own', async () => {
    // The repair can't reach the network; the stand-in has to hold.
    vi.mocked(captureRatesOn).mockResolvedValueOnce(null);
    const user = userEvent.setup();
    mount([
      expenseRow({ id: 'a', label: 'Rent', amount_cents: 10000, currency: 'EUR' }),
      expenseRow({
        id: 'b',
        label: 'Noodles',
        amount_cents: 7900,
        currency: 'CNY',
        fx: null,
        fx_on: null,
      }),
    ]);

    await screen.findByText('Noodles');
    await user.click(screen.getByRole('button', { name: 'EUR' }));

    // €100 plus ¥79, which at today's 7.9 is €10. The old behaviour showed
    // €100 and an apology.
    await waitFor(() => {
      expect(screen.getAllByText(/€\s?110/).length).toBeGreaterThan(0);
    });
  });

  it('marks a stood-in figure as approximate rather than settled', async () => {
    vi.mocked(captureRatesOn).mockResolvedValueOnce(null);
    const user = userEvent.setup();
    mount([expenseRow({ label: 'Offline one', fx: null, fx_on: null })]);

    const row = (await screen.findByText('Offline one')).closest('li')!;
    await user.click(screen.getByRole('button', { name: 'BRL' }));

    // Scoped to the row: the rebalance note underneath now also says "about",
    // because it explains where the two of them would land.
    await waitFor(() => {
      expect(within(row).getByText(/about\s+R\$\s?279/)).toBeInTheDocument();
    });
    expect(screen.getByText(/haven’t got|hasn’t got/i)).toBeInTheDocument();
  });

  /**
   * The heart of it. A repair must use the rate of the day the expense
   * happened — not today's, which is what the button it replaced offered.
   */
  it('repairs a missing rate at the rate of the day it happened', async () => {
    const { db } = mount([
      expenseRow({ id: 'offline', label: 'Old dinner', fx: null, fx_on: null }),
    ]);

    await screen.findByText('Old dinner');

    await waitFor(() => {
      expect(vi.mocked(captureRatesOn)).toHaveBeenCalledWith('EUR', '2025-08-14');
    });
    await waitFor(() => {
      const values = lastWriteTo(db, 'expenses')?.values as Record<string, unknown>;
      expect(values?.fx_on).toBe('2025-08-14');
      // 2025's rate, not 2026's. Getting this wrong is the whole failure.
      expect((values?.fx as Record<string, number>).BRL).toBe(5.1);
    });
  });

  it('does not touch an expense that already has its own rate', async () => {
    mount([expenseRow({ label: 'Rent' })]);
    await screen.findByText('Rent');
    await waitFor(() => {
      expect(vi.mocked(rateBook)).toHaveBeenCalled();
    });
    expect(vi.mocked(captureRatesOn)).not.toHaveBeenCalled();
  });

  it('tries each expense once per visit, however many share a date', async () => {
    mount([
      expenseRow({ id: 'x', label: 'One', fx: null, fx_on: null }),
      expenseRow({ id: 'y', label: 'Two', fx: null, fx_on: null }),
    ]);

    await screen.findByText('Two');
    await waitFor(() => {
      expect(vi.mocked(captureRatesOn)).toHaveBeenCalledTimes(2);
    });
    // Each row is updated by the repair, which changes `rows`, which reruns
    // the effect. Without the guard that is an endless loop of writes.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(vi.mocked(captureRatesOn)).toHaveBeenCalledTimes(2);
  });
});

/**
 * "I added a 50/50 split and my number didn't go up, only hers did."
 *
 * A real report, and the arithmetic behind it was right: only one card was
 * charged, so only one contribution moved. What the page was missing is
 * that the same expense raised *both* of their shares — the number it had
 * always computed and only ever drawn as a one-pixel hairline.
 */
describe('the two halves of the same total', () => {
  it('moves one contribution and both shares when one of them pays', async () => {
    mount([
      expenseRow({ id: 'his', label: 'Camcaro', amount_cents: 10000, paid_by: 'partner_a' }),
      expenseRow({ id: 'hers', label: 'Abacaxi', amount_cents: 5000, paid_by: 'partner_b' }),
    ]);

    await screen.findByText('Abacaxi');

    // Whose spending it was: €75 each. This is the figure that moves for
    // both of them, and the one the page leads with.
    const share = (await screen.findByText(/what you’ve split together/i)).closest('div')!;
    await waitFor(() => {
      expect(within(share).getAllByText('€75.00')).toHaveLength(2);
    });

    // Who fronted the cash is still knowable — it is the working under the
    // nudge, which is the one place it was ever load-bearing.
    expect(
      await screen.findByText(/has put in .*€50\.00.* against .*€75\.00.* spent/),
    ).toBeInTheDocument();
  });

  it('shows one bar, not two that look alike and mean different things', async () => {
    mount([expenseRow({ label: 'Rent' })]);
    await screen.findByText('Rent');
    expect(await screen.findByText(/what you’ve split together/i)).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
    // The cash-flow percentages went with the second bar. "77.1% / 22.9%"
    // over two names is a scoreboard, and this page does not keep score.
    expect(screen.queryByText(/put the money in/i)).not.toBeInTheDocument();
  });

  it('says a custom split in money, not as a bare percentage', async () => {
    mount([
      expenseRow({
        label: 'Groceries',
        amount_cents: 10000,
        split_rule: 'custom_pct',
        partner_a_percent: 70,
      }),
    ]);

    const row = (await screen.findByText('Groceries')).closest('li')!;
    // "Léo 70%" made you do the arithmetic yourself to learn the only thing
    // you wanted, and the row already knew the amount.
    expect(within(row).getByText(/Léo €70\.00/)).toBeInTheDocument();
    expect(within(row).getByText(/€30\.00/)).toBeInTheDocument();
  });
});

/**
 * "I add €100 split fifty-fifty, the row says €50 each, and the summary
 * counts €100 to me and nothing to my partner."
 *
 * Every one of those observations was accurate. The row and the summary
 * were answering different questions and neither said which, and the
 * colour beside the row was answering a third.
 */
describe('a 50/50 expense, from the row up to the summary', () => {
  it('counts half to each of them in what each has spent', async () => {
    mount([
      expenseRow({ label: 'Camcaro', amount_cents: 10000, paid_by: 'partner_a' }),
    ]);

    const spent = (await screen.findByText(/what you’ve split together/i)).closest('div')!;
    await waitFor(() => {
      expect(within(spent).getAllByText('€50.00')).toHaveLength(2);
    });

    // And what is true of the cards — all €100 left his account — is still
    // on the page, in the working under the nudge.
    expect(
      screen.getByText(/has put in .*€0\.00.* against .*€50\.00.* spent/),
    ).toBeInTheDocument();
  });

  it('says the per-person figure on the row, without a percentage to decode', async () => {
    mount([expenseRow({ label: 'Camcaro', amount_cents: 10000 })]);
    const row = (await screen.findByText('Camcaro')).closest('li')!;
    expect(within(row).getByText('€50.00 each')).toBeInTheDocument();
  });

  it('draws a shared row in both colours, and a treat in one', async () => {
    mount([
      expenseRow({ id: 'shared', label: 'Camcaro', amount_cents: 10000, paid_by: 'partner_a' }),
      expenseRow({ id: 'gift', label: 'Flowers', split_rule: 'treat', paid_by: 'partner_a' }),
    ]);

    const shared = (await screen.findByText('Camcaro')).closest('li')!;
    const stripe = shared.querySelector('span.bg-jade > span.bg-cinnabar') as HTMLElement;
    // Half and half: the row is carried by both, and it looks like it.
    expect(stripe.style.height).toBe('50%');

    const gift = screen.getByText('Flowers').closest('li')!;
    const solid = gift.querySelector('span.bg-jade > span.bg-cinnabar') as HTMLElement;
    // A gift really is one-sided, so it stays solid in the giver's colour.
    expect(solid.style.height).toBe('100%');
    expect(within(gift).queryByText(/each/)).not.toBeInTheDocument();
  });
});

/**
 * The default, and the one rule that was missing.
 *
 * Reported as "you've made everything fifty-fifty". Everything *was*
 * fifty-fifty, because that was the default and there was no way to say an
 * expense was simply your own. Dividing is the deliberate act now, not the
 * accidental one.
 */
describe('logging something that is just yours', () => {
  it('opens on “just mine”, not on a division', async () => {
    const user = userEvent.setup();
    mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    const mine = await screen.findByRole('button', { name: /just mine/i });
    expect(mine).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /down the middle/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('writes it as one person’s own', async () => {
    const user = userEvent.setup();
    const { db } = mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText(/What for/i), 'Coffee');
    await user.type(screen.getByLabelText(/How much/i), '4,50');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const values = lastWriteTo(db, 'expenses')?.values as Record<string, unknown>;
      expect(values?.split_rule).toBe('mine');
      expect(values?.partner_a_percent).toBeNull();
    });
  });

  it('carries no per-person figure, because there is nothing to divide', async () => {
    mount([expenseRow({ label: 'Coffee', amount_cents: 450, split_rule: 'mine' })]);
    const row = (await screen.findByText('Coffee')).closest('li')!;
    expect(within(row).queryByText(/each/)).not.toBeInTheDocument();
  });

  it('counts to one of them and leaves nothing to even out', async () => {
    mount([
      expenseRow({ id: 'his', label: 'His', amount_cents: 10000, paid_by: 'partner_a', split_rule: 'mine' }),
      expenseRow({ id: 'hers', label: 'Hers', amount_cents: 10000, paid_by: 'partner_b', split_rule: 'mine' }),
    ]);

    await screen.findByText('Hers');

    // The thing that was missing: a personal expense reaches the person's
    // own total. €100 each, from two purchases that have nothing to do
    // with one another.
    const spent = (await screen.findByText(/what each of you has spent/i)).closest('div')!;
    await waitFor(() => {
      expect(within(spent).getAllByText('€100.00')).toHaveLength(2);
    });

    // Nothing was divided, so there is no pool to draw and no nudge to
    // make. Two people spending their own money are not out of balance.
    expect(screen.queryByText(/what you’ve split together/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/the next .* is on/i)).not.toBeInTheDocument();
  });

  /**
   * The reported case. €100 of his own tools beside €9.49 of shared
   * medicine she paid for read "Costanzo €104.74, 95.7%" and then, right
   * underneath, "the next €9.48 is on Costanzo" — telling the person who
   * had apparently spent almost everything to go and spend more.
   */
  it('keeps a large personal expense from swamping a small shared one', async () => {
    mount([
      expenseRow({ id: 'his', label: 'Tools', amount_cents: 10000, paid_by: 'partner_a', split_rule: 'mine' }),
      expenseRow({ id: 'med', label: 'Aspirin', amount_cents: 949, paid_by: 'partner_b', split_rule: '50_50' }),
    ]);

    await screen.findByText('Aspirin');
    const split = (await screen.findByText(/what you’ve split together/i)).closest('div')!;

    // The shared pool is €9.49 and falls near enough evenly, which is what
    // they agreed. His €100 of tools is named, and named apart.
    await waitFor(() => {
      expect(within(split).getByText('€4.74')).toBeInTheDocument();
    });
    expect(within(split).getByText('€4.75')).toBeInTheDocument();
    expect(within(split).getByText('€9.49 shared so far')).toBeInTheDocument();
    expect(within(split).queryByText('95.7%')).not.toBeInTheDocument();

    // And his €100 of tools is where it belongs: in his own total, said
    // plainly, with no percentage set against hers.
    const spent = screen.getByText(/what each of you has spent/i).closest('div')!;
    expect(within(spent).getByText('€104.74')).toBeInTheDocument();
    expect(within(spent).getByText(/€100 personal · €4\.74 split/)).toBeInTheDocument();
  });
});

/**
 * Who typed the row in.
 *
 * Dividing an expense assigns part of its cost to somebody who was not
 * there when the form was filled in. That is a legitimate thing to do —
 * it is the whole point of "one of you can log it for both" — and it is
 * also something the other person is entitled to see the author of.
 */
describe('authorship, where it changes what somebody is shown', () => {
  it('names the author when the row is attributed to the other one', async () => {
    mount([
      expenseRow({
        label: 'Dinner',
        paid_by: 'partner_b',
        split_rule: '50_50',
        created_by: HIM_ID,
      }),
    ]);

    const row = (await screen.findByText('Dinner')).closest('li')!;
    expect(within(row).getByText(/logged by Léo/i)).toBeInTheDocument();
  });

  it('stays quiet on the ordinary row, where you logged your own', async () => {
    mount([
      expenseRow({ label: 'Coffee', paid_by: 'partner_a', created_by: HIM_ID }),
    ]);

    const row = (await screen.findByText('Coffee')).closest('li')!;
    expect(within(row).queryByText(/logged by/i)).not.toBeInTheDocument();
  });

  it('says nothing at all rather than guessing, on a row with no author', async () => {
    mount([
      expenseRow({ label: 'Old one', paid_by: 'partner_b', created_by: null }),
    ]);

    const row = (await screen.findByText('Old one')).closest('li')!;
    expect(within(row).queryByText(/logged by/i)).not.toBeInTheDocument();
  });
});
