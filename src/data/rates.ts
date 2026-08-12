import { supabase } from './client';
import { CURRENCIES, type CurrencyCode } from '@/lib/money';
import { snapshotFrom, type RateBook, type RateSnapshot } from '@/lib/fx';

/**
 * Exchange rates: today's, and any day in the past.
 *
 * Frankfurter publishes the European Central Bank's reference rates: free,
 * no key, no rate limit worth worrying about. It was chosen over the
 * alternatives because it needs no account — an app for two people should
 * not require somebody to register for an API key to log a dinner.
 *
 * The ECB publishes once per working day, so a weekend request returns
 * Friday's rates. That is the correct answer, not a stale one: no interbank
 * rate exists for a Saturday.
 *
 * The same service answers for a date, which matters more than it looks.
 * An expense written down offline used to be stuck with a choice between
 * today's rate and no rate — both wrong for a dinner three months ago. It
 * can instead be given the rate of the day it actually happened, later,
 * without anybody deciding anything. That is what `ratesOn` is for, and
 * historical rates never change, so they are cached forever.
 *
 * **Reaching the provider directly is not something every browser can do.**
 * A corporate firewall, an ad blocker, or a country's own network filtering
 * can and does block a rate-lookup domain for one person while leaving it
 * open for the other — which for a couple split across two countries is not
 * a rare edge case, it is closer to the ordinary one. So the fetch is not
 * the only path: whichever partner's device *can* reach Frankfurter shares
 * what it found in `public.fx_rates`, a table with no couple_id at all,
 * because an ECB reference rate is the same fact for everyone. The other
 * partner's browser reads it back from Supabase, which the whole app
 * already depends on reaching.
 *
 * Everything here still degrades to null in the end. A day nobody's browser
 * could reach Frankfurter for, and nobody had already shared, means an
 * expense is written down without a snapshot — which the spending page
 * counts at today's rate and marks as an estimate until a real one arrives.
 */

const ENDPOINT = 'https://api.frankfurter.app';
const CACHE_KEY = 'nos.rates.v1';
/** Keyed by the date asked for. Past rates are settled, so this never expires. */
const HISTORY_KEY = 'nos.rates.on.v1';

/** The base the provider quotes against. Any of the four would do. */
const BASE: CurrencyCode = 'EUR';

interface CachedRates {
  /** The provider's own date for these rates, e.g. '2026-08-05'. */
  date: string;
  /** What one unit of the base is worth in each currency. */
  perBase: Record<string, number>;
  /** When we fetched it, so a stale cache can be refreshed. */
  fetchedOn: string;
}

let inFlight: Promise<CachedRates | null> | null = null;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function readCache(): CachedRates | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'perBase' in parsed &&
      'fetchedOn' in parsed
    ) {
      return parsed as CachedRates;
    }
  } catch {
    // A corrupt cache is the same as no cache.
  }
  return null;
}

function writeCache(rates: CachedRates): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(rates));
  } catch {
    // Refetching every session is a smaller loss than crashing.
  }
}

/**
 * Turns whatever the provider sent back into a validated rate table, or null.
 *
 * Shared between the live fetch and the Supabase read so both paths refuse
 * a partial or malformed table the same way — a rate for three currencies
 * would silently drop the fourth out of every total that reads it.
 */
function parseRates(rates: Record<string, unknown>): Record<string, number> | null {
  const perBase: Record<string, number> = { [BASE]: 1 };
  for (const code of CURRENCIES) {
    if (code === BASE) continue;
    const rate = rates[code];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;
    perBase[code] = rate;
  }
  return perBase;
}

/**
 * One request to the provider, for `when` — a date, or `latest`.
 *
 * Does no caching of its own so the two callers can cache differently:
 * today's rates go stale at midnight, a past day's never do. Does not fall
 * back to Supabase either — that is `fetchRates` and `fetchHistorical`'s
 * job, since only they know whether "latest" or an exact date is wanted.
 */
async function requestRates(when: string): Promise<CachedRates | null> {
  const wanted = CURRENCIES.filter((code) => code !== BASE).join(',');
  try {
    const response = await fetch(`${ENDPOINT}/${when}?from=${BASE}&to=${wanted}`);
    if (!response.ok) return null;

    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('rates' in body)) return null;

    const { rates, date } = body as { rates: Record<string, unknown>; date?: unknown };
    // One missing currency invalidates the lot — see the CHECK in 0009.
    const perBase = parseRates(rates);
    if (!perBase) return null;

    return {
      // The provider answers with the day it actually used, which for a
      // weekend or a holiday is the working day before. Keeping *its* date
      // rather than the one asked for is what makes `fx_on` honest.
      date: typeof date === 'string' ? date : when,
      perBase,
      fetchedOn: todayIso(),
    };
  } catch {
    // Offline, blocked, or the service is down. All the same to the caller.
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * The shared table — what this browser cannot reach, another one might
 * ------------------------------------------------------------------ */

/**
 * Leaves a successful fetch for the partner, best-effort.
 *
 * `ignoreDuplicates` so this never overwrites a day that is already there
 * — there is nothing to correct in an ECB reference rate that has not
 * changed, and the ordinary case is two devices racing to write the same
 * day within seconds of each other.
 */
async function shareWithPartner(rates: CachedRates): Promise<void> {
  if (!supabase) return;
  try {
    await supabase
      .from('fx_rates')
      .upsert(
        { date: rates.date, base: BASE, per_base: rates.perBase },
        { onConflict: 'date', ignoreDuplicates: true },
      );
  } catch {
    // The rate still works for this browser even if sharing it failed —
    // sharing is a courtesy to the partner, not something this save
    // depends on.
  }
}

function fromRow(row: { date: string; per_base: Record<string, unknown> }): CachedRates | null {
  const perBase = parseRates(row.per_base);
  if (!perBase) return null;
  return { date: row.date, perBase, fetchedOn: todayIso() };
}

/** The most recent day anybody has shared, whatever it is. */
async function readSharedLatest(): Promise<CachedRates | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('fx_rates')
      .select('date, per_base')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return fromRow(data);
  } catch {
    return null;
  }
}

