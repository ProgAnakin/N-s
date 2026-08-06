import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LazyMotion, domAnimation } from 'framer-motion';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/theme';
import { SessionProvider, useSession } from '@/data/session';
import type { CoupleRow, ProfileRow } from '@/data/database.types';
import { FakeSupabase } from './fake-supabase';
import { setFakeClient } from './client-mock';

/**
 * Mounts real screens against a fake database.
 *
 * Everything here goes through the app's actual providers and the app's
 * actual session, so a test exercises the same code path a tap does: the
 * component fires a write, the session applies it optimistically, the fake
 * either accepts or refuses, and the interface reacts. Nothing is stubbed at
 * the component boundary, because a stub there is exactly where a bug like
 * "the control renders but never persists" hides.
 */

export const HIM_ID = '11111111-1111-4111-8111-111111111111';
export const HER_ID = '22222222-2222-4222-8222-222222222222';
export const COUPLE_ID = '33333333-3333-4333-8333-333333333333';

export function makeProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: HIM_ID,
    couple_id: COUPLE_ID,
    display_name: 'Léo',
    role: 'partner_a',
    avatar_path: null,
    locale: 'en',
    auto_checkin: false,
    time_zone: 'America/Sao_Paulo',
    awake_start: 8,
    awake_end: 23,
    pinned: [],
    nudges: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeCouple(overrides: Partial<CoupleRow> = {}): CoupleRow {
  return {
    id: COUPLE_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    couple_name: 'Léo & Yan',
    anniversary_date: '2023-06-12',
    currency: 'EUR',
    invite_code: 'ABC123',
    distance_mode: true,
    reunion_date: null,
    reunion_note: null,
    intimacy_mode: false,
    week_starts_on: 1,
    accent: 'cinnabar',
    seal_text: null,
    created_by: HIM_ID,
    ...overrides,
  };
}

export interface Scene {
  db: FakeSupabase;
  view: RenderResult;
}

/**
 * A signed-in, paired couple, with both profiles present.
 *
 * The session loads asynchronously from the fake exactly as it does from the
 * real client, so callers await `screen.findBy…` rather than getting a
 * synchronously-populated context that would never exist in production.
 */
export function mountSignedIn(
  ui: ReactNode,
  options: {
    profile?: Partial<ProfileRow>;
    couple?: Partial<CoupleRow>;
    partner?: Partial<ProfileRow> | null;
    seed?: (db: FakeSupabase) => void;
  } = {},
): Scene {
  const profile = makeProfile(options.profile);
  const couple = makeCouple(options.couple);
  const partner =
    options.partner === null
      ? null
      : makeProfile({
          id: HER_ID,
          display_name: 'Yan',
          role: 'partner_b',
          time_zone: 'Asia/Shanghai',
          ...options.partner,
        });

  const db = new FakeSupabase();
  db.seed('profiles', partner ? [profile, partner] : [profile]);
  db.seed('couples', [couple]);
  options.seed?.(db);

  setFakeClient(db);

  db.signedInUser = { id: profile.id, email: 'leo@example.com' };

  const view = render(
    <ThemeProvider>
      <LazyMotion features={domAnimation} strict>
        <I18nProvider locale="en">
          <MemoryRouter>
            <SessionProvider>
              <WhenReady>{ui}</WhenReady>
            </SessionProvider>
          </MemoryRouter>
        </I18nProvider>
      </LazyMotion>
    </ThemeProvider>,
  );

  return { db, view };
}

/**
 * Holds the screen back until the couple has loaded.
 *
 * This is not test convenience — it is what the router does. Feature screens
 * call `useCouple()`, which throws rather than returning a half-built couple,
 * and they are only ever mounted behind the gate's `status === 'ready'`
 * check. A harness that mounted them earlier would be testing a state the app
 * never puts them in.
 */
function WhenReady({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status !== 'ready') return null;
  return <>{children}</>;
}

/**
 * Signed in, but not yet part of a couple — where onboarding happens.
 *
 * The profile row exists (auth created it) and carries no `couple_id`, which
 * is exactly the state the gate routes to the onboarding screen.
 */
export function mountUnpaired(ui: ReactNode): Scene {
  const profile = makeProfile({ couple_id: null, role: null });

  const db = new FakeSupabase();
  db.seed('profiles', [profile]);
  db.seed('couples', []);
  setFakeClient(db);
  db.signedInUser = { id: profile.id, email: 'leo@example.com' };

  const view = render(
    <ThemeProvider>
      <LazyMotion features={domAnimation} strict>
        <I18nProvider locale="en">
          <MemoryRouter>
            <SessionProvider>
              <WhenStatus is="no_couple">{ui}</WhenStatus>
            </SessionProvider>
          </MemoryRouter>
        </I18nProvider>
      </LazyMotion>
    </ThemeProvider>,
  );

  return { db, view };
}

function WhenStatus({ is, children }: { is: string; children: ReactNode }) {
  const { status } = useSession();
  if (status !== is) return null;
  return <>{children}</>;
}

/** The write a test is asking about, or undefined — for a clear failure message. */
export function lastWriteTo(db: FakeSupabase, table: string) {
  return [...db.writes].reverse().find((write) => write.table === table);
}
