import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { errorCode, isConfigured, PG_ERRORS, requireClient, supabase } from './client';
import type { CoupleRow, CurrencyColumn, ProfileRow } from './database.types';
import type { PartnerRole } from '@/lib/money';

export type SessionStatus =
  | 'loading'
  | 'unconfigured'
  | 'signed_out'
  /** Signed in, but not yet part of a couple: create a space or join one. */
  | 'no_couple'
  | 'ready';

export class PairingError extends Error {
  constructor(public readonly reason: 'invalid' | 'full' | 'already_paired' | 'unknown') {
    super(reason);
    this.name = 'PairingError';
  }
}

interface SessionValue {
  status: SessionStatus;
  user: User | null;
  profile: ProfileRow | null;
  couple: CoupleRow | null;
  partner: ProfileRow | null;
  /** The signed-in person's role. Defaults to partner_a before pairing completes. */
  role: PartnerRole;
  currency: CurrencyColumn;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  /**
   * Returns the new couple without switching the app over, so onboarding can
   * show the invite code before handing off. Call `reload()` to go in.
   */
  createCouple: (input: {
    coupleName: string | null;
    anniversary: string | null;
    currency: CurrencyColumn;
  }) => Promise<CoupleRow>;
  joinCouple: (inviteCode: string) => Promise<void>;
  rotateInviteCode: () => Promise<string>;
  updateProfile: (
    values: Partial<Pick<ProfileRow, 'display_name' | 'avatar_path' | 'locale' | 'auto_checkin'>>,
  ) => Promise<void>;
  updateCouple: (
    values: Partial<
      Pick<
        CoupleRow,
        | 'couple_name'
        | 'anniversary_date'
        | 'currency'
        | 'distance_mode'
        | 'reunion_date'
        | 'reunion_note'
        | 'intimacy_mode'
      >
    >,
  ) => Promise<void>;
  reload: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(isConfigured ? 'loading' : 'unconfigured');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [couple, setCouple] = useState<CoupleRow | null>(null);
  const [partner, setPartner] = useState<ProfileRow | null>(null);

  // Guards against a slow response from a previous user landing in state
  // after a fast sign-out or account switch.
  const loadToken = useRef(0);

  const loadFor = useCallback(async (nextUser: User | null) => {
    const token = ++loadToken.current;
    const settled = () => token === loadToken.current;

    if (!nextUser) {
      if (settled()) {
        setUser(null);
        setProfile(null);
        setCouple(null);
        setPartner(null);
        setStatus('signed_out');
      }
      return;
    }

    const client = requireClient();
    if (settled()) setUser(nextUser);

    const { data: profileRow } = await client
      .from('profiles')
      .select('*')
      .eq('id', nextUser.id)
      .maybeSingle();

    if (!settled()) return;
    setProfile(profileRow ?? null);

    if (!profileRow?.couple_id) {
      setCouple(null);
      setPartner(null);
      setStatus('no_couple');
      return;
    }

    const [coupleResult, membersResult] = await Promise.all([
      client.from('couples').select('*').eq('id', profileRow.couple_id).maybeSingle(),
      client.from('profiles').select('*').eq('couple_id', profileRow.couple_id),
    ]);

    if (!settled()) return;
    setCouple(coupleResult.data ?? null);
    setPartner((membersResult.data ?? []).find((row) => row.id !== nextUser.id) ?? null);
    setStatus(coupleResult.data ? 'ready' : 'no_couple');
  }, []);

  useEffect(() => {
    if (!isConfigured || !supabase) {
      setStatus('unconfigured');
      return;
    }
    const client = supabase;
    let active = true;

    void client.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (active) void loadFor(data.session?.user ?? null);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (active) void loadFor(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadFor]);

  const reload = useCallback(async () => {
    const client = requireClient();
    const { data } = await client.auth.getUser();
    await loadFor(data.user ?? null);
  }, [loadFor]);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = requireClient();
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const client = requireClient();
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (error) throw error;
    // With email confirmation switched on, Supabase returns a user but no
    // session — the caller shows "check your email" rather than a blank app.
    return { needsConfirmation: Boolean(data.user) && !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const client = requireClient();
    await client.auth.signOut();
    await loadFor(null);
  }, [loadFor]);

  const createCouple = useCallback<SessionValue['createCouple']>(
    async ({ coupleName, anniversary, currency }) => {
      const client = requireClient();
      const { data, error } = await client.rpc('create_couple', {
        p_couple_name: coupleName,
        p_anniversary_date: anniversary,
        p_currency: currency,
      });
      if (error || !data) {
        throw new PairingError(
          errorCode(error) === PG_ERRORS.alreadyPaired ? 'already_paired' : 'unknown',
        );
      }
      return data;
    },
    [],
  );

  const joinCouple = useCallback(
    async (inviteCode: string) => {
      const client = requireClient();
      const { error } = await client.rpc('join_couple', {
        p_invite_code: inviteCode.trim().toUpperCase(),
      });
      if (error) {
        const code = errorCode(error);
        throw new PairingError(
          code === PG_ERRORS.inviteNotFound
            ? 'invalid'
            : code === PG_ERRORS.coupleFull
              ? 'full'
              : code === PG_ERRORS.alreadyPaired
                ? 'already_paired'
                : 'unknown',
        );
      }
      await reload();
    },
    [reload],
  );

  const rotateInviteCode = useCallback(async () => {
    const client = requireClient();
    const { data, error } = await client.rpc('rotate_invite_code');
    if (error) throw error;
    await reload();
    return data ?? '';
  }, [reload]);

  const updateProfile = useCallback<SessionValue['updateProfile']>(
    async (values) => {
      const client = requireClient();
      if (!profile) return;
      const { error } = await client.from('profiles').update(values).eq('id', profile.id);
      if (error) throw error;
      setProfile({ ...profile, ...values });
    },
    [profile],
  );

  const updateCouple = useCallback<SessionValue['updateCouple']>(
    async (values) => {
      const client = requireClient();
      if (!couple) return;
      const { error } = await client.from('couples').update(values).eq('id', couple.id);
      if (error) throw error;
      setCouple({ ...couple, ...values });
    },
    [couple],
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      profile,
      couple,
      partner,
      role: profile?.role ?? 'partner_a',
      currency: couple?.currency ?? 'EUR',
      signIn,
      signUp,
      signOut,
      createCouple,
      joinCouple,
      rotateInviteCode,
      updateProfile,
      updateCouple,
      reload,
    }),
    [
      status,
      user,
      profile,
      couple,
      partner,
      signIn,
      signUp,
      signOut,
      createCouple,
      joinCouple,
      rotateInviteCode,
      updateProfile,
      updateCouple,
      reload,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

/**
 * For screens behind the auth gate, where a couple is guaranteed to exist.
 * Saves every feature screen from re-checking what the router already knows.
 */
export function useCouple(): { couple: CoupleRow; profile: ProfileRow; role: PartnerRole } {
  const { couple, profile, role } = useSession();
  if (!couple || !profile) {
    throw new Error('useCouple must be used inside a paired route');
  }
  return { couple, profile, role };
}
