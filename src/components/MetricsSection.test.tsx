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

const { MetricsSection } = await import('./MetricsSection');

/**
 * The almanac.
 *
 * Gamification, but only the half of it that is not manipulative — and the
 * rules that make that true are all rules about what it must *not* do. No
 * streak, no percentage complete, and above all no comparison between the
 * two people, which is the one that would poison everything else on the
 * page. There is no version of "he wrote four letters, she wrote one" that
 * makes a couple happier.
 *
 * The second rule is that it stays away until there is something to say.
 * Three figures at zero is not an almanac, it is a reproach.
 */

function factRow(over: Record<string, unknown> = {}) {
  return {
    id: `f-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    author_id: HIM_ID,
    category: 'preferences',
    question: 'What flowers do you actually like?',
    answer: 'Peonies, the big pale ones.',
    visibility: 'shared',
    remind_on: null,
    question_id: 'q29',
    answer_kind: 'taste',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function letterRow(from: string) {
  return {
    id: `l-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    kind: 'letter',
    body: 'Something',
    from_profile: from,
    to_profile: from === HIM_ID ? HER_ID : HIM_ID,
    open_on: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mount(seed: Record<string, Record<string, unknown>[]> = {}, couple = {}) {
  return mountSignedIn(<MetricsSection />, {
    couple,
    seed: (db) => {
      for (const table of ['plans', 'memories', 'letters', 'remember_facts', 'phrases']) {
        db.seed(table, seed[table] ?? []);
      }
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('when it stays away', () => {
  /** Three figures at zero is not an almanac, it is a reproach. */
  it('shows nothing at all on a brand-new couple’s first day', async () => {
    const { view } = mount({}, { anniversary_date: null });
    await Promise.resolve();
    expect(view.container).toBeEmptyDOMElement();
  });
});

describe('once there is something to say', () => {
  it('names each figure and explains what it means', async () => {
    mount(
      {
        remember_facts: [factRow(), factRow({ answer_kind: 'place' })],
        phrases: [
          {
            id: 'p1',
            couple_id: COUPLE_ID,
            script_original: '慢慢来',
            pinyin_or_reading: null,
            translation: 'Take your time',
            note: null,
            audio_path: null,
            learned: true,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      { anniversary_date: '2023-06-12' },
    );

    expect(await screen.findByText('What the two of you have built')).toBeInTheDocument();
    expect(screen.getByText('Days together')).toBeInTheDocument();
    // Every card explains itself: a number nobody can interpret is either
    // decoration or anxiety.
    expect(screen.getByText('The one figure that only goes up, and should.')).toBeInTheDocument();
  });

  /**
   * The rule the whole component is built to keep. Both partners wrote
   * letters, at different rates — and the page must not notice.
   */
  it('never says which of them did more', async () => {
    mount(
      {
        remember_facts: [factRow(), factRow({ author_id: HER_ID })],
        letters: [letterRow(HIM_ID), letterRow(HIM_ID), letterRow(HIM_ID), letterRow(HER_ID)],
      },
      { anniversary_date: '2023-06-12' },
    );

    await screen.findByText('What the two of you have built');
    const page = document.body.textContent ?? '';
    expect(page).not.toContain('Léo');
    expect(page).not.toContain('Yan');
    // Counted as one, and the card says so out loud.
    expect(screen.getByText('From either of you. The app doesn’t count who.')).toBeInTheDocument();
  });

  it('says plainly that none of it is a score', async () => {
    mount(
      { remember_facts: [factRow(), factRow({ answer_kind: 'place' })] },
      { anniversary_date: '2023-06-12' },
    );

    await screen.findByText('What the two of you have built');
    expect(
      screen.getByText(/none of it is a comparison between the two of you/),
    ).toBeInTheDocument();
  });

  it('keeps no streak and shows no percentage', async () => {
    mount(
      { remember_facts: [factRow(), factRow({ answer_kind: 'place' })] },
      { anniversary_date: '2023-06-12' },
    );

    await screen.findByText('What the two of you have built');
    const page = document.body.textContent ?? '';
    expect(page).not.toMatch(/\bstreak\b/i);
    expect(page).not.toMatch(/%/);
    expect(page).not.toMatch(/\bcomplete\b/i);
  });

  /**
   * "Still to ask" counts questions nobody has answered. It has to read as
   * something to look forward to, not as a backlog — the copy is the
   * feature, so it is asserted.
   */
  it('frames what is left as a good thing to have', async () => {
    mount(
      { remember_facts: [factRow(), factRow({ answer_kind: 'place' })] },
      { anniversary_date: '2023-06-12' },
    );

    await screen.findByText('Still to ask');
    expect(screen.getByText(/Not a backlog/)).toBeInTheDocument();
  });
});

describe('what it reads', () => {
  /**
   * Counts only. This component must never pull anybody's words — it asks
   * for the narrow column list, and reading `answer` for the "answered"
   * test is as far as it goes.
   */
  it('never asks for a note’s question or a letter’s body', async () => {
    const { db } = mount(
      { remember_facts: [factRow(), factRow({ answer_kind: 'place' })] },
      { anniversary_date: '2023-06-12' },
    );
    await screen.findByText('What the two of you have built');

    const letters = db.selects.find((select) => select.table === 'letters');
    expect(letters?.columns).toBe('id,created_at');
    const facts = db.selects.find((select) => select.table === 'remember_facts');
    expect(facts?.columns).not.toContain('question');
  });
});
