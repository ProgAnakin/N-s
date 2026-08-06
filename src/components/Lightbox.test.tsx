import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { Lightbox } from './Lightbox';
import { buildBooks, flattenAlbum, type MemoryLike, type PhotoLike } from '@/lib/album';

/**
 * Walking the album.
 *
 * The keyboard is the point of this component — "the two of you sitting
 * together pressing the arrow key" is the interaction it exists for — so it
 * is what gets tested, rather than whether the buttons render.
 */

const MEMORIES: MemoryLike[] = [
  { id: 'm1', title: 'Porto', date: '2026-08-06', note: 'It rained.' },
  { id: 'm2', title: 'Dumplings', date: '2026-08-04', note: null },
];

const PHOTOS: PhotoLike[] = [
  { id: 'p1', memory_id: 'm1', path: 'a', caption: 'Under the awning', sort_order: 0, created_at: '1' },
  { id: 'p2', memory_id: 'm1', path: 'b', caption: null, sort_order: 1, created_at: '2' },
  { id: 'p3', memory_id: 'm2', path: 'c', caption: null, sort_order: 0, created_at: '3' },
];

const URLS = { a: 'blob:a', b: 'blob:b', c: 'blob:c' };

function mount(index: number, handlers: Partial<Parameters<typeof Lightbox>[0]> = {}) {
  const onIndexChange = vi.fn();
  const onClose = vi.fn();
  const onAddPhotos = vi.fn(async () => {});
  const onRemovePhoto = vi.fn(async () => {});
  const slides = flattenAlbum(buildBooks(MEMORIES, PHOTOS));

  const view = render(
    <I18nProvider locale="en">
      <Lightbox
        slides={slides}
        index={index}
        urls={URLS}
        onClose={onClose}
        onIndexChange={onIndexChange}
        onAddPhotos={onAddPhotos}
        onRemovePhoto={onRemovePhoto}
        formatDate={(iso) => iso}
        {...handlers}
      />
    </I18nProvider>,
  );

  return { view, onIndexChange, onClose, onAddPhotos, onRemovePhoto, slides };
}

describe('opening and closing', () => {
  it('shows nothing at all when the index is -1', () => {
    mount(-1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows nothing for an index past the end', () => {
    mount(99);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = mount(0);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('walking through with the arrow keys', () => {
  it('goes forward', async () => {
    const user = userEvent.setup();
    const { onIndexChange } = mount(0);
    await user.keyboard('{ArrowRight}');
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('goes back', async () => {
    const user = userEvent.setup();
    const { onIndexChange } = mount(1);
    await user.keyboard('{ArrowLeft}');
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it('carries straight on from one memory into the next', async () => {
    const user = userEvent.setup();
    // Slide 1 is the last photo of Porto; slide 2 is the first of Dumplings.
    const { onIndexChange } = mount(1);
    await user.keyboard('{ArrowRight}');
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it('stops at the end rather than looping back to the start', async () => {
    const user = userEvent.setup();
    const { onIndexChange } = mount(2);
    await user.keyboard('{ArrowRight}');
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it('stops at the start rather than looping to the end', async () => {
    const user = userEvent.setup();
    const { onIndexChange } = mount(0);
    await user.keyboard('{ArrowLeft}');
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it('disables the arrow at each end rather than hiding it', () => {
    mount(0);
    expect(screen.getByRole('button', { name: /Previous photo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next photo/ })).toBeEnabled();
  });
});

describe('the story beside the photograph', () => {
  it('shows the memory that owns the photograph on screen', () => {
    mount(0);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Porto')).toBeInTheDocument();
    expect(within(dialog).getByText('It rained.')).toBeInTheDocument();
  });

  it('changes to the next memory as you cross into it', () => {
    mount(2);
    expect(within(screen.getByRole('dialog')).getByText('Dumplings')).toBeInTheDocument();
  });

  it('says where you are in the whole album and in this day', () => {
    mount(1);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('2 of 3')).toBeInTheDocument();
    expect(within(dialog).getByText(/Photo 2 of 2 from this day/)).toBeInTheDocument();
  });

  it('shows a photo caption on the mount, not over the picture', () => {
    mount(0);
    const caption = screen.getByText('Under the awning');
    expect(caption.tagName.toLowerCase()).toBe('figcaption');
  });

  it('never crops: the print is contained, not covered', () => {
    mount(0);
    // A cover-fit here would silently cut the top off somebody's face.
    expect(screen.getByRole('img')).toHaveClass('object-contain');
  });
});

describe('adding photographs from inside', () => {
  it('hands the files to the memory currently on screen', async () => {
    const user = userEvent.setup();
    const { onAddPhotos } = mount(2);

    const input = screen
      .getByRole('dialog')
      .querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(['x'], 'x.png', { type: 'image/png' }));

    await waitFor(() => {
      expect(onAddPhotos).toHaveBeenCalledWith('m2', expect.anything());
    });
  });

  it('accepts several at once, because a day is several photographs', () => {
    mount(0);
    const input = screen
      .getByRole('dialog')
      .querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.multiple).toBe(true);
  });
});
