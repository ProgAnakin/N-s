/**
 * The service worker.
 *
 * It exists for two reasons and neither of them is offline data. It makes
 * the app installable — a browser will not offer "add to home screen"
 * without one — and it makes a return visit start from disk rather than
 * from the network.
 *
 * ## The rule this file exists to keep
 *
 * **Nothing private is ever cached.** Not a row, not a photograph, not a
 * signed URL. The only things that go in the cache are same-origin static
 * assets — the JavaScript, the stylesheet, the icons — which are identical
 * for every visitor and are already public to anybody who loads the site.
 *
 * Everything else goes straight to the network with no interception:
 * Supabase, Storage, the fonts, and anything carrying credentials. A
 * cached API response for an app like this one would sit on the device
 * long after somebody signed out, which is exactly the failure the rest of
 * this codebase is built to avoid. That is why the fetch handler starts by
 * refusing rather than by matching.
 *
 * ## Versioning
 *
 * `CACHE` carries a version. `activate` deletes every cache that is not
 * the current one, so a deploy cannot leave a previous build's chunks
 * behind to be served against a new index.html.
 *
 * ## What it deliberately does not do
 *
 * It does not call `skipWaiting()` on install. A worker that takes over
 * mid-session would swap the chunks under a half-written letter. The new
 * one waits for every tab to close, which is the boring, correct default;
 * the page asks for it explicitly (see `registerServiceWorker`) only when
 * the user has been told.
 */

const VERSION = 'v1';
const CACHE = `nos-static-${VERSION}`;

/**
 * The shell, precached so a cold offline launch has something to draw.
 *
 * Only paths that never change name. Vite fingerprints the JS and CSS, so
 * those cannot be listed here — they are picked up at runtime instead, the
 * first time they are actually asked for.
 */
const SHELL = ['/', '/manifest.webmanifest', '/seal.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // `reload` so an install never picks the shell up out of the HTTP
      // cache, which is how a worker ends up precaching the build it was
      // meant to replace.
      cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' }))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** The page asking to be taken over now, because it has said so on screen. */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});

/**
 * Whether a request may be cached at all.
 *
 * Written as a series of refusals rather than a match, so the default for
 * anything unforeseen is "no". A new kind of private request added a year
 * from now is excluded by this function without anybody remembering to
 * come back and exclude it.
 */
function isCacheableAsset(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  // Credentials, of any kind, mean this is somebody's rather than
  // everybody's.
  if (request.headers.has('authorization')) return false;
  if (url.search) return false;

  // Static asset destinations only. `document` is handled separately;
  // everything else — fetch, xhr, websocket — is data by definition.
  return ['script', 'style', 'font', 'image', 'manifest'].includes(request.destination);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  /**
   * A navigation: network first, cache second.
   *
   * Network first because index.html names the fingerprinted chunks, and
   * serving a stale one would point the browser at files this build no
   * longer has. Cache second so a launch with no signal still draws the
   * app rather than the browser's dinosaur.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          void cache.put('/', fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match('/');
          if (cached) return cached;
          throw new Error('offline, and nothing cached to fall back to');
        }
      })(),
    );
    return;
  }

  if (!isCacheableAsset(request)) return;

  /**
   * An asset: cache first.
   *
   * Safe because every one of these is fingerprinted or immutable. A
   * changed file arrives under a changed name, so a hit is always the
   * right file rather than an old one.
   */
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      // Opaque and error responses are not worth keeping; caching a 404
      // is how a broken deploy becomes permanent.
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        void cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
