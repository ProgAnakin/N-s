import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The service worker's caching policy, driven for real.
 *
 * `public/sw.js` is a classic worker script — no imports, no build step —
 * so it cannot simply be imported. It is instead evaluated against a fake
 * worker global, which means these tests exercise the shipped file rather
 * than a copy of its rules that could drift away from it.
 *
 * What is being protected here is not performance. It is the promise that
 * nothing private is ever written to disk by this app: no row, no
 * photograph, no signed URL, nothing carrying a token. A cached API
 * response would outlive a sign-out, which is the one failure the rest of
 * this codebase is built to avoid.
 */

const SOURCE = readFileSync('public/sw.js', 'utf8');
const ORIGIN = 'https://nos.example';

/**
 * A response shaped like the one a real worker sees.
 *
 * A same-origin fetch inside a service worker yields `type: 'basic'`, and
 * the worker checks for exactly that — it is how an opaque cross-origin
 * response gets refused. Node's `Response` reports `'default'`, so without
 * this the fake would fail a check the production code passes.
 */
function basic(body: string, init?: ResponseInit): Response {
  return Object.defineProperty(new Response(body, init), 'type', { value: 'basic' });
}

interface Harness {
  handlers: Map<string, (event: any) => void>;
  cache: Map<string, Response>;
  fetchMock: ReturnType<typeof vi.fn>;
  /** Every cache name the worker has opened or been shown. */
  names: Set<string>;
}

