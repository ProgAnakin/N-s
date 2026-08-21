/**
 * Registering the service worker, carefully.
 *
 * Three things this does not do, each for a reason:
 *
 *   - **Not in development.** A worker caching a dev server's modules is
 *     an afternoon of wondering why an edit did nothing.
 *   - **Not before load.** Registering during the first paint competes
 *     with the chunks the page is actually waiting on; the worker is for
 *     the *next* visit and can afford to wait for this one to finish.
 *   - **Never a silent reload.** A new build takes over when every tab has
 *     closed, which is the boring default. Forcing it mid-session would
 *     swap the code under a half-written letter, and there is no version
 *     of that trade worth making in an app people write into.
 *
 * A failure here is not worth a word to anybody: the app works without a
 * service worker, which is exactly how it worked until this file existed.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Blocked by a private window, a browser setting, or a
      // Content-Security-Policy the host added. All of them are somebody
      // else's decision, and none of them is an error the reader can act
      // on.
    });
  });
}
