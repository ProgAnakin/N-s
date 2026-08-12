import { screen, waitFor } from '@testing-library/react';
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

const { TogetherScreen } = await import('./TogetherScreen');

/**
 * The together log.
 *
 * Two rules, and both of them are about restraint rather than about
 * features. It stays off until somebody asks for it — a page like this
 * appearing uninvited is an intrusion, not a discovery. And it never sets a
 * target: a count of intimacy is the easiest number in the world to turn
 * into pressure, and pressure is the one thing guaranteed to make it worse.
 *
 * The second rule is the one a well-meaning copy change would break, so it
 * is asserted directly against the rendered page.
 */

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function entryRow(over: Record<string, unknown> = {}) {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    date: daysFromNow(-2),
    kind: 'sex',
    place: null,
    note: null,
    created_by: HIM_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function mount(rows: Record<string, unknown>[] = [], intimacyMode = true) {
  return mountSignedIn(<TogetherScreen />, {
    couple: { intimacy_mode: intimacyMode },
    seed: (db) => {
      db.seed('intimacy_entries', rows);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('until it is asked for', () => {
  it('is a closed door, not a page with an empty log on it', async () => {
    mount([], false);
    expect(await screen.findByText('Not switched on')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/i })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  /**
   * Turning it off hides the page. It must not read the table either — a
   * feature somebody switched off should not be quietly still running.
   */
  it('does not read the table at all while it is off', async () => {
    const { db } = mount([entryRow()], false);
    await screen.findByText('Not switched on');
    expect(db.selects.map((select) => select.table)).not.toContain('intimacy_entries');
  });
});

describe('once it is on', () => {
  it('says who can read it, before anything else', async () => {
    mount();
    expect(await screen.findByText(/Only the two of you can read this/)).toBeInTheDocument();
  });

  it('offers a place to start when there is nothing logged', async () => {
    mount();
    expect(await screen.findByText('Nothing logged yet')).toBeInTheDocument();
  });
});

describe('what the numbers say, and what they refuse to say', () => {
  it('counts what is there, plainly', async () => {
    mount([
      entryRow({ date: daysFromNow(-1) }),
      entryRow({ date: daysFromNow(-5) }),
      entryRow({ date: daysFromNow(-9) }),
    ]);

    await screen.findByText('All time');
    // Three all time, and the last one was yesterday.
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });

  /**
   * The rule the whole page is built around. No goal, no streak, no
   * comparison to last month, no "below average" — this is the assertion
   * that catches a well-meaning copy change turning a memory into a target.
   */
  it('sets no target and keeps no streak', async () => {
    mount([entryRow(), entryRow({ date: daysFromNow(-20) })]);
    await screen.findByText('All time');

    const page = document.body.textContent ?? '';
    for (const word of [/\bgoal\b/i, /\bstreak\b/i, /\baverage\b/i, /\bshould\b/i]) {
      expect(page).not.toMatch(word);
    }
    // The one mention of a target is the page saying it does not keep one.
    expect(page).toContain('not because anything here is a target');
  });

  /**
   * Nor may it compare the two of them. This page has no per-person figure
   * at all, and that is deliberate: there is no version of "who initiated
   * more" that makes a couple happier.
   */
  it('says nothing about which of them did anything', async () => {
    mount([entryRow(), entryRow({ date: daysFromNow(-20) })]);
    await screen.findByText('All time');
    const page = document.body.textContent ?? '';
    expect(page).not.toContain('Léo');
    expect(page).not.toContain('Yan');
  });

  it('groups by what and by where, and hides the where when nobody said', async () => {
    mount([entryRow({ kind: 'kiss' }), entryRow({ kind: 'sex', date: daysFromNow(-4) })]);
    await screen.findByText('What, mostly');
    expect(screen.queryByText('Where, mostly')).not.toBeInTheDocument();
  });

  it('lists the places once there are any', async () => {
    mount([
      entryRow({ place: 'that hotel in Lisbon' }),
      entryRow({ place: 'that hotel in Lisbon', date: daysFromNow(-8) }),
      entryRow({ place: 'the kitchen', date: daysFromNow(-12) }),
    ]);

    await screen.findByText('Where, mostly');
    // Twice each: once in the summary, once on the row it came from.
    expect(screen.getAllByText('that hotel in Lisbon')).toHaveLength(3);
    expect(screen.getAllByText('the kitchen')).toHaveLength(2);
  });

  it('draws no month chart until there is more than one month to compare', async () => {
    mount([entryRow()]);
    await screen.findByText('All time');
    expect(screen.queryByText('Month by month')).not.toBeInTheDocument();
  });

  it('draws it once there is', async () => {
    mount([entryRow(), entryRow({ date: daysFromNow(-70) })]);
    expect(await screen.findByText('Month by month')).toBeInTheDocument();
  });
});

describe('adding one', () => {
  it('saves the date, the kind, and nulls for what was left blank', async () => {
    const user = userEvent.setup();
    const { db } = mount([entryRow()]);

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.selectOptions(await screen.findByLabelText('What'), 'massage');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'intimacy_entries')?.values).toMatchObject({
        kind: 'massage',
        place: null,
        note: null,
        created_by: HIM_ID,
      });
    });
  });

  it('keeps a place when one was given', async () => {
    const user = userEvent.setup();
    const { db } = mount([entryRow()]);

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText(/Where/), 'the kitchen');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'intimacy_entries')?.values).toMatchObject({ place: 'the kitchen' });
    });
  });

  it('opens the editor already filled in', async () => {
    const user = userEvent.setup();
    mount([entryRow({ kind: 'kiss', place: 'the kitchen', note: 'raining' })]);

    await user.click(await screen.findByRole('button', { name: /Edit/i }));
    expect(await screen.findByLabelText('What')).toHaveValue('kiss');
    expect(screen.getByLabelText(/Where/)).toHaveValue('the kitchen');
    expect(screen.getByLabelText(/Anything to remember/)).toHaveValue('raining');
  });
});
