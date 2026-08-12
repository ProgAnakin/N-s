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

const { DatesScreen } = await import('./DatesScreen');

/**
 * Dates.
 *
 * The distinction the whole page turns on: a birthday comes around again, a
 * first-time milestone does not. Get that wrong and either a birthday
 * quietly falls off the list the day after it happens, or "the day we moved
 * in" starts announcing itself every year like an anniversary nobody agreed
 * to. Both are the same one-line mistake, and neither is visible until the
 * date passes.
 */

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function yearsAgo(years: number, monthOffsetDays = 0): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  date.setDate(date.getDate() + monthOffsetDays);
  return date.toISOString().slice(0, 10);
}

function dateRow(over: Record<string, unknown> = {}) {
  return {
    id: `d-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    label: 'Their birthday',
    date: daysFromNow(30),
    type: 'birthday',
    recurring: true,
    note: null,
    created_by: HIM_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function mount(rows: Record<string, unknown>[] = []) {
  return mountSignedIn(<DatesScreen />, {
    seed: (db) => {
      db.seed('important_dates', rows);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('with nothing in it', () => {
  it('names the first three worth adding', async () => {
    mount();
    expect(await screen.findByText('No dates yet')).toBeInTheDocument();
    expect(screen.getByText(/Their birthday is the one to start with/)).toBeInTheDocument();
  });
});

describe('what comes around again, and what does not', () => {
  /**
   * A recurring date that has already been this year must reappear as next
   * year's, not drop off the page.
   */
  it('rolls a birthday forward to its next occurrence', async () => {
    mount([dateRow({ label: 'Their birthday', date: yearsAgo(30, -10), recurring: true })]);

    await screen.findByText('Coming up');
    const coming = screen.getByText('Coming up').closest('section')!;
    expect(within(coming).getByText('Their birthday')).toBeInTheDocument();
  });

  it('leaves a one-off in the past where it belongs', async () => {
    mount([dateRow({ label: 'The day we moved in', date: daysFromNow(-40), recurring: false, type: 'other' })]);

    await screen.findByText('Already happened');
    const past = screen.getByText('Already happened').closest('section')!;
    expect(within(past).getByText('The day we moved in')).toBeInTheDocument();
    expect(screen.queryByText('Coming up')).not.toBeInTheDocument();
  });

  it('shows no heading for a section with nothing in it', async () => {
    mount([dateRow({ date: daysFromNow(30) })]);
    await screen.findByText('Coming up');
    expect(screen.queryByText('Already happened')).not.toBeInTheDocument();
  });
});

describe('what a date says about itself', () => {
  it('counts down to the ones that are coming', async () => {
    mount([dateRow({ label: 'Their birthday', date: daysFromNow(9), recurring: false })]);
    await screen.findByText('Their birthday');
    expect(screen.getByText(/in 9 days/i)).toBeInTheDocument();
  });

  /**
   * "turning 31" is the whole reason to open this page a week early. It
   * needs a recurring birthday with a real year behind it.
   */
  it('says which birthday it will be', async () => {
    mount([dateRow({ label: 'Their birthday', date: yearsAgo(30, 10), type: 'birthday', recurring: true })]);
    await screen.findByText('Their birthday');
    expect(screen.getByText(/turning 30/)).toBeInTheDocument();
  });
});

describe('adding one', () => {
  it('saves what was typed', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText('What is it?'), 'The day we met');
    const when = screen.getByLabelText('When');
    await user.clear(when);
    await user.type(when, '2023-02-14');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'important_dates')?.values).toMatchObject({
        label: 'The day we met',
        date: '2023-02-14',
      });
    });
  });

  it('will not save one with no date on it', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText('What is it?'), 'Something');
    const when = screen.getByLabelText('When');
    await user.clear(when);
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(db.writes).toHaveLength(0);
  });

  /**
   * A new date starts as recurring, which is right for the common case —
   * most of what a couple adds here is a birthday. Turning it off has to
   * actually reach the row, or "the day we moved in" comes back every year.
   */
  it('carries "comes around again" through to the row when it is turned off', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText('What is it?'), 'Moving day');
    await user.type(screen.getByLabelText('When'), '2025-03-08');
    await user.click(screen.getByLabelText(/Comes around again/));
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'important_dates')?.values).toMatchObject({
        label: 'Moving day',
        recurring: false,
      });
    });
  });

  it('opens the editor already filled in', async () => {
    const user = userEvent.setup();
    mount([dateRow({ label: 'Their birthday', date: '2026-11-04', type: 'birthday' })]);

    await user.click(await screen.findByRole('button', { name: /Edit/i }));
    expect(await screen.findByLabelText('What is it?')).toHaveValue('Their birthday');
    expect(screen.getByLabelText('When')).toHaveValue('2026-11-04');
  });
});
