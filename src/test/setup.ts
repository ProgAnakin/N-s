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
window.scrollTo = (() => {}) as typeof window.scrollTo;
