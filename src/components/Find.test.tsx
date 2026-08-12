import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const { FindButton } = await import('./Find');

/**
 * Finding it again.
 *
 * The app had sixteen places to put something and no way to get any of it
 * back, which is fine in the first month and quietly fatal in the third
 * year. What is worth asserting is not that a search box searches — it is
 * the three promises around it.
 *
 * It quotes rather than summarises. It never reaches anything the person
 * searching is not already allowed to read — a sealed letter in particular,
 * whose whole point is that it is not readable yet. And it costs nothing
 * until it is opened, because ten table reads for a box nobody used is a
 * tax on every other page.
 */

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function factRow(over: Record<string, unknown> = {}) {
  return {
    id: `f-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    author_id: HIM_ID,
    category: 'preferences',
    question: 'What flowers do you actually like?',
    answer: 'Peonies, the big pale ones. Not roses.',
    visibility: 'shared',
    remind_on: null,
    question_id: null,
    answer_kind: 'taste',
    created_at: '2025-03-01T00:00:00.000Z',
    updated_at: '2025-03-01T00:00:00.000Z',
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
    created_at: '2025-05-01T00:00:00.000Z',
    updated_at: '2025-05-01T00:00:00.000Z',
    ...over,
  };
}

const EMPTY = [
  'memories',
  'letters',
  'remember_facts',
  'phrases',
  'culture_notes',
  'family_members',
  'date_ideas',
  'trips',
  'important_dates',
  'places',
  'expenses',
] as const;

function mount(seed: Record<string, Record<string, unknown>[]> = {}) {
  return mountSignedIn(<FindButton />, {
    seed: (db) => {
      for (const table of EMPTY) db.seed(table, seed[table] ?? []);
    },
  });
}

async function open(seed: Record<string, Record<string, unknown>[]> = {}) {
  const user = userEvent.setup();
  const scene = mount(seed);
  await user.click(await screen.findByRole('button', { name: /Find/ }));
  await screen.findByRole('dialog');
  return { user, ...scene };
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('before it is opened', () => {
  /** Ten table reads for a box nobody used is a tax on every other page. */
  it('reads nothing at all', async () => {
    const { db } = mount({ remember_facts: [factRow()] });
    await screen.findByRole('button', { name: /Find/ });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(db.selects.map((select) => select.table)).not.toContain('remember_facts');
  });
});

describe('opening it', () => {
  it('says what it reaches before anything is typed', async () => {
    await open();
    expect(screen.getByText(/memories, letters, notes, phrases/)).toBeInTheDocument();
  });

  it('opens on a bare slash, the way every search box does', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('button', { name: /Find/ });

    await user.keyboard('/');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  /**
   * A slash typed into a letter is a slash, not a command. Eating it would
   * make the app unusable for anybody writing a date or a fraction.
   */
  it('leaves the slash alone when somebody is typing into something', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('button', { name: /Find/ });

    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    await user.keyboard('/');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(field.value).toBe('/');
    field.remove();
  });

  it('closes on Escape', async () => {
    const { user } = await open();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('what it finds', () => {
  it('finds a note by a word in the answer', async () => {
    const { user } = await open({ remember_facts: [factRow()] });
    await user.type(screen.getByRole('searchbox'), 'peonies');

    expect(await screen.findByText('What flowers do you actually like?')).toBeInTheDocument();
  });

  /**
   * The rule the rest of the app keeps about a partner's words, kept here
   * too — and this is where it would be easiest to break, because a label
   * is so much tidier than a sentence.
   */
  it('quotes the sentence and marks the match inside it', async () => {
    const { user } = await open({ remember_facts: [factRow()] });
    await user.type(screen.getByRole('searchbox'), 'roses');

    const marked = await screen.findByText('roses');
    expect(marked.tagName).toBe('MARK');
    expect(marked.closest('button')?.textContent).toContain('Peonies, the big pale ones.');
  });

  it('searches across everything, not one page at a time', async () => {
    const { user } = await open({
      remember_facts: [factRow({ answer: 'She loves the train.' })],
      letters: [letterRow()],
    });
    await user.type(screen.getByRole('searchbox'), 'train');

    // The heading carries a count beside it, so the text node is split.
    expect(await screen.findByRole('heading', { name: /The vault/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Letters/ })).toBeInTheDocument();
  });

  it('says so plainly when there is nothing', async () => {
    const { user } = await open({ remember_facts: [factRow()] });
    await user.type(screen.getByRole('searchbox'), 'helicopter');

    expect(await screen.findByText(/Nothing with “helicopter” in it/)).toBeInTheDocument();
  });

  it('goes to the page the result lives on', async () => {
    const { user } = await open({ remember_facts: [factRow()] });
    await user.type(screen.getByRole('searchbox'), 'peonies');
    await user.click(await screen.findByText('What flowers do you actually like?'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('what it will not reach', () => {
  /**
   * A letter written to be opened next year is not readable yet. Finding it
   * by searching its own text would open it through the side door — the app
   * breaking a promise its author made on purpose.
   */
  it('never finds a sealed letter by its own words', async () => {
    const { user } = await open({
      letters: [
        letterRow({ body: 'Happy tenth anniversary, my love.', open_on: daysFromNow(300) }),
      ],
    });
    await user.type(screen.getByRole('searchbox'), 'anniversary');

    expect(await screen.findByText(/Nothing with/)).toBeInTheDocument();
  });

  it('does find one whose day has come', async () => {
    const { user } = await open({
      letters: [letterRow({ body: 'Happy anniversary.', open_on: daysFromNow(-10) })],
    });
    await user.type(screen.getByRole('searchbox'), 'anniversary');

    expect(await screen.findByRole('heading', { name: /Letters/ })).toBeInTheDocument();
  });

  /**
   * Gift ideas are the one feature whose whole value is that the other
   * person does not know. A search result is a thing on a screen, and
   * screens get read over shoulders.
   */
  it('leaves gift ideas out of it entirely', async () => {
    const { db, user } = await open();
    db.seed('gift_ideas', [
      {
        id: 'g1',
        couple_id: COUPLE_ID,
        author_id: HIM_ID,
        idea: 'The bicycle she keeps looking at',
        note: null,
        occasion: null,
        used: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    await user.type(screen.getByRole('searchbox'), 'bicycle');

    expect(await screen.findByText(/Nothing with/)).toBeInTheDocument();
    expect(db.selects.map((select) => select.table)).not.toContain('gift_ideas');
  });

  /**
   * A private note is yours, and being unable to find your own notes is the
   * problem this whole feature exists to fix. It is found, and marked.
   */
  it('finds your own private note, and says it is only yours', async () => {
    const { user } = await open({
      remember_facts: [
        factRow({ visibility: 'private', answer: 'She hates being called at work.' }),
      ],
    });
    await user.type(screen.getByRole('searchbox'), 'work');

    expect(await screen.findByText('only you')).toBeInTheDocument();
  });

  it('says nothing of the sort about something shared', async () => {
    const { user } = await open({ remember_facts: [factRow()] });
    await user.type(screen.getByRole('searchbox'), 'peonies');

    await screen.findByText('What flowers do you actually like?');
    expect(screen.queryByText('only you')).not.toBeInTheDocument();
  });
});
