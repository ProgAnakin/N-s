import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * React logs every caught error to the console, which is correct of it and
 * makes a passing test look like a failing one. Silenced here only — the
 * suite's own filter in test/setup.ts is about a different message.
 */
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

function Boom({ when = true }: { when?: boolean }) {
  if (when) throw new Error('the drawing failed');
  return <p>the screen, working</p>;
}

/**
 * What React does when a component throws during render is unmount the
 * whole tree — not the screen, everything. The person is left on a blank
 * page with no navigation and no message, and if the throw is
 * deterministic, reloading lands them straight back on it.
 *
 * The app had no boundary anywhere, so a single malformed row could take
 * out years of somebody's memories until they thought to try another URL.
 */
describe('when a screen throws', () => {
  it('says so, instead of showing nothing at all', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something on this page broke/i)).toBeInTheDocument();
  });

  it('says nothing has been lost, because nothing has', () => {
    // The failure is in the drawing, not in the writing down. Somebody
    // whose diary appears to have crashed needs that sentence first.
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/nothing has been lost/i)).toBeInTheDocument();
  });

  it('offers to try again before it offers to reload', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons[0]).toMatch(/try again/i);
    expect(buttons[1]).toMatch(/reload/i);
  });

  it('really re-renders on “try again”, rather than only clearing itself', async () => {
    const user = userEvent.setup();

    function Flaky() {
      // Throws once, then behaves — which is what a transient failure is.
      const [tries, setTries] = useState(0);
      return (
        <ErrorBoundary onReset={() => setTries((n) => n + 1)}>
          <Boom when={tries === 0} />
        </ErrorBoundary>
      );
    }

    render(<Flaky />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('the screen, working')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the detail available without putting it in anybody’s way', async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    // Collapsed, so nobody has to look at a stack trace to use their app —
    // and present, so anybody reporting it can copy something useful.
    expect(screen.queryByText('the drawing failed')).not.toBeVisible();
    await user.click(screen.getByText(/technical detail/i));
    expect(screen.getByText('the drawing failed')).toBeVisible();
  });

  it('logs, because the console is the only reporter this app has', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(consoleError).toHaveBeenCalled();
  });

  it('leaves a working tree completely alone', () => {
    const { container } = render(
      <ErrorBoundary>
        <p>nothing wrong here</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('nothing wrong here')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // No wrapper element of its own, so it can go anywhere without
    // changing a layout.
    expect(container.firstElementChild?.tagName).toBe('P');
  });

  /**
   * The whole-app boundary fills the viewport; a per-screen one must not,
   * because the navigation around it is still perfectly good and taking
   * the screen off it would be worse than the error.
   */
  it('takes the whole viewport only when it is the whole app', () => {
    const { unmount } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveStyle({ minHeight: '100dvh' });
    unmount();

    render(
      <ErrorBoundary scope="screen">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveStyle({ minHeight: '50dvh' });
  });

  /**
   * The boundary renders no app furniture on purpose — no i18n, no theme,
   * nothing from ui/. A boundary that depends on the app is one that fails
   * when the app does, which is the only moment it is needed.
   */
  it('needs no provider around it', () => {
    // No ThemeProvider, no I18nProvider, no router. If this render works,
    // the boundary survives whatever took them out.
    expect(() =>
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
