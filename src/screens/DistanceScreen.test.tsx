import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lastWriteTo, mountSignedIn } from '@/test/harness';
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

const { DistanceScreen } = await import('./DistanceScreen');

/**
 * Distance.
 *
 * One number, and three states around it. The one that has to be right is
 * the third: a reunion date that has gone by must not keep counting, and it
 * must not flip to a negative number either. "-4 days until you're together"
 * is the app being cruel by accident, on the page where that costs the most.
 */

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function mount(couple: Record<string, unknown> = {}) {
  return mountSignedIn(<DistanceScreen />, { couple, seed: () => {} });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('before a date is set', () => {
  it('asks for one rather than showing a zero', async () => {
    mount({ reunion_date: null });
    expect(await screen.findByText('No date set')).toBeInTheDocument();
    expect(screen.queryByText(/0 days/)).not.toBeInTheDocument();
  });
});

describe('counting down', () => {
  it('says how many days, and which day it is', async () => {
    mount({ reunion_date: daysFromNow(43) });
    expect(await screen.findByText('43 days')).toBeInTheDocument();
    expect(screen.getByText('Until you’re together')).toBeInTheDocument();
  });

  it('says it in the singular on the last day of waiting', async () => {
    mount({ reunion_date: daysFromNow(1) });
    expect(await screen.findByText('1 day')).toBeInTheDocument();
  });

  /** The only correct thing for this app to say on this day. */
  it('tells them to close the app when the day arrives', async () => {
    mount({ reunion_date: daysFromNow(0) });
    expect(await screen.findByText('Today’s the day')).toBeInTheDocument();
    expect(screen.getByText('Close the app.')).toBeInTheDocument();
  });

  /**
   * The failure this test exists for: counting past zero into negatives, so
   * the page tells somebody there are minus four days until they see each
   * other. It has to stop and ask for the next one.
   */
  it('stops counting once the date has gone, rather than going negative', async () => {
    mount({ reunion_date: daysFromNow(-4) });

    expect(await screen.findByText('That date has passed')).toBeInTheDocument();
    expect(screen.getByText('Set the next one when you know it.')).toBeInTheDocument();
    expect(screen.queryByText(/-\d+ days/)).not.toBeInTheDocument();
    expect(screen.queryByText('Until you’re together')).not.toBeInTheDocument();
  });
});

describe('the note for the meantime', () => {
  it('shows it when there is one', async () => {
    mount({ reunion_date: daysFromNow(10), reunion_note: 'Bring the good coffee.' });
    expect(await screen.findByText('Bring the good coffee.')).toBeInTheDocument();
  });

  it('shows no empty heading when there is not', async () => {
    mount({ reunion_date: daysFromNow(10), reunion_note: null });
    await screen.findByText('10 days');
    expect(screen.queryByText('Notes for the meantime')).not.toBeInTheDocument();
  });
});

describe('setting it', () => {
  it('saves the date and the note together', async () => {
    const user = userEvent.setup();
    const { db } = mount({ reunion_date: null });

    // Two of them: the page header's, and the empty state's.
    await user.click((await screen.findAllByRole('button', { name: 'Add' }))[0]!);
    await user.type(
      await screen.findByLabelText(/Next time you see each other/),
      '2026-12-24',
    );
    await user.type(screen.getByLabelText(/Notes for the meantime/), 'Bring the good coffee.');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'couples')?.values).toMatchObject({
        reunion_date: '2026-12-24',
        reunion_note: 'Bring the good coffee.',
      });
    });
  });

  it('clears the date back to nothing rather than storing an empty string', async () => {
    const user = userEvent.setup();
    const { db } = mount({ reunion_date: daysFromNow(10) });

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(await screen.findByLabelText(/Next time you see each other/));
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const values = lastWriteTo(db, 'couples')?.values as Record<string, unknown>;
      expect(values.reunion_date).toBeNull();
    });
  });
});
