import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Reads one build-time variable.
 *
 * Strips surrounding quotes, because pasting `"https://…"` into a hosting
 * dashboard's env var field is easy to do and produces a value that looks
 * right in the UI but is wrong in the bundle.
 */
function readEnv(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^["']|["']$/g, '').trim() || undefined;
}

const url = readEnv(import.meta.env.VITE_SUPABASE_URL);

/**
 * The Supabase publishable ("anon") key.
 *
 * Named without a `KEY` suffix because hosting dashboards warn when a
 * browser-exposed variable looks like a secret. The warning does not apply to
 * this value — it is public by design, ships inside the bundle of every
 * Supabase app, and grants only what Row Level Security allows — but there is
 * nothing to gain from arguing with it over a name.
 *
 * Exactly one name is accepted, on purpose. Alternatives would only widen the
 * set of spellings that silently do nothing, which is the failure this whole
 * file is trying to make impossible to sit in.
 */
const anonKey = readEnv(import.meta.env.VITE_SUPABASE_ANON);

/**
 * Whether the app has real credentials to talk to.
 *
 * The placeholder check matters: copying `.env.example` to `.env` and
 * forgetting to fill it in is the most likely first-run mistake, and a clear
 * setup screen beats a wall of failed network requests.
 */
export const isConfigured = Boolean(
  url && anonKey && !url.includes('your-project-ref') && !anonKey.startsWith('your-'),
);

/**
 * What the build actually received, for the setup screen to display.
 *
 * `VITE_*` values are inlined at build time, so "I saved them in the
 * dashboard" and "they are in the bundle" are different facts — and the gap
 * between the two is the single most common way to get stuck here. Showing
 * the truth beats guessing which of the two names was mistyped.
 *
 * Nothing secret is exposed: the project URL is public, and the anon key is
 * public by design and already ships inside the bundle of any working
 * deployment. Only a short prefix of it is shown, which is enough to tell an
 * `eyJ…` JWT from a `sb_publishable_…` key from a pasted mistake.
 */
export const configStatus = {
  url: url ?? null,
  anonKeyPresent: Boolean(anonKey),
  anonKeyLength: anonKey?.length ?? 0,
  anonKeyPrefix: anonKey ? `${anonKey.slice(0, 8)}…` : null,
  /**
   * Every `VITE_*` name this build received.
   *
   * A missing variable and a misspelled one look identical from the outside,
   * and reading a name off a dashboard screenshot is how you end up chasing
   * the same typo twice. Listing what actually arrived turns the guess into
   * something you can read. Names only — never values, since an unexpected
   * name is exactly the case where you cannot assume the value is harmless.
   */
  receivedNames: Object.keys(import.meta.env)
    .filter((name) => name.startsWith('VITE_'))
    .sort(),
} as const;

export type Client = SupabaseClient<Database>;

let client: Client | null = null;

if (isConfigured) {
  client = createClient<Database>(url!, anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/**
 * The client, or null when unconfigured. Screens behind the auth gate can use
 * `requireClient()` instead and skip the null check — nothing renders there
 * until configuration has already been verified.
 */
export const supabase = client;

export function requireClient(): Client {
  if (!client) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON.',
    );
  }
  return client;
}

/** Postgres error codes raised on purpose by the pairing functions in 0002. */
export const PG_ERRORS = {
  alreadyPaired: 'P0001',
  inviteNotFound: 'P0002',
  coupleFull: 'P0003',
} as const;

interface MaybePostgrestError {
  code?: string;
  message?: string;
}

export function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as MaybePostgrestError).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

export function errorMessage(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as MaybePostgrestError).message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}