/**
 * One exact day, or null.
 *
 * Deliberately not "the nearest day anybody has": a value frozen onto an
 * expense claims to be that day's rate, not a stand-in for it, and a
 * nearby-but-wrong date would get written down as though it were exact.
 */
async function readShared(date: string): Promise<CachedRates | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('fx_rates')
      .select('date, per_base')
      .eq('date', date)
      .maybeSingle();
    if (error || !data) return null;
    return fromRow(data);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Today
 * ------------------------------------------------------------------ */

async function fetchRates(): Promise<CachedRates | null> {
  const direct = await requestRates('latest');
  if (direct) {
    writeCache(direct);
    void shareWithPartner(direct);
    return direct;
  }

  // This browser could not reach the provider itself. Ask whether the
  // partner's could — today's shared rate is exactly as good as fetching
  // it directly would have been.
  const shared = await readSharedLatest();
  if (shared) writeCache(shared);
  return shared;
}

/**
 * Rates for today, from cache when they are today's.
 *
 * Concurrent callers share one request: opening the spending page fires
 * several of these at once and there is no reason to ask four times.
 */
export async function currentRates(): Promise<CachedRates | null> {
  const cached = readCache();
  if (cached && cached.fetchedOn === todayIso()) return cached;

  inFlight ??= fetchRates().finally(() => {
    inFlight = null;
  });
  const fresh = await inFlight;

  // Yesterday's rates beat nothing at all: an expense recorded with rates a
  // day old is far closer to the truth than one recorded with none.
  return fresh ?? cached;
}

/* ------------------------------------------------------------------ *
 * A day in the past
 * ------------------------------------------------------------------ */

function readHistory(): Record<string, CachedRates> {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, CachedRates>;
    }
  } catch {
    // A corrupt cache is the same as no cache.
  }
  return {};
}

function rememberHistory(key: string, rates: CachedRates): void {
  try {
    const history = readHistory();
    history[key] = rates;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Refetching is a smaller loss than crashing.
  }
}

const pending = new Map<string, Promise<CachedRates | null>>();

async function fetchHistorical(date: string): Promise<CachedRates | null> {
  const direct = await requestRates(date);
  if (direct) {
    void shareWithPartner(direct);
    return direct;
  }
  return readShared(date);
}

/**
 * The rates as they stood on `date` (ISO, `YYYY-MM-DD`).
 *
 * A past day's rates are a settled fact, so the cache has no expiry. A date
 * in the future — a clock askew, an expense dated ahead — falls through to
 * today's, which is the only defensible answer.
 */
export async function ratesOn(date: string): Promise<CachedRates | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (date >= todayIso()) return currentRates();

  const cached = readHistory()[date];
  if (cached) return cached;

  // Backfilling a month of expenses fires one of these per row, and several
  // will share a date. One request each, not one per row.
  let request = pending.get(date);
  if (!request) {
    request = fetchHistorical(date).finally(() => pending.delete(date));
    pending.set(date, request);
  }
  const fetched = await request;
  if (fetched) rememberHistory(date, fetched);
  return fetched;
}

export interface CapturedRates {
  fx: RateSnapshot;
  /** The provider's date for these rates. */
  on: string;
}

function capture(rates: CachedRates | null, currency: CurrencyCode): CapturedRates | null {
  if (!rates) return null;
  const fx = snapshotFrom(BASE, rates.perBase as Partial<Record<CurrencyCode, number>>, currency);
  return fx ? { fx, on: rates.date } : null;
}

/**
 * The snapshot to freeze onto an expense in `currency`, or null.
 *
 * Null is not an error to report — it is the ordinary consequence of being
 * offline (or blocked, and unshared), and the expense saves regardless.
 */
export async function captureRates(currency: CurrencyCode): Promise<CapturedRates | null> {
  return capture(await currentRates(), currency);
}

/**
 * The snapshot an expense on `date` should have been given at the time.
 *
 * This is what repairs an expense written down offline: not today's rate
 * pressed onto an old dinner, but the rate that dinner was actually paid at.
 */
export async function captureRatesOn(
  currency: CurrencyCode,
  date: string,
): Promise<CapturedRates | null> {
  return capture(await ratesOn(date), currency);
}

/**
 * Today's rates as a snapshot per currency, for expenses that have none.
 *
 * Only a stand-in, and only until `captureRatesOn` reaches the row. Its
 * purpose is that the total on screen is never missing anything, not even
 * for the second it takes to repair.
 */
export async function rateBook(): Promise<RateBook> {
  const rates = await currentRates();
  if (!rates) return {};
  const book: RateBook = {};
  for (const code of CURRENCIES) {
    const fx = snapshotFrom(BASE, rates.perBase as Partial<Record<CurrencyCode, number>>, code);
    if (fx) book[code] = fx;
  }
  return book;
}
