import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, HIM_ID, mountSignedIn } from '@/test/harness';
import { resetWriteFailure } from '@/data/write-status';
import { toISODate, today } from '@/lib/calendar';

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

const { HomeScreen } = await import('./HomeScreen');

/**
 * The front page.
 *
 * It reads seven tables to answer one question — "is there anything I should
 * know right now?" — and it was, until this file, the largest untested
 * surface in the app. That is a strange place for a blind spot: it is the
 * screen every person sees first and most often, and every one of those
 * seven reads is a chance to render nothing at all.
 *
 * What is worth asserting here is not the layout. It is that the page joins
 * things up: a date in the vault becomes a countdown, an unpacked trip
 * becomes a nudge, a partner who hasn't joined yet becomes an invite code
 * rather than a half-built page.
 */

const TODAY = today();

/** An ISO date `days` from now, so nothing here rots when the clock moves. */
function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateRow(over: Record<string, unknown> = {}) {
  return {
    id: `d-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    label: 'Her birthday',
    date: daysFromNow(9),
    type: 'birthday',
    recurring: true,
    note: null,
    created_by: HIM_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function expenseRow(over: Record<string, unknown> = {}) {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    label: 'Dinner',
    amount_cents: 10_000,
    currency: 'EUR',
    paid_by: 'partner_a',
    date: toISODate(TODAY),
    category: 'food',
    split_rule: '50_50',
    partner_a_percent: null,
    trip_id: null,
    note: null,
    fx: { EUR: 1, BRL: 6.2, CNY: 7.9, USD: 1.08 },
    fx_on: toISODate(TODAY),
    edited_at: null,
    created_by: HIM_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function mountHome(
  seed: Record<string, Record<string, unknown>[]> = {},
  options: Parameters<typeof mountSignedIn>[1] = {},
) {
  return mountSignedIn(<HomeScreen />, {
    ...options,
    seed: (db) => {
      for (const table of [
        'important_dates',
        'remember_facts',
        'gift_ideas',
        'trips',
        'trip_items',
        'expenses',
      ]) {
        db.seed(table, seed[table] ?? []);
      }
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('the counter at the top', () => {
  it('counts the days since the day they started', async () => {
    mountHome({}, { couple: { anniversary_date: '2023-06-12' } });
    // Whatever today is, it is a lot of days and it says so in one line.
    expect(await screen.findByText(/\d[\d,. ]* days together/)).toBeInTheDocument();
    expect(screen.getByText(/since/)).toBeInTheDocument();
  });

  /**
   * A couple who has not filled in their anniversary must not see "NaN days
   * together" or a blank headline. They get their name and a way to fix it.
   */
  it('asks for the date instead of counting from nothing', async () => {
    mountHome({}, { couple: { anniversary_date: null, couple_name: 'Léo & Yan' } });

    expect(await screen.findByText('Léo & Yan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add the day you started/i })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(screen.queryByText(/days together/)).not.toBeInTheDocument();
  });

  it('greets whoever is reading, by name', async () => {
    mountHome({}, { profile: { display_name: 'Léo' } });
    expect(await screen.findByText(/Good (morning|afternoon|evening), Léo/)).toBeInTheDocument();
  });
});

describe('before the second person joins', () => {
  /**
   * The single most consequential state on this page. One half of a couple
   * app is not a couple app, and the only way out of it is the invite code —
   * so it has to be the thing they cannot miss.
   */
  it('puts the invite code in front of them', async () => {
    mountHome({}, { partner: null, couple: { invite_code: 'ABC123' } });
    expect(await screen.findByText('ABC123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });

  it('says nothing about invites once they have joined', async () => {
    mountHome();
    await screen.findByText('Quick add');
    expect(screen.queryByText('ABC123')).not.toBeInTheDocument();
  });
});

/** The section, not the whole page — a date near enough also becomes a reminder. */
function nextUpSection() {
  return within(screen.getByLabelText('Next up', { selector: 'section' }));
}

describe('next up', () => {
  it('shows the nearest date, with how long there is', async () => {
    mountHome({ important_dates: [dateRow({ label: 'Her birthday', date: daysFromNow(9) })] });
    await screen.findByText('Next up');

    const next = nextUpSection().getByRole('link', { name: /Her birthday/ });
    expect(next).toHaveAttribute('href', '/dates');
    expect(within(next).getByText(/in 9 days/i)).toBeInTheDocument();
  });

  it('picks the soonest when several are coming', async () => {
    mountHome({
      important_dates: [
        dateRow({ label: 'Far off', date: daysFromNow(200), type: 'other' }),
        dateRow({ label: 'This week', date: daysFromNow(3), type: 'other' }),
      ],
    });
    await screen.findByText('Next up');

    const section = nextUpSection();
    expect(section.getByRole('link', { name: /This week/ })).toBeInTheDocument();
    expect(section.queryByRole('link', { name: /Far off/ })).not.toBeInTheDocument();
  });

  it('offers somewhere to start when there is nothing at all', async () => {
    mountHome();
    expect(await screen.findByText(/Nothing on the horizon/)).toBeInTheDocument();
  });
});

describe('worth knowing', () => {
  /**
   * The loop the app exists for: something written down months ago comes
   * back at the moment it is useful, in the words it was written in.
   */
  it('brings a note back on the day it asked to be brought back', async () => {
    mountHome({
      remember_facts: [
        {
          id: 'f1',
          couple_id: COUPLE_ID,
          author_id: HIM_ID,
          category: 'health',
          question: 'When is the exam?',
          answer: 'Thursday, and she is dreading it.',
          visibility: 'shared',
          remind_on: daysFromNow(2),
          question_id: null,
          answer_kind: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(await screen.findByText(/Worth knowing/)).toBeInTheDocument();
    expect(screen.getByText(/When is the exam\?/)).toBeInTheDocument();
  });

  it('nudges about a trip with things still unpacked', async () => {
    mountHome({
      trips: [
        {
          id: 't1',
          couple_id: COUPLE_ID,
          destination: 'Lisbon',
          start_date: daysFromNow(5),
          end_date: daysFromNow(12),
          note: null,
          created_by: HIM_ID,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      trip_items: [
        {
          id: 'i1',
          couple_id: COUPLE_ID,
          trip_id: 't1',
          label: 'Passport',
          done: false,
          sort_order: 0,
          assigned_to: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const nudge = await screen.findByRole('link', { name: /Lisbon/ });
    expect(nudge).toHaveAttribute('href', '/trips');
  });

  /**
   * An empty section with a heading is worse than no section: it reads as
   * something that failed to load.
   */
  it('says nothing at all when there is nothing to say', async () => {
    // No anniversary either — a long-running couple generates milestones on
    // their own, which is the point of them.
    mountHome({}, { couple: { anniversary_date: null } });
    // Waiting for the foot of the page, not the first thing to appear:
    // reminders come from four separate reads, and asserting before those
    // have landed would pass whether or not the rule holds.
    await screen.findByText('Quick add');
    expect(screen.queryByText('Worth knowing')).not.toBeInTheDocument();
  });
});

describe('the balance on the front page', () => {
  it('shows how it has been shared, without a word about debt', async () => {
    mountHome({
      expenses: [
        expenseRow({ paid_by: 'partner_a', amount_cents: 10_000 }),
        expenseRow({ paid_by: 'partner_b', amount_cents: 10_000 }),
      ],
    });

    await screen.findByText(/€200(\.00)? logged so far/);
    // The rule the whole money model is built on, asserted where a
    // careless copy change would land first.
    expect(document.body.textContent).not.toMatch(/\bowes?\b/i);
    expect(document.body.textContent).not.toMatch(/\bdebt/i);
  });

  it('links through to the whole history', async () => {
    mountHome({ expenses: [expenseRow()] });
    await screen.findByText(/logged so far/);
    const section = screen.getByLabelText(/Spending/i, { selector: 'section' });
    expect(within(section).getByRole('link')).toHaveAttribute('href', '/spending');
  });
});

describe('quick add', () => {
  it('names the partner in the one that is about them', async () => {
    mountHome({}, { partner: { display_name: 'Yan' } });
    const link = await screen.findByRole('link', { name: /Something Yan said/ });
    expect(link).toHaveAttribute('href', '/vault');
  });

  it('offers the four things worth adding in a hurry', async () => {
    mountHome();
    await screen.findByText(/Quick add/);
    for (const [name, href] of [
      [/A memory/, '/memories'],
      [/An expense/, '/spending'],
      [/A gift idea/, '/gifts'],
    ] as const) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });
});

describe('when a table comes back empty', () => {
  /**
   * Seven reads, any of which can return nothing. The page must still be a
   * page — this is the test that would have caught a crash on a brand-new
   * couple's very first visit.
   */
  it('still renders every section with no data anywhere', async () => {
    mountHome({}, { couple: { anniversary_date: '2023-06-12' } });

    // The header draws immediately; the body waits on the reads, so each of
    // these has to be awaited rather than checked the instant the first
    // one lands.
    expect(await screen.findByText(/days together/)).toBeInTheDocument();
    expect(await screen.findByText(/Nothing on the horizon/)).toBeInTheDocument();
    expect(await screen.findByText('Quick add')).toBeInTheDocument();
  });
});
