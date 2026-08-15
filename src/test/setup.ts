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
