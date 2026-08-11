import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, HIM_ID, mountSignedIn } from '@/test/harness';
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

const { MemoriesScreen } = await import('./MemoriesScreen');

/**
 * Opening a memory.
 *
 * A tile used to go straight to the lightbox, which meant the story was
 * only ever readable in a narrow column beside a photograph — and a
 * memory with no photograph could not be opened at all. Somebody who
 * wrote three paragraphs and attached nothing had written into a hole.
 *
 * These check the two things that fixes: that a memory opens as
 * something you read, and that it opens whether or not there is a
 * picture on it.
 */

function memoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: `mem-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    title: 'The night it rained in Porto',
    note: 'We stood under the awning for an hour and neither of us minded.',
    date: '2026-05-02',
    photo_path: null,
    created_by: HIM_ID,
    created_at: '2026-05-02T21:00:00.000Z',
    updated_at: '2026-05-02T21:00:00.000Z',
    ...overrides,
  };
}

function photoRow(memoryId: string, order = 0) {
  return {
    id: `photo-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    memory_id: memoryId,
    path: `${COUPLE_ID}/memories/${order}.jpg`,
    caption: null,
    sort_order: order,
    created_at: '2026-05-02T21:00:00.000Z',
  };
}

function mount(memories: Record<string, unknown>[], photos: Record<string, unknown>[] = []) {
  return mountSignedIn(<MemoriesScreen />, {
    seed: (db) => {
      db.seed('memories', memories);
      db.seed('memory_photos', photos);
    },
  });
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('reading a memory', () => {
  it('opens the story at full width rather than a strip beside a photo', async () => {
    const user = userEvent.setup();
    const memory = memoryRow({ id: 'porto' });
    mount([memory], [photoRow('porto')]);

    await user.click(await screen.findByRole('button', { name: /Open The night it rained/ }));

    const sheet = await screen.findByRole('dialog', { name: 'The night it rained in Porto' });
    expect(
      within(sheet).getByText(/We stood under the awning for an hour/),
    ).toBeInTheDocument();
  });

  /**
   * The hole this closes. A memory with no photographs was `disabled` on
   * the tile, so its words could never be read back.
   */
  it('opens a memory that has no photographs at all', async () => {
    const user = userEvent.setup();
    mount([memoryRow({ id: 'words-only' })], []);

    await user.click(await screen.findByRole('button', { name: /Open The night it rained/ }));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/neither of us minded/)).toBeInTheDocument();
  });

  it('says so plainly when a memory is a picture with no words', async () => {
    const user = userEvent.setup();
    mount([memoryRow({ id: 'quiet', note: null })], [photoRow('quiet')]);

    await user.click(await screen.findByRole('button', { name: /Open The night/ }));

    expect(await screen.findByText(/just the picture/)).toBeInTheDocument();
  });

  it('closes on Escape and puts focus back on the tile it came from', async () => {
    const user = userEvent.setup();
    mount([memoryRow({ id: 'porto' })]);

    const tile = await screen.findByRole('button', { name: /Open The night/ });
    await user.click(tile);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // Closing a memory halfway down a long album must not send you back
    // to the top of the page.
    expect(tile).toHaveFocus();
  });

  it('offers the whole set as contact prints, and each one opens the lightbox', async () => {
    const user = userEvent.setup();
    mount([memoryRow({ id: 'porto' })], [photoRow('porto', 0), photoRow('porto', 1)]);

    await user.click(await screen.findByRole('button', { name: /Open The night/ }));
    const sheet = await screen.findByRole('dialog');

    const prints = within(sheet).getAllByRole('button', { name: /Look at this one/ });
    expect(prints).toHaveLength(2);

    await user.click(prints[1]);
    // The lightbox is a second dialog: one is for reading a day, the
    // other for looking at one photograph.
    await waitFor(() => {
      expect(screen.getAllByRole('dialog').length).toBeGreaterThan(1);
    });
  });
});

describe('the timeline', () => {
  it('shows a memory with no photographs as a written page rather than a gap', async () => {
    mount([memoryRow({ id: 'words-only', note: 'A long quiet Tuesday.' })], []);

    // The story itself carries the tile, so the grid has no dead cell in
    // it — and the tile is a button, not a disabled box.
    const tile = await screen.findByRole('button', { name: /Open The night/ });
    expect(tile).toBeEnabled();
    expect(within(tile).getByText('A long quiet Tuesday.')).toBeInTheDocument();
  });

  it('counts the photographs on a page that holds several', async () => {
    mount(
      [memoryRow({ id: 'porto' })],
      [photoRow('porto', 0), photoRow('porto', 1), photoRow('porto', 2)],
    );

    const tile = await screen.findByRole('button', { name: /Open The night/ });
    expect(within(tile).getByText('3')).toBeInTheDocument();
  });
});
