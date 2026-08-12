import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, lastWriteTo, mountSignedIn } from '@/test/harness';
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

const { CultureScreen } = await import('./CultureScreen');

/**
 * Culture.
 *
 * The rules nobody writes down, written down. What matters on this page is
 * the "avoid" category: it exists so that somebody finds out about the clock
 * before they buy one, not afterwards — so it is marked differently from
 * every other kind, and a filter that hid it would be worse than no filter.
 */

function noteRow(over: Record<string, unknown> = {}) {
  return {
    id: `c-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    title: 'Never give a clock as a gift',
    note: '送钟 sounds like attending a funeral.',
    category: 'unlucky',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function mount(rows: Record<string, unknown>[] = []) {
  return mountSignedIn(<CultureScreen />, {
    seed: (db) => {
      db.seed('culture_notes', rows);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('with nothing written down', () => {
  it('says what the page is for rather than showing an empty filter bar', async () => {
    mount();
    expect(await screen.findByText(/No.*yet|Nothing/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
  });
});

describe('the notes', () => {
  it('shows the rule and the reason, because the reason is what makes it stick', async () => {
    mount([noteRow()]);
    expect(await screen.findByText('Never give a clock as a gift')).toBeInTheDocument();
    expect(screen.getByText(/sounds like attending a funeral/)).toBeInTheDocument();
  });

  it('marks each one with the kind it is', async () => {
    mount([noteRow({ category: 'unlucky' }), noteRow({ category: 'food', title: 'Fish on new year' })]);
    await screen.findByText('Fish on new year');
    // Twice each: once as the chip that filters, once as the tag on the card.
    expect(screen.getAllByText('Avoid').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Food').length).toBeGreaterThan(1);
  });
});

describe('filtering', () => {
  it('narrows to one kind and back again', async () => {
    const user = userEvent.setup();
    mount([
      noteRow({ category: 'unlucky', title: 'Never give a clock' }),
      noteRow({ category: 'food', title: 'Fish on new year' }),
    ]);

    await screen.findByText('Never give a clock');
    await user.click(screen.getByRole('button', { name: 'Food' }));
    expect(screen.queryByText('Never give a clock')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Never give a clock')).toBeInTheDocument();
  });

  /**
   * A filter that matches nothing must say so. Falling back to the "nothing
   * written down yet" copy would tell somebody their notes were gone.
   */
  it('says the filter found nothing, not that the page is empty', async () => {
    const user = userEvent.setup();
    mount([noteRow({ category: 'unlucky', title: 'Never give a clock' })]);

    await screen.findByText('Never give a clock');
    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(screen.queryByText(/Start writing them down|first one/i)).not.toBeInTheDocument();
    expect(screen.getByText('Nothing matched that.')).toBeInTheDocument();
  });
});

describe('writing one down', () => {
  it('saves the rule, the reason and the kind', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText('What is it?'), 'Never stick chopsticks upright');
    await user.type(screen.getByLabelText(/Why it matters/), 'It looks like incense at a funeral.');
    await user.selectOptions(screen.getByLabelText(/Kind|Category/i), 'etiquette');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'culture_notes')?.values).toMatchObject({
        title: 'Never stick chopsticks upright',
        note: 'It looks like incense at a funeral.',
        category: 'etiquette',
      });
    });
  });

  it('will not save one with no rule on it', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await screen.findByLabelText('What is it?');
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
    expect(db.writes).toHaveLength(0);
  });

  it('opens the editor already filled in', async () => {
    const user = userEvent.setup();
    mount([noteRow()]);

    await user.click(await screen.findByRole('button', { name: /Edit/i }));
    expect(await screen.findByLabelText('What is it?')).toHaveValue('Never give a clock as a gift');
  });
});
