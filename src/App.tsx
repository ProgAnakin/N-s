import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingBlock } from '@/components/ui/Bits';
import { SessionProvider, useSession } from '@/data/session';
import { I18nProvider, type LocaleCode } from '@/i18n';
import { ThemeProvider } from '@/theme';
import { AuthScreen } from '@/screens/AuthScreen';
import { NotConfiguredScreen } from '@/screens/NotConfiguredScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { VaultScreen } from '@/screens/VaultScreen';
import { DatesScreen } from '@/screens/DatesScreen';
import { MemoriesScreen } from '@/screens/MemoriesScreen';
import { FamilyScreen } from '@/screens/FamilyScreen';
import { PhrasebookScreen } from '@/screens/PhrasebookScreen';
import { CultureScreen } from '@/screens/CultureScreen';
import { TripsScreen } from '@/screens/TripsScreen';
import { TripDetailScreen } from '@/screens/TripDetailScreen';
import { SpendingScreen } from '@/screens/SpendingScreen';
import { GiftsScreen } from '@/screens/GiftsScreen';
import { DistanceScreen } from '@/screens/DistanceScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';

/**
 * The gate.
 *
 * Four states before the app proper: no credentials, still checking, signed
 * out, and signed in but not yet paired. Each gets a whole screen rather than
 * a banner, because each one has exactly one thing you should do next.
 */
function Gate() {
  const { status, profile } = useSession();

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
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomeScreen />} />
          <Route path="vault" element={<VaultScreen />} />
          <Route path="dates" element={<DatesScreen />} />
          <Route path="memories" element={<MemoriesScreen />} />
          <Route path="family" element={<FamilyScreen />} />
          <Route path="phrasebook" element={<PhrasebookScreen />} />
          <Route path="culture" element={<CultureScreen />} />
          <Route path="trips" element={<TripsScreen />} />
          <Route path="trips/:tripId" element={<TripDetailScreen />} />
          <Route path="spending" element={<SpendingScreen />} />
          <Route path="gifts" element={<GiftsScreen />} />
          <Route path="distance" element={<DistanceScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </I18nProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider locale="en">
        <BrowserRouter>
          <SessionProvider>
            <Gate />
          </SessionProvider>
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  );
}
