import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSignedIn } from '@/test/harness';
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

const { CalendarScreen } = await import('./CalendarScreen');

function mount() {
  return mountSignedIn(<CalendarScreen />, {
    seed: (db) => {
      db.seed('plans', []);
      db.seed('important_dates', []);
      db.seed('trips', []);
      db.seed('intimacy_entries', []);
    },
  });
}

/**
 * The month the app thinks it is, spelled the way the header spells it.
 *
 * Anchored, because the selected-day heading right below is "13 August
 * 2026" and an unanchored /August 2026/ matches both of them.
 */
function monthHeading(offsetMonths = 0): RegExp {
  const now = new Date();
  const at = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const label = at.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return new RegExp(`^${label}$`, 'i');
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

/**
 * Getting back.
 *
 * The month had two arrows and nothing else. That is fine until somebody
 * steps forward to check an anniversary three years out and has to press
 * back thirty-six times to return — and the copy for the way home had been
 * written and wired to nothing.
 */
describe('finding your way back to today', () => {
  it('opens on the current month, with no way home offered', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: monthHeading() })).toBeInTheDocument();
    // Nothing to escape from yet, and a permanent button for a thing you
    // rarely need is furniture.
    expect(screen.queryByRole('button', { name: /back to today/i })).not.toBeInTheDocument();
  });

  it('offers the way home once you have wandered off', async () => {
    const user = userEvent.setup();
    mount();

    await screen.findByRole('heading', { name: monthHeading() });
    await user.click(screen.getByRole('button', { name: /next month/i }));

    expect(await screen.findByRole('heading', { name: monthHeading(1) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to today/i })).toBeInTheDocument();
  });

  it('returns in one press, however far you went', async () => {
    const user = userEvent.setup();
    mount();

    await screen.findByRole('heading', { name: monthHeading() });
    const next = screen.getByRole('button', { name: /next month/i });
    for (let i = 0; i < 14; i += 1) await user.click(next);
    expect(await screen.findByRole('heading', { name: monthHeading(14) })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back to today/i }));

    expect(await screen.findByRole('heading', { name: monthHeading() })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to today/i })).not.toBeInTheDocument();
  });

  it('works backwards too', async () => {
    const user = userEvent.setup();
    mount();

    await screen.findByRole('heading', { name: monthHeading() });
    await user.click(screen.getByRole('button', { name: /previous month/i }));
    expect(await screen.findByRole('heading', { name: monthHeading(-1) })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back to today/i }));
    expect(await screen.findByRole('heading', { name: monthHeading() })).toBeInTheDocument();
  });

  it('brings the selected day back with it, not just the month', async () => {
    const user = userEvent.setup();
    mount();

    await screen.findByRole('heading', { name: monthHeading() });
    const todayLabel = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    expect(screen.getByRole('heading', { name: todayLabel })).toBeInTheDocument();

    // Wander off, land on a day in another month, then come home. Leaving
    // the selection behind would mean the panel underneath still described
    // a day nobody was looking at.
    await user.click(screen.getByRole('button', { name: /next month/i }));
    await user.click(screen.getByRole('button', { name: /back to today/i }));

    expect(await screen.findByRole('heading', { name: todayLabel })).toBeInTheDocument();
  });
});
