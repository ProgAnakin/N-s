import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LazyMotion, domAnimation } from 'framer-motion';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { Book, MemoryLike, PhotoLike } from '@/lib/album';
import { MemorySheet } from './MemorySheet';

/**
 * A memory, opened.
 *
 * The hole this component was built to fill: a memory with no photographs
 * could not be opened at all, because the tile was disabled without a cover.
 * Somebody who wrote three paragraphs and attached nothing had no way to
 * read them back, which is the opposite of what an album is for. That case
 * is the first thing asserted here.
 *
 * The rest is about not losing your place — closing must return focus to
 * the tile you came from, not to the top of a long album — and about the
 * scrim closing only when the scrim itself is clicked, so a text selection
 * that drifts does not dismiss the page you were reading.
 */

function photo(over: Partial<PhotoLike> = {}): PhotoLike {
  return {
    id: `p-${Math.random().toString(36).slice(2)}`,
    memory_id: 'm1',
    path: 'couples/33/one.jpg',
    caption: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function book(
  memory: Partial<MemoryLike> = {},
  photos: PhotoLike[] = [],
  cover: PhotoLike | null = null,
): Book<MemoryLike, PhotoLike> {
  return {
    memory: {
      id: 'm1',
      title: 'The night it rained in Porto',
      date: '2025-04-02',
      note: 'We ran for the tram and missed it, twice.',
      ...memory,
    },
    photos,
    cover,
  };
}

function mount(
  value: Book<MemoryLike, PhotoLike> | null,
  urls: Record<string, string> = {},
  handlers: Partial<Parameters<typeof MemorySheet>[0]> = {},
) {
  const props = {
    onClose: vi.fn(),
    onOpenPhoto: vi.fn(),
    onAddPhotos: vi.fn(async () => {}),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...handlers,
  };
  const view = render(
    <LazyMotion features={domAnimation} strict>
      <I18nProvider locale="en">
        <MemorySheet book={value} urls={urls} dateLabel="2 April 2025" {...props} />
      </I18nProvider>
    </LazyMotion>,
  );
  return { ...props, view };
}

describe('what it opens for', () => {
  it('renders nothing at all when no memory is open', () => {
    mount(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /**
   * The hole this component was built to fill. Three paragraphs and no
   * photographs was previously unreadable.
   */
  it('opens a memory that has no photographs, and gives it a proper page', () => {
    mount(book());
    expect(screen.getByRole('dialog', { name: 'The night it rained in Porto' })).toBeInTheDocument();
    expect(screen.getByText('We ran for the tram and missed it, twice.')).toBeInTheDocument();
    expect(screen.getByText('2 April 2025')).toBeInTheDocument();
  });

  it('says so gently when there is a photograph but no story', () => {
    const cover = photo();
    mount(book({ note: null }, [], cover), { [cover.path]: 'data:image/gif;base64,x' });
    expect(screen.getByText(/No words on this one/)).toBeInTheDocument();
  });

  it('shows the cover under the title once there is one', () => {
    const cover = photo({ path: 'couples/33/cover.jpg' });
    mount(book({}, [], cover), { 'couples/33/cover.jpg': 'data:image/gif;base64,x' });
    expect(screen.getByAltText(/The night it rained in Porto/)).toBeInTheDocument();
  });

  it('waits rather than showing a broken frame while a URL is still coming', () => {
    const cover = photo({ path: 'couples/33/cover.jpg' });
    mount(book({}, [], cover), {});
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('the contact sheet', () => {
  it('shows every photograph, and opens the one that was tapped', async () => {
    const user = userEvent.setup();
    const first = photo({ id: 'a', path: 'a.jpg' });
    const second = photo({ id: 'b', path: 'b.jpg' });
    const { onOpenPhoto } = mount(book({}, [first, second], first), {
      'a.jpg': 'data:image/gif;base64,x',
      'b.jpg': 'data:image/gif;base64,y',
    });

    const tiles = screen.getAllByRole('button', { name: 'Look at this one' });
    expect(tiles).toHaveLength(2);
    await user.click(tiles[1]);
    expect(onOpenPhoto).toHaveBeenCalledWith(second);
  });

  it('draws no contact sheet at all when there is nothing to print', () => {
    mount(book());
    expect(screen.queryByRole('button', { name: 'Look at this one' })).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ photos?/)).not.toBeInTheDocument();
  });
});

describe('closing it', () => {
  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = mount(book());
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the scrim itself is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = mount(book());
    await user.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * A click that starts on the text and drifts must not count as a
   * dismissal — losing a page you were halfway through reading because you
   * tried to select a sentence is a small betrayal.
   */
  it('does not close when the click lands on the page itself', async () => {
    const user = userEvent.setup();
    const { onClose } = mount(book());
    await user.click(screen.getByText('We ran for the tram and missed it, twice.'));
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * Focus goes back to the tile that opened it. Sending it to the top of
   * the page loses your place entirely in a long album.
   */
  it('gives focus back to whatever opened it', async () => {
    const tile = document.createElement('button');
    tile.textContent = 'The tile';
    document.body.appendChild(tile);
    tile.focus();

    const { view } = mount(book());
    expect(document.activeElement).not.toBe(tile);

    view.rerender(
      <LazyMotion features={domAnimation} strict>
        <I18nProvider locale="en">
          <MemorySheet
            book={null}
            urls={{}}
            dateLabel="2 April 2025"
            onClose={vi.fn()}
            onOpenPhoto={vi.fn()}
            onAddPhotos={vi.fn(async () => {})}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
          />
        </I18nProvider>
      </LazyMotion>,
    );

    await waitFor(() => {
      expect(document.activeElement).toBe(tile);
    });
    tile.remove();
  });

  it('lets the page behind it scroll again afterwards', () => {
    const { view } = mount(book());
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('what you can do from here', () => {
  it('offers editing and deleting the memory itself', async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete } = mount(book());

    await user.click(screen.getByRole('button', { name: /^Edit$/i }));
    expect(onEdit).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^Delete$/i }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('adds photographs to this memory, by its own id', async () => {
    const user = userEvent.setup();
    const { onAddPhotos, view } = mount(book({ id: 'm-seven' }));

    const input = view.baseElement.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [new File(['x'], 'one.jpg', { type: 'image/jpeg' })]);

    expect(onAddPhotos).toHaveBeenCalledWith('m-seven', expect.anything());
  });
});
