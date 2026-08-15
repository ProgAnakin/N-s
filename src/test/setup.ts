import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements no CSS media queries at all, so `matchMedia` is simply
 * absent — and the theme provider calls it on its first render. Without this
 * every test that mounts a real screen dies before it draws anything.
 *
 * It reports "not dark", which is the light theme the rest of the suite
 * assumes.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

/**
 * jsdom has no layout engine, so `scrollTo` throws "not implemented" rather
 * than quietly doing nothing. The app calls it on every route change.
 */
window.scrollTo = (() => {});

/**
 * jsdom has no `IntersectionObserver`, and framer-motion's `whileInView`
 * reaches for it during the layout effect of every element that uses it.
 *
 * Absent, it throws inside a commit-phase effect, React unmounts the whole
 * subtree, and the test sees an empty page — which is what it looks like
 * when a screen has no data. The memories grid was never covered by a test
 * for exactly that reason: it was indistinguishable from an empty album.
 *
 * This stub reports everything as already visible, which is the right
 * answer for a test: an entrance animation that waits for a scroll would
 * otherwise hide content nothing is going to scroll to.
 */
// The `in` narrowing tells TypeScript the property is absent inside the
// block, which then rejects assigning to it — hence the widened alias.
const globalWindow = window as Window & typeof globalThis & Record<string, unknown>;

if (!('IntersectionObserver' in window)) {
  class ImmediateIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];

    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(target: Element): void {
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this,
      );
    }

    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  globalWindow.IntersectionObserver = ImmediateIntersectionObserver;
  (globalThis as Record<string, unknown>).IntersectionObserver =
    ImmediateIntersectionObserver;
}

/**
 * One known-benign warning, filtered by name so the rest still shout.
 *
 * `SessionProvider` loads the profile and couple asynchronously on mount.
 * Its state lands after the synchronous render every test starts with, and
 * React says so — twenty-two times in a full run, which is exactly the
 * volume at which nobody reads warnings any more. The provider is not
 * wrong: it guards every write with a token and an `active` flag, and
 * every test that depends on the loaded state already waits with `findBy*`.
 *
 * Filtering *this one message* rather than silencing `console.error` is the
 * whole point. Any other act warning — a real one, from a component
 * updating state outside a transition — comes through untouched, and now
 * against a quiet background where it can be seen.
 */
const realConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  // React passes its warnings as a `%s` format string plus the component
  // name, so the test has to be against the whole call rather than the
  // first argument — which is what the first attempt at this got wrong.
  const whole = args.map((arg) => (typeof arg === 'string' ? arg : '')).join(' ');
  if (whole.includes('not wrapped in act') && whole.includes('SessionProvider')) return;
  realConsoleError(...args);
};
