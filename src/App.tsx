import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LazyMotion } from 'framer-motion';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingBlock } from '@/components/ui/Bits';
import { SessionProvider, useSession } from '@/data/session';
import { I18nProvider, type LocaleCode } from '@/i18n';
import { AccentProvider, ThemeProvider, type Accent } from '@/theme';
import { AuthScreen } from '@/screens/AuthScreen';
import { NotConfiguredScreen } from '@/screens/NotConfiguredScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { HomeScreen } from '@/screens/HomeScreen';

/**
 * Everything past Home arrives on demand.
 *
 * There are sixteen destinations and nobody opens sixteen. Parsing the
 * phrasebook and the trip planner on the way to the front page is work paid
 * for on a phone, on mobile data, by somebody who only wanted to see the
 * countdown. Home stays eager because it is what the gate lands on, and a
 * fallback there would be a spinner on launch.
 */
const lazyScreen = <T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) =>
  lazy(async () => ({ default: (await load())[name] }));

const VaultScreen = lazyScreen(() => import('@/screens/VaultScreen'), 'VaultScreen');
const DatesScreen = lazyScreen(() => import('@/screens/DatesScreen'), 'DatesScreen');
const MemoriesScreen = lazyScreen(() => import('@/screens/MemoriesScreen'), 'MemoriesScreen');
const FamilyScreen = lazyScreen(() => import('@/screens/FamilyScreen'), 'FamilyScreen');
const PhrasebookScreen = lazyScreen(() => import('@/screens/PhrasebookScreen'), 'PhrasebookScreen');
const CultureScreen = lazyScreen(() => import('@/screens/CultureScreen'), 'CultureScreen');
const TripsScreen = lazyScreen(() => import('@/screens/TripsScreen'), 'TripsScreen');
const TripDetailScreen = lazyScreen(() => import('@/screens/TripDetailScreen'), 'TripDetailScreen');
const SpendingScreen = lazyScreen(() => import('@/screens/SpendingScreen'), 'SpendingScreen');
const GiftsScreen = lazyScreen(() => import('@/screens/GiftsScreen'), 'GiftsScreen');
const DistanceScreen = lazyScreen(() => import('@/screens/DistanceScreen'), 'DistanceScreen');
const CalendarScreen = lazyScreen(() => import('@/screens/CalendarScreen'), 'CalendarScreen');
const TogetherScreen = lazyScreen(() => import('@/screens/TogetherScreen'), 'TogetherScreen');
const LettersScreen = lazyScreen(() => import('@/screens/LettersScreen'), 'LettersScreen');
const SettingsScreen = lazyScreen(() => import('@/screens/SettingsScreen'), 'SettingsScreen');

/**
 * The gap while a route's code arrives.
 *
 * Deliberately not a spinner. On a warm cache the chunk is there in a few
 * milliseconds and a spinner would do nothing but flash; this holds enough
 * height that the page does not jump, and says nothing.
 */
function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-[60dvh]" aria-busy="true" />}>{children}</Suspense>
  );
}

/**
 * The gate.
 *
 * Four states before the app proper: no credentials, still checking, signed
 * out, and signed in but not yet paired. Each gets a whole screen rather than
 * a banner, because each one has exactly one thing you should do next.
 */
function Gate() {
  const { status, profile, couple } = useSession();

  if (status === 'unconfigured') return <NotConfiguredScreen />;
  if (status === 'loading') {
    return (
      <div className="grain flex min-h-dvh items-center justify-center bg-paper">
        <LoadingBlock />
      </div>
    );
  }
  if (status === 'signed_out') return <AuthScreen />;
  if (status === 'no_couple') return <OnboardingScreen />;

  return (
    <I18nProvider locale={(profile?.locale as LocaleCode) ?? 'en'}>
      <AccentProvider accent={(couple?.accent as Accent) ?? 'cinnabar'}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomeScreen />} />
            <Route path="vault" element={<Lazy><VaultScreen /></Lazy>} />
            <Route path="dates" element={<Lazy><DatesScreen /></Lazy>} />
            <Route path="memories" element={<Lazy><MemoriesScreen /></Lazy>} />
            <Route path="family" element={<Lazy><FamilyScreen /></Lazy>} />
            <Route path="phrasebook" element={<Lazy><PhrasebookScreen /></Lazy>} />
            <Route path="culture" element={<Lazy><CultureScreen /></Lazy>} />
            <Route path="trips" element={<Lazy><TripsScreen /></Lazy>} />
            <Route path="trips/:tripId" element={<Lazy><TripDetailScreen /></Lazy>} />
            <Route path="spending" element={<Lazy><SpendingScreen /></Lazy>} />
            <Route path="gifts" element={<Lazy><GiftsScreen /></Lazy>} />
            <Route path="calendar" element={<Lazy><CalendarScreen /></Lazy>} />
            <Route path="together" element={<Lazy><TogetherScreen /></Lazy>} />
            <Route path="letters" element={<Lazy><LettersScreen /></Lazy>} />
            <Route path="distance" element={<Lazy><DistanceScreen /></Lazy>} />
            <Route path="settings" element={<Lazy><SettingsScreen /></Lazy>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AccentProvider>
    </I18nProvider>
  );
}

/**
 * Framer Motion's animation engine, fetched after the page is interactive.
 *
 * The full `motion` component drags the whole feature set into the entry
 * bundle whether or not a page animates. `LazyMotion` with `m` splits it:
 * the components ship as markup, and the engine arrives in its own chunk.
 *
 * `strict` turns a stray `motion.div` into a thrown error rather than a
 * silent re-inclusion of the thing this just removed.
 */
const animationFeatures = () => import('@/motion-features').then((mod) => mod.default);

export default function App() {
  return (
    <ThemeProvider>
      <LazyMotion features={animationFeatures} strict>
        <I18nProvider locale="en">
          <BrowserRouter>
            <SessionProvider>
              <Gate />
            </SessionProvider>
          </BrowserRouter>
        </I18nProvider>
      </LazyMotion>
    </ThemeProvider>
  );
}
