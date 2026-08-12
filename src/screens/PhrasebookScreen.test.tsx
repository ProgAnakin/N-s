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

const { PhrasebookScreen } = await import('./PhrasebookScreen');

/**
 * The phrasebook, and the flashcard mode inside it.
 *
 * Practice is a small state machine — a deck, a position in it, a revealed
 * flag — and small state machines are where off-by-one lives. The two that
 * would actually hurt: a card that shows its answer before you asked, and a
 * "mark as learned" that marks the card after the one you were looking at.
 *
 * The other thing asserted here is that the answer stays hidden until it is
 * asked for. A flashcard that reveals itself is not a flashcard.
 */

function phraseRow(over: Record<string, unknown> = {}) {
  return {
    id: `p-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    script_original: '你今天怎么样？',
    pinyin_or_reading: 'nǐ jīntiān zěnmeyàng?',
    translation: 'How was your day?',
    note: null,
    audio_path: null,
    learned: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function mount(rows: Record<string, unknown>[] = []) {
  return mountSignedIn(<PhrasebookScreen />, {
    seed: (db) => {
      db.seed('phrases', rows);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('the list', () => {
  it('offers somewhere to start when there is nothing in it', async () => {
    mount();
    expect(await screen.findByText('No phrases yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Practise' })).not.toBeInTheDocument();
  });

  it('says how far along the two of you are', async () => {
    mount([
      phraseRow({ learned: true }),
      phraseRow({ learned: false, translation: 'Have you eaten?' }),
    ]);
    expect(await screen.findByText('1 of 2 learned')).toBeInTheDocument();
  });

  it('filters down to what is still being learned', async () => {
    const user = userEvent.setup();
    mount([
      phraseRow({ learned: true, translation: 'Good night' }),
      phraseRow({ learned: false, translation: 'Have you eaten?' }),
    ]);

    await screen.findByText('Good night');
    await user.click(screen.getByRole('button', { name: 'Still learning' }));

    expect(screen.getByText('Have you eaten?')).toBeInTheDocument();
    expect(screen.queryByText('Good night')).not.toBeInTheDocument();
  });

  it('moves one across without needing the editor', async () => {
    const user = userEvent.setup();
    const { db } = mount([phraseRow({ id: 'p1', learned: false })]);

    await screen.findByText('How was your day?');
    await user.click(screen.getByRole('button', { name: 'Mark as learned' }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'phrases')?.values).toMatchObject({ learned: true });
    });
  });
});

describe('adding one', () => {
  it('needs the phrase and what it means, and nothing else', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText('In their language'), '慢慢来');
    await user.type(screen.getByLabelText('What it means'), 'Take your time');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'phrases')?.values).toMatchObject({
        script_original: '慢慢来',
        translation: 'Take your time',
        pinyin_or_reading: null,
        note: null,
        audio_path: null,
      });
    });
  });

  it('will not save a phrase with no meaning attached', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByLabelText('In their language'), '慢慢来');
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
    expect(db.writes).toHaveLength(0);
  });
});

describe('practice', () => {
  async function startPractising(rows: Record<string, unknown>[]) {
    const user = userEvent.setup();
    const scene = mount(rows);
    await screen.findByText(/of \d+ learned/);
    await user.click(screen.getByRole('button', { name: 'Practise' }));
    return { user, ...scene };
  }

  /** A flashcard that reveals itself is not a flashcard. */
  it('shows the meaning and hides the phrase until asked', async () => {
    await startPractising([phraseRow()]);

    expect(await screen.findByText('How was your day?')).toBeInTheDocument();
    expect(screen.queryByText('你今天怎么样？')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show me' })).toBeInTheDocument();
  });

  it('reveals the phrase and how to say it, together', async () => {
    const { user } = await startPractising([phraseRow()]);

    await user.click(await screen.findByRole('button', { name: 'Show me' }));
    expect(await screen.findByText('你今天怎么样？')).toBeInTheDocument();
    expect(screen.getByText('nǐ jīntiān zěnmeyàng?')).toBeInTheDocument();
  });

  it('deals only the ones still being learned', async () => {
    await startPractising([
      phraseRow({ learned: true, translation: 'Already known' }),
      phraseRow({ learned: false, translation: 'Still learning this' }),
    ]);

    expect(await screen.findByText('Still learning this')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('hides the answer again on the next card', async () => {
    const { user } = await startPractising([
      phraseRow({ translation: 'First one', script_original: '一' }),
      phraseRow({ translation: 'Second one', script_original: '二' }),
    ]);

    await user.click(await screen.findByRole('button', { name: 'Show me' }));
    await screen.findByText('一');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Second one')).toBeInTheDocument();
    // `mode="wait"` sequences the two panels, so there is a beat with
    // neither on screen. The prompt coming back is what says the next card
    // is face down again.
    expect(await screen.findByRole('button', { name: 'Show me' })).toBeInTheDocument();
    expect(screen.queryByText('二')).not.toBeInTheDocument();
  });

  /**
   * The off-by-one that would be silent: marking the card *after* the one
   * on screen. Two cards, learn the first, and the write must name it.
   */
  it('marks the card you are actually looking at', async () => {
    const { user, db } = await startPractising([
      phraseRow({ id: 'first', translation: 'First one' }),
      phraseRow({ id: 'second', translation: 'Second one' }),
    ]);

    await user.click(await screen.findByRole('button', { name: 'Show me' }));
    await user.click(await screen.findByRole('button', { name: 'Mark as learned' }));

    await waitFor(() => {
      const write = lastWriteTo(db, 'phrases');
      expect(write?.match.id).toBe('first');
      expect(write?.values).toMatchObject({ learned: true });
    });
  });

  it('says when the deck is done, and offers another round', async () => {
    const { user } = await startPractising([phraseRow()]);

    await user.click(await screen.findByRole('button', { name: 'Show me' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText(/That’s all of them/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Practise' })).toBeInTheDocument();
  });

  it('comes back to the list when practice is stopped', async () => {
    const { user } = await startPractising([phraseRow()]);

    await screen.findByText('How was your day?');
    await user.click(screen.getByRole('button', { name: 'Stop practising' }));

    expect(await screen.findByText(/of \d+ learned/)).toBeInTheDocument();
  });
});
