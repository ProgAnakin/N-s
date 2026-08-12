import { screen, waitFor, within } from '@testing-library/react';
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

const { FamilyScreen } = await import('./FamilyScreen');

/**
 * Family.
 *
 * Remembering who is who in somebody's family is not trivia, and the page is
 * built around that: two little trees, theirs first, because the whole
 * reason to open this page is to not embarrass yourself about their side.
 *
 * The one piece of arithmetic is the age, which may be given as a number or
 * derived from a birthday — and the given number has to win, because a
 * person who typed 71 knows better than a birthday somebody guessed at.
 */

function memberRow(over: Record<string, unknown> = {}) {
  return {
    id: `f-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    belongs_to: 'partner_b',
    name: 'Mei',
    relation: 'Mother',
    age: null,
    birthday: null,
    notes: null,
    sensitive: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function mount(rows: Record<string, unknown>[] = []) {
  return mountSignedIn(<FamilyScreen />, {
    seed: (db) => {
      db.seed('family_members', rows);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('with nobody added', () => {
  it('says where to start rather than showing two empty trees', async () => {
    mount();
    expect(await screen.findByText('No one added yet')).toBeInTheDocument();
    expect(screen.getByText(/Start with their mother and father/)).toBeInTheDocument();
  });
});

describe('the two sides', () => {
  /**
   * Theirs above mine. The reason to open this page is almost never to look
   * up your own mother's name.
   */
  it('puts the partner’s family first', async () => {
    mount([
      memberRow({ belongs_to: 'partner_a', name: 'Rui' }),
      memberRow({ belongs_to: 'partner_b', name: 'Mei' }),
    ]);

    await screen.findByText('Mei');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual(['Yan', 'Léo']);
  });

  it('files each person under the side they belong to', async () => {
    mount([
      memberRow({ belongs_to: 'partner_a', name: 'Rui', relation: 'Father' }),
      memberRow({ belongs_to: 'partner_b', name: 'Mei', relation: 'Mother' }),
    ]);

    await screen.findByText('Mei');
    const theirs = screen.getByRole('heading', { name: 'Yan', level: 2 }).closest('section')!;
    expect(within(theirs).getByText('Mei')).toBeInTheDocument();
    expect(within(theirs).queryByText('Rui')).not.toBeInTheDocument();
  });

  it('draws no tree for a side with nobody on it', async () => {
    mount([memberRow({ belongs_to: 'partner_b', name: 'Mei' })]);
    await screen.findByText('Mei');
    expect(screen.queryByRole('heading', { name: 'Léo', level: 2 })).not.toBeInTheDocument();
  });
});

describe('the age', () => {
  it('works it out from a birthday when no number was given', async () => {
    const bornFortyYearsAgo = new Date();
    bornFortyYearsAgo.setFullYear(bornFortyYearsAgo.getFullYear() - 40);
    bornFortyYearsAgo.setDate(bornFortyYearsAgo.getDate() - 1);

    mount([
      memberRow({ name: 'Mei', age: null, birthday: bornFortyYearsAgo.toISOString().slice(0, 10) }),
    ]);

    await screen.findByText('Mei');
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  /** Somebody who typed 71 knows better than a birthday somebody guessed at. */
  it('prefers the number a person actually typed', async () => {
    mount([memberRow({ name: 'Mei', age: 71, birthday: '1990-01-01' })]);
    await screen.findByText('Mei');
    expect(screen.getByText('71')).toBeInTheDocument();
    expect(screen.queryByText(/^3\d$/)).not.toBeInTheDocument();
  });

  it('shows nothing at all rather than a zero', async () => {
    mount([memberRow({ name: 'Mei', age: null, birthday: null })]);
    await screen.findByText('Mei');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});

describe('handle with care', () => {
  /**
   * The point of the flag: a person you have to be thoughtful about should
   * be marked where you will see it before you speak, not in a note you
   * have to open.
   */
  it('marks the person on the card itself', async () => {
    mount([memberRow({ name: 'Mei', sensitive: true })]);
    await screen.findByText('Mei');
    expect(screen.getByText('Handle with care')).toBeInTheDocument();
  });

  it('says nothing about anybody who is not flagged', async () => {
    mount([memberRow({ name: 'Mei', sensitive: false })]);
    await screen.findByText('Mei');
    expect(screen.queryByText('Handle with care')).not.toBeInTheDocument();
  });
});

describe('adding somebody', () => {
  it('starts them on the side whose button was pressed', async () => {
    const user = userEvent.setup();
    const { db } = mount([memberRow({ belongs_to: 'partner_b', name: 'Mei' })]);

    await screen.findByText('Mei');
    await user.click(screen.getByRole('button', { name: /Add someone/ }));
    await user.type(await screen.findByLabelText('Name'), 'Wei');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'family_members')?.values).toMatchObject({
        name: 'Wei',
        belongs_to: 'partner_b',
      });
    });
  });

  it('stores a blank age as null rather than as NaN', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText('Name'), 'Wei');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      const values = lastWriteTo(db, 'family_members')?.values as Record<string, unknown>;
      expect(values.age).toBeNull();
      expect(values.birthday).toBeNull();
      expect(values.notes).toBeNull();
    });
  });

  it('opens the editor already filled in', async () => {
    const user = userEvent.setup();
    mount([
      memberRow({ name: 'Mei', relation: 'Mother', age: 62, notes: 'Calls every Sunday', sensitive: true }),
    ]);

    await user.click(await screen.findByRole('button', { name: /Edit/i }));
    expect(await screen.findByLabelText('Name')).toHaveValue('Mei');
    expect(screen.getByLabelText('Relation')).toHaveValue('Mother');
    expect(screen.getByLabelText(/Age/)).toHaveValue(62);
    expect(screen.getByLabelText(/What to know/)).toHaveValue('Calls every Sunday');
  });
});
