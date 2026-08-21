import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { primeAccent } from './theme';
import { registerServiceWorker } from './pwa';
import './styles/index.css';

// Before the first frame, not after: the couple's accent is not known until
// the profile loads, and without this every launch opens cinnabar and then
// changes colour under the reader.
primeAccent();

// After the render call below, not before: this is for the next visit, and
// competing with the chunks this one is waiting on would be backwards.
registerServiceWorker();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    {/* The outermost one, and the only one that can catch a throw in the
        providers themselves — theme, session, i18n. The per-screen
        boundaries in App.tsx sit inside all of those and would never see
        it. This is the difference between a white page and a sentence. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
