import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DropZone, FilePickButton } from './DropZone';

/**
 * Dropping a file onto a page.
 *
 * Three behaviours here are not obvious, and each one is a real bug that
 * this component exists to prevent:
 *
 *   - `dragleave` fires when the cursor crosses onto a *child*, so a naive
 *     overlay flickers the whole way across the screen. A depth counter is
 *     the fix, and the test drags across a nested element to prove it.
 *   - A file dropped a few pixels off target is opened by the browser,
 *     navigating away from a half-written letter. The window has to refuse
 *     drops by default.
 *   - Drag and drop is unusable with a keyboard and impossible on a phone,
 *     so the same thing has to exist as a button.
 */

function fileList(...files: File[]) {
  return {
    types: ['Files'],
    files: { ...files, length: files.length, item: (i: number) => files[i] ?? null },
    dropEffect: '',
  };
}

function renderZone(onFile = vi.fn()) {
  const view = render(
    <DropZone onFile={onFile} title="Drop it here" hint="TXT, PDF or Word">
      <div data-testid="child">The letter</div>
    </DropZone>,
  );
  return { onFile, zone: view.container.firstElementChild as HTMLElement, view };
}

describe('the overlay', () => {
  it('stays out of the way until something is dragged over', () => {
    renderZone();
    expect(screen.queryByText('Drop it here')).not.toBeInTheDocument();
  });

  it('appears when a file is dragged in, and says what is accepted', () => {
    const { zone } = renderZone();
    fireEvent.dragEnter(zone, { dataTransfer: fileList() });

    expect(screen.getByText('Drop it here')).toBeInTheDocument();
    expect(screen.getByText('TXT, PDF or Word')).toBeInTheDocument();
  });

  /**
   * The flicker. Crossing onto a child fires `dragleave` on the parent, so
   * without the depth counter the overlay vanishes the moment the cursor
   * reaches anything inside the zone.
   */
  it('does not flicker when the cursor crosses onto a child', () => {
    const { zone } = renderZone();
    fireEvent.dragEnter(zone, { dataTransfer: fileList() });
    fireEvent.dragEnter(screen.getByTestId('child'), { dataTransfer: fileList() });
    fireEvent.dragLeave(zone);

    expect(screen.getByText('Drop it here')).toBeInTheDocument();
  });

  it('goes away once the cursor has left for good', () => {
    const { zone } = renderZone();
    fireEvent.dragEnter(zone, { dataTransfer: fileList() });
    fireEvent.dragLeave(zone);

    expect(screen.queryByText('Drop it here')).not.toBeInTheDocument();
  });

  /** Text dragged from another tab is not a file, and must not raise it. */
  it('ignores a drag that carries no files', () => {
    const { zone } = renderZone();
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['text/plain'], files: { length: 0 } } });
    expect(screen.queryByText('Drop it here')).not.toBeInTheDocument();
  });
});

describe('the drop', () => {
  it('hands the file over and takes the overlay down', () => {
    const { zone, onFile } = renderZone();
    const file = new File(['dear you'], 'letter.txt', { type: 'text/plain' });

    fireEvent.dragEnter(zone, { dataTransfer: fileList(file) });
    fireEvent.drop(zone, { dataTransfer: fileList(file) });

    expect(onFile).toHaveBeenCalledWith(file);
    expect(screen.queryByText('Drop it here')).not.toBeInTheDocument();
  });

  it('takes one file, not a folder’s worth', () => {
    const { zone, onFile } = renderZone();
    const first = new File(['one'], 'one.txt', { type: 'text/plain' });
    const second = new File(['two'], 'two.txt', { type: 'text/plain' });

    fireEvent.drop(zone, { dataTransfer: fileList(first, second) });

    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile).toHaveBeenCalledWith(first);
  });

  /**
   * The expensive failure: a file dropped a few pixels off target navigates
   * the browser to it, and in a single-page app the half-written letter is
   * simply gone.
   */
  it('makes the whole window swallow a drop rather than navigating to it', () => {
    renderZone();
    const stray = new Event('drop', { cancelable: true, bubbles: true });
    window.dispatchEvent(stray);
    expect(stray.defaultPrevented).toBe(true);

    const over = new Event('dragover', { cancelable: true, bubbles: true });
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
  });

  it('stops swallowing once the zone is gone', () => {
    const { view } = renderZone();
    view.unmount();

    const stray = new Event('drop', { cancelable: true, bubbles: true });
    window.dispatchEvent(stray);
    expect(stray.defaultPrevented).toBe(false);
  });
});

describe('when it is switched off', () => {
  it('renders what it was wrapping and nothing else', () => {
    render(
      <DropZone onFile={vi.fn()} title="Drop it here" hint="Anything" disabled>
        <div data-testid="child">The letter</div>
      </DropZone>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByText('Drop it here')).not.toBeInTheDocument();
  });
});

/**
 * A feature that exists only as a drop target exists only for people on a
 * desktop with a file manager open.
 */
describe('the button, for everybody else', () => {
  it('hands over a file chosen through the picker', async () => {
    const user = userEvent.setup();
    const onFile = vi.fn();
    const { container } = render(<FilePickButton onFile={onFile} label="Choose a file" />);

    const file = new File(['dear you'], 'letter.txt', { type: 'text/plain' });
    const input = container.querySelector('input[type="file"]')!;
    await user.upload(input as HTMLInputElement, file);

    expect(onFile).toHaveBeenCalledWith(file);
  });

  /**
   * Cleared after every pick, so choosing the same file twice in a row
   * still fires — otherwise a failed import cannot simply be retried.
   */
  it('lets the same file be chosen twice in a row', async () => {
    const user = userEvent.setup();
    const onFile = vi.fn();
    const { container } = render(<FilePickButton onFile={onFile} label="Choose a file" />);

    const file = new File(['dear you'], 'letter.txt', { type: 'text/plain' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    await user.upload(input, file);

    expect(onFile).toHaveBeenCalledTimes(2);
  });

  it('cannot be pressed while an import is already running', () => {
    render(<FilePickButton onFile={vi.fn()} label="Choose a file" busy />);
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeDisabled();
  });
});