/** Evaluates the real worker against a stubbed global scope. */
function boot(fetchImpl?: (request: Request) => Promise<Response>): Harness {
  const handlers = new Map<string, (event: any) => void>();
  const cache = new Map<string, Response>();
  const names = new Set<string>(['nos-static-OLD']);

  const fetchMock = vi.fn(
    fetchImpl ?? (() => Promise.resolve(basic('fresh', { status: 200 }))),
  );

  const cacheApi = {
    open: (name: string) => {
      names.add(name);
      return Promise.resolve({
        addAll: (requests: Request[]) => {
          for (const request of requests) cache.set(new URL(request.url).pathname, new Response(''));
          return Promise.resolve();
        },
        put: (key: Request | string, value: Response) => {
          cache.set(typeof key === 'string' ? key : new URL(key.url).pathname, value);
          return Promise.resolve();
        },
      });
    },
    match: (key: Request | string) =>
      Promise.resolve(cache.get(typeof key === 'string' ? key : new URL(key.url).pathname)),
    keys: () => Promise.resolve([...names]),
    delete: (name: string) => {
      names.delete(name);
      return Promise.resolve(true);
    },
  };

  const self = {
    addEventListener: (type: string, handler: (event: any) => void) => {
      handlers.set(type, handler);
    },
    location: new URL(ORIGIN),
    clients: { claim: () => Promise.resolve() },
    skipWaiting: () => Promise.resolve(),
  };

  /**
   * Node's `Request` refuses a relative URL; a real worker resolves one
   * against its own scope. The worker's precache list is written in
   * relative paths, as it should be, so the fake has to do the resolving.
   */
  const RequestInScope = new Proxy(Request, {
    construct: (target, args: [RequestInfo, RequestInit?]) => {
      const [input, init] = args;
      const resolved =
        typeof input === 'string' ? new URL(input, ORIGIN).toString() : input;
      return new target(resolved, init);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'caches', 'fetch', 'Request', SOURCE)(
    self,
    cacheApi,
    fetchMock,
    RequestInScope,
  );

  return { handlers, cache, fetchMock, names };
}

/** Drives the fetch handler and returns what it decided to do, if anything. */
async function handleFetch(
  harness: Harness,
  request: Request,
): Promise<Response | 'not intercepted'> {
  // Collected rather than assigned: TypeScript cannot see that the
  // callback runs, so a plain `let` narrows to `null` and awaiting it
  // becomes a type error about awaiting a non-promise.
  const responses: Promise<Response>[] = [];
  harness.handlers.get('fetch')!({
    request,
    respondWith: (value: Promise<Response>) => responses.push(value),
  });

  // `responses.length`, not the promise itself: truthiness-testing a
  // promise is exactly the mistake `no-misused-promises` exists to catch,
  // and it is always true.
  if (responses.length === 0) return 'not intercepted';
  return await responses[0];
}

const asset = (path: string, destination = 'script') =>
  Object.defineProperty(new Request(`${ORIGIN}${path}`), 'destination', {
    value: destination,
  });

let harness: Harness;
beforeEach(() => {
  harness = boot();
});

describe('what it refuses to touch', () => {
  it('never intercepts Supabase at all', async () => {
    const request = Object.defineProperty(
      new Request('https://nhzcxiitmxzkuvoqwhkn.supabase.co/rest/v1/expenses'),
      'destination',
      { value: '' },
    );
    expect(await handleFetch(harness, request)).toBe('not intercepted');
    expect(harness.cache.size).toBe(0);
  });

  it('never intercepts a photograph coming out of Storage', async () => {
    const request = Object.defineProperty(
      new Request('https://nhzcxiitmxzkuvoqwhkn.supabase.co/storage/v1/object/sign/photos/a.jpg'),
      'destination',
      { value: 'image' },
    );
    expect(await handleFetch(harness, request)).toBe('not intercepted');
    expect(harness.cache.size).toBe(0);
  });

  it('never caches anything carrying a token', async () => {
    const request = Object.defineProperty(
      new Request(`${ORIGIN}/assets/app.js`, {
        headers: { authorization: 'Bearer something' },
      }),
      'destination',
      { value: 'script' },
    );
    expect(await handleFetch(harness, request)).toBe('not intercepted');
  });

  it('never caches a query string, which is where a signed URL lives', async () => {
    expect(await handleFetch(harness, asset('/assets/app.js?token=abc'))).toBe(
      'not intercepted',
    );
  });

  it('never caches a write', async () => {
    const post = Object.defineProperty(
      new Request(`${ORIGIN}/assets/app.js`, { method: 'POST' }),
      'destination',
      { value: 'script' },
    );
    expect(await handleFetch(harness, post)).toBe('not intercepted');
  });

  /**
   * The rule is written as refusals so that anything unforeseen is
   * excluded by default. A `fetch` from application code — which is what
   * every private request in this app is — has no static destination and
   * must fall through untouched.
   */
  it('refuses a destination it was never told about', async () => {
    for (const destination of ['', 'audio', 'video', 'object', 'embed']) {
      expect(await handleFetch(harness, asset('/whatever', destination))).toBe(
        'not intercepted',
      );
    }
  });
});

describe('what it does cache', () => {
  it('serves an asset from the network once, then from disk', async () => {
    const request = asset('/assets/app-abc123.js');

    const first = await handleFetch(harness, request);
    expect(first).not.toBe('not intercepted');
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
    expect(harness.cache.has('/assets/app-abc123.js')).toBe(true);

    await handleFetch(harness, asset('/assets/app-abc123.js'));
    // Still one: the second went to the cache.
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('takes the stylesheet, the fonts and the icons too', async () => {
    for (const [path, destination] of [
      ['/assets/index-abc.css', 'style'],
      ['/fonts/karla.woff2', 'font'],
      ['/icon-192.png', 'image'],
      ['/manifest.webmanifest', 'manifest'],
    ] as const) {
      harness = boot();
      expect(await handleFetch(harness, asset(path, destination))).not.toBe(
        'not intercepted',
      );
      expect(harness.cache.has(path)).toBe(true);
    }
  });

  it('does not keep a failure, so a bad deploy cannot become permanent', async () => {
    harness = boot(() => Promise.resolve(basic('nope', { status: 404 })));
    await handleFetch(harness, asset('/assets/gone.js'));
    expect(harness.cache.has('/assets/gone.js')).toBe(false);
  });
});

describe('a navigation', () => {
  const navigation = () =>
    Object.defineProperty(new Request(`${ORIGIN}/spending`), 'mode', { value: 'navigate' });

  it('goes to the network first, because index.html names the chunks', async () => {
    const response = await handleFetch(harness, navigation());
    expect(response).not.toBe('not intercepted');
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
    // Kept under '/', so any path can be served from it offline.
    expect(harness.cache.has('/')).toBe(true);
  });

  it('falls back to the cached shell when there is no signal', async () => {
    harness = boot(() => Promise.reject(new Error('offline')));
    harness.cache.set('/', basic('<!doctype html>the shell'));

    const response = (await handleFetch(harness, navigation())) as Response;
    expect(await response.text()).toContain('the shell');
  });

  it('gives up honestly when there is nothing cached either', async () => {
    harness = boot(() => Promise.reject(new Error('offline')));
    await expect(handleFetch(harness, navigation())).rejects.toThrow(/offline/i);
  });
});

describe('between deploys', () => {
  it('deletes every cache that is not the current one', async () => {
    // Seeded by the fake, and standing in for a previous build's chunks.
    // Serving those against a new index.html is the classic way a deploy
    // half-lands: the HTML names files the cache does not have.
    expect(harness.names.has('nos-static-OLD')).toBe(true);

    // The real lifecycle, in order: install opens the current cache and
    // precaches the shell, then activate sweeps everything else away.
    // Running activate alone would delete the old one and prove nothing
    // about whether the new one survives.
    let installed: Promise<unknown> = Promise.resolve();
    harness.handlers.get('install')!({
      waitUntil: (promise: Promise<unknown>) => {
        installed = promise;
      },
    });
    await installed;
    expect(harness.cache.has('/')).toBe(true);

    let settled: Promise<unknown> = Promise.resolve();
    harness.handlers.get('activate')!({
      waitUntil: (promise: Promise<unknown>) => {
        settled = promise;
      },
    });
    await settled;

    expect(harness.names.has('nos-static-OLD')).toBe(false);
    expect([...harness.names]).toEqual([expect.stringMatching(/^nos-static-/)]);
  });

  it('does not take over mid-session on its own', () => {
    // No `skipWaiting()` at install: a worker that swaps the chunks under
    // a half-written letter is worse than one that waits for a tab to
    // close. It is offered only on an explicit message.
    const install = SOURCE.slice(SOURCE.indexOf("addEventListener('install'"));
    const untilActivate = install.slice(0, install.indexOf("addEventListener('activate'"));
    expect(untilActivate).not.toContain('skipWaiting');
    expect(SOURCE).toContain("event.data === 'skip-waiting'");
  });
});
