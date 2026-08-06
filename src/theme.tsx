import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'nos.theme';

interface ThemeValue {
  preference: ThemePreference;
  /** What is actually on screen right now. */
  resolved: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue>({
  preference: 'system',
  resolved: 'light',
  setPreference: () => {},
});

function readStored(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  const resolved: 'light' | 'dark' =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#17140F' : '#FBF7F0');
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A theme that does not persist is a small loss; crashing is a big one.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

export const ACCENTS = ['cinnabar', 'jade', 'amber', 'ink'] as const;
export type Accent = (typeof ACCENTS)[number];

const ACCENT_KEY = 'nos.accent';

function applyAccent(accent: Accent): void {
  // Cinnabar is what the tokens already say, so it needs no attribute — and
  // leaving it off means a couple who never touch this setting are not
  // paying for a selector match on every element.
  if (accent === 'cinnabar') delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = accent;
}

/**
 * Paints the last known accent before React has rendered anything.
 *
 * The accent is a property of the couple, which means it is not known until
 * the profile request comes back — a second or so on a cold connection, all
 * of it spent showing the wrong colour and then flipping. Remembering the
 * last one locally makes the common case (same device, same couple) paint
 * correctly on the first frame. It is a cache, not the truth: the moment
 * the couple loads, the real value wins.
 */
export function primeAccent(): void {
  try {
    const stored = window.localStorage.getItem(ACCENT_KEY);
    if (stored && (ACCENTS as readonly string[]).includes(stored)) applyAccent(stored as Accent);
  } catch {
    // Private mode, or a store that refuses. The colour is not worth a crash.
  }
}

/**
 * The couple's accent, applied as an attribute on the root element.
 *
 * It lives in the DOM rather than in React state because every colour in
 * the app already resolves through CSS custom properties — one attribute
 * repaints the lot, and no component needs to know it changed.
 *
 * It is a couple-level setting, not a per-person one: the two of them are
 * looking at the same shelf, and it should look like the same shelf.
 */
export function AccentProvider({ accent, children }: { accent: Accent; children: ReactNode }) {
  useEffect(() => {
    applyAccent(accent);
    try {
      window.localStorage.setItem(ACCENT_KEY, accent);
    } catch {
      // See above — an accent that does not persist costs one flash.
    }
  }, [accent]);

  return <>{children}</>;
}
