import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, HER_ID, HIM_ID, mountSignedIn } from '@/test/harness';
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

const { OnThisDay } = await import('./OnThisDay');

/**
 * This time last year.
 *
 * The one section in the app that comes to you rather than waiting to be
 * visited, which makes its restraints the thing worth testing. It says
 * nothing on most days. It never turns six months into an occasion. And it
 * never opens a letter early — a letter sealed until next year is not a
 * memory yet, however old it is.
 */

/** The same day of the year, `years` back. */
function yearsAgoToday(years: number, dayShift = 0): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  date.setDate(date.getDate() + dayShift);
  return date.toISOString().slice(0, 10);
}

function memoryRow(over: Record<string, unknown> = {}) {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    title: 'The night it rained in Porto',
    date: yearsAgoToday(1),
    note: 'We ran for the tram and missed it, twice.',
    created_by: HIM_ID,
    created_at: '2025-04-02T00:00:00.000Z',
    updated_at: '2025-04-02T00:00:00.000Z',
    ...over,
  };
}

function letterRow(over: Record<string, unknown> = {}) {
  return {
    id: `l-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    kind: 'small',
    body: 'You fell asleep on the train again.',
    from_profile: HIM_ID,
    to_profile: HER_ID,
    open_on: null,
    read_at: null,
    created_at: `${yearsAgoToday(2)}T09:00:00.000Z`,
    updated_at: `${yearsAgoToday(2)}T09:00:00.000Z`,
    ...over,
  };
}

function mount(seed: Record<string, Record<string, unknown>[]> = {}) {
  return mountSignedIn(<OnThisDay />, {
    seed: (db) => {
      db.seed('memories', seed.memories ?? []);
      db.seed('letters', seed.letters ?? []);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('when it says nothing', () => {
  /** A section that always has something in it is one nobody believes. */
  it('draws nothing at all on an ordinary day', async () => {
    const { view } = mount({ memories: [memoryRow({ date: yearsAgoToday(1, 120) })] });
    await Promise.resolve();
    expect(view.container).toBeEmptyDOMElement();
  });

  it('draws nothing for a couple with no history yet', async () => {
    const { view } = mount();
    await Promise.resolve();
    expect(view.container).toBeEmptyDOMElement();
  });

  /**
   * Six months ago is not an anniversary of anything. Saying it is would be
   * the app manufacturing an occasion — the habit that turns a keepsake into
   * a slot machine.
   */
  it('makes no occasion out of something from earlier this year', async () => {
    const { view } = mount({ memories: [memoryRow({ date: yearsAgoToday(0, -180) })] });
    await Promise.resolve();
    expect(view.container).toBeEmptyDOMElement();
  });
});

describe('when there is something', () => {
  it('brings back a memory from a year ago today, in its own words', async () => {
    mount({ memories: [memoryRow()] });

    expect(await screen.findByText('This time last year')).toBeInTheDocument();
    expect(screen.getByText('The night it rained in Porto')).toBeInTheDocument();
    // Their words, cut but never rewritten.
    expect(screen.getByText('We ran for the tram and missed it, twice.')).toBeInTheDocument();
    expect(screen.getByText(/a year ago today/)).toBeInTheDocument();
  });

  it('counts the years when there are more of them', async () => {
    mount({ memories: [memoryRow({ date: yearsAgoToday(4) })] });
    expect(await screen.findByText(/4 years ago today/)).toBeInTheDocument();
  });

  /**
   * A day or two either side still counts, but the app must not claim a
   * date it does not have.
   */
  it('says "around now" when it is a day or two off', async () => {
    mount({ memories: [memoryRow({ date: yearsAgoToday(1, 2) })] });
    expect(await screen.findByText(/a year ago, around now/)).toBeInTheDocument();
  });

  it('brings back letters too, and links each one to its page', async () => {
    mount({ letters: [letterRow()] });

    const link = (await screen.findByText('You fell asleep on the train again.')).closest('a')!;
    expect(link).toHaveAttribute('href', '/letters');
  });

  it('shows at most three, so it stays a glance', async () => {
    mount({
      memories: [
        memoryRow({ date: yearsAgoToday(1) }),
        memoryRow({ date: yearsAgoToday(2) }),
        memoryRow({ date: yearsAgoToday(3) }),
        memoryRow({ date: yearsAgoToday(4) }),
        memoryRow({ date: yearsAgoToday(5) }),
      ],
    });

    await screen.findByText('This time last year');
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
});

describe('what it will not open', () => {
  /**
   * A letter written to be opened next year is not a memory yet, whatever
   * its date. Surfacing it here would be the app breaking a promise its
   * author made on purpose.
   */
  it('never surfaces a letter that is still sealed', async () => {
    const { view } = mount({
      letters: [letterRow({ body: 'For our tenth.', open_on: '2035-06-12' })],
    });
    await Promise.resolve();
    expect(view.container).toBeEmptyDOMElement();
  });
});
