import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The thing that stands between one bad render and a white screen.
 *
 * React's behaviour when a component throws during render is to unmount
 * the entire tree. Not the screen — everything. The person is left looking
 * at a blank page with no navigation, no message and no way back except
 * knowing to reload, and if the throw is deterministic the reload lands
 * them straight back on it.
 *
 * The app had none of these anywhere, which meant a single malformed row —
 * a date that will not parse, a photo whose path came back null — could
 * take out years of somebody's memories until they thought to try a
 * different URL.
 *
 * Two properties this one is careful about:
 *
 *   - **It renders no app furniture.** No i18n, no theme hooks, no
 *     components from `ui/`. A boundary that depends on the app is a
 *     boundary that fails when the app does, and the copy is in English
 *     for the same reason: `useStrings` reads a context that may be the
 *     very thing that threw.
 *   - **Resetting is a real attempt, not a reload.** `onReset` clears the
 *     error and re-renders the children. Where that is not enough, the
 *     second button reloads — but trying the cheap thing first means a
 *     transient failure costs nothing.
 */
interface Props {
  children: ReactNode;
  /** Distinguishes the whole-app boundary from a per-screen one. */
  scope?: 'app' | 'screen';
  /** Called after a successful reset, for a router to navigate home. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is the only reporter this app has, and deliberately so:
    // there is no analytics endpoint and adding one to catch crashes would
    // mean shipping somebody's stack traces off their device.
    console.error('Caught by ErrorBoundary:', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const whole = this.props.scope !== 'screen';

    return (
      <div
        role="alert"
        style={{
          minHeight: whole ? '100dvh' : '50dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          // Inline, not Tailwind. If the stylesheet is what failed to
          // load, class names buy nothing and this still has to be
          // readable.
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: '#1a1a17',
          background: '#f6efe2',
        }}
      >
        <p style={{ fontSize: '1.25rem', fontWeight: 500, margin: 0 }}>
          Something on this page broke.
        </p>
        <p style={{ margin: 0, maxWidth: '32rem', lineHeight: 1.6, opacity: 0.75 }}>
          Nothing has been lost — this is a fault in the drawing, not in what
          was written down. Try again, and if it keeps happening, reload.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={this.reset}
            style={{
              padding: '0.6rem 1.1rem',
              border: '1px solid #a33',
              background: '#a33',
              color: '#f6efe2',
              borderRadius: 2,
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.6rem 1.1rem',
              border: '1px solid #1a1a17',
              background: 'transparent',
              color: '#1a1a17',
              borderRadius: 2,
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            Reload
          </button>
        </div>

        {/* Collapsed, and present. Somebody reporting this should be able
            to copy something useful; nobody should have to look at a stack
            trace to use their own app. */}
        <details style={{ maxWidth: '40rem', width: '100%', textAlign: 'left' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.8rem', opacity: 0.6 }}>
            Technical detail
          </summary>
          <pre
            style={{
              fontSize: '0.75rem',
              overflowX: 'auto',
              opacity: 0.7,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error.message}
          </pre>
        </details>
      </div>
    );
  }
}
