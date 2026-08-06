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

/**
 * The Supabase project this app talks to.
 *
 * Committed rather than configured, on purpose. This is a keepsake for one
 * couple pointing at one project, and the value is a public hostname: it is
 * in the URL of every request the app makes and ships inside the bundle
 * whether it comes from here or from an env var.
 *
 * Treating it as configuration bought nothing and cost real time. It doubled
 * the setup surface, and because a `VITE_*` value is invisible until a build
 * finishes, a mistyped name fails silently and looks identical to a missing
 * one. The anon key stays in the environment — it is equally public, but a
 * committed key in a public repository invites drive-by sign-ups.
 *
 * `VITE_SUPABASE_URL` still wins when set, so pointing a fork at a different
 * project needs no code change.
 */
const DEFAULT_PROJECT_URL = 'https://nhzcxiitmxzkuvoqwhkn.supabase.co';

const url = readEnv(import.meta.env.VITE_SUPABASE_URL) ?? DEFAULT_PROJECT_URL;

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
export const isConfigured = Boolean(anonKey && !anonKey.startsWith('your-'));

/**
 * What the build actually received, for the setup screen to display.
 *
 * `VITE_*` values are inlined at build time, so "I saved it in the dashboard"
 * and "it is in the bundle" are different facts — and the gap between them is
 * the most common way to get stuck here. Showing the truth beats guessing.
 *
 * Nothing secret is exposed. The anon key is public by design and already
 * ships inside the bundle of any working deployment; only a short prefix is
 * shown, which is enough to tell an `eyJ…` JWT from a truncated paste.
 */
export const configStatus = {
  url,
  urlFromEnv: Boolean(readEnv(import.meta.env.VITE_SUPABASE_URL)),
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

type Client = SupabaseClient<Database>;

let client: Client | null = null;

if (isConfigured) {
  client = createClient<Database>(url, anonKey!, {
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
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_ANON.');
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

export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as MaybePostgrestError).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

/**
 * What kind of failure a write hit, in terms the interface can act on.
 *
 * This exists because of one very expensive afternoon. Migrations here are
 * run by hand, so the app is regularly ahead of the schema — and when it is,
 * every control on a settings page renders perfectly and then does nothing
 * at all when you touch it. No error, no console, no clue: the write goes
 * out, Postgres says the column does not exist, the promise is discarded,
 * and the toggle snaps back. From the outside it is indistinguishable from a
 * broken button.
 *
 * `missing_schema` is the whole point. The others are here so the same
 * banner can say something true rather than "something went wrong".
 */
export type WriteFailure =
  /** The column or table this write needs does not exist yet — run the migrations. */
  | 'missing_schema'
  /** Row Level Security refused it. Usually correct, occasionally a bug. */
  | 'not_allowed'
  /** A CHECK or unique constraint said no. */
  | 'rejected'
  /** Nothing reached the server. */
  | 'offline'
  | 'unknown';

export function classifyWriteError(error: unknown): WriteFailure {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();

  // 42703 undefined_column and 42P01 undefined_table come from Postgres;
  // PGRST204 is PostgREST's own "column not found in the schema cache",
  // which is what a browser client actually sees most of the time.
  if (code === '42703' || code === '42P01' || code === 'PGRST204') return 'missing_schema';
  if (message.includes('does not exist') || message.includes('schema cache')) {
    return 'missing_schema';
  }

  if (code === '42501' || code === 'PGRST301') return 'not_allowed';
  // An RLS refusal on INSERT arrives as a policy violation rather than a code.
  if (message.includes('row-level security') || message.includes('violates row-level')) {
    return 'not_allowed';
  }

  if (code === '23514' || code === '23505' || code === '23503') return 'rejected';

  if (code === '' || code === null) {
    if (message.includes('fetch') || message.includes('network')) return 'offline';
  }

  return 'unknown';
}

