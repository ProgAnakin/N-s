import { CURRENCIES, type CurrencyCode } from '@/lib/money';
import { snapshotFrom, type RateSnapshot } from '@/lib/fx';

/**
 * Today's exchange rates, fetched once and remembered.
 *
 * Frankfurter publishes the European Central Bank's reference rates: free,
 * no key, no rate limit worth worrying about, CORS open. It was chosen over
 * the alternatives because it needs no account — an app for two people
 * should not require somebody to register for an API key to log a dinner.
 *
 * The ECB publishes once per working day, so a weekend request returns
 * Friday's rates. That is the correct answer, not a stale one: no interbank
 * rate exists for a Saturday.
 *
 * Everything here degrades to null. A failed fetch means an expense is
 * written down without a snapshot, which the spending page shows apart
 * rather than folding a guess into the total.
 */

const ENDPOINT = 'https://api.frankfurter.app/latest';
const CACHE_KEY = 'nos.rates.v1';

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

async function fetchRates(): Promise<CachedRates | null> {
  const wanted = CURRENCIES.filter((code) => code !== BASE).join(',');
  try {
    const response = await fetch(`${ENDPOINT}?from=${BASE}&to=${wanted}`);
    if (!response.ok) return null;

    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('rates' in body)) return null;

    const { rates, date } = body as { rates: Record<string, unknown>; date?: unknown };
    const perBase: Record<string, number> = { [BASE]: 1 };
    for (const code of CURRENCIES) {
      if (code === BASE) continue;
      const rate = rates[code];
      // One missing currency invalidates the lot — see the CHECK in 0009.
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;
      perBase[code] = rate;
    }

    const cached: CachedRates = {
      date: typeof date === 'string' ? date : todayIso(),
      perBase,
      fetchedOn: todayIso(),
    };
    writeCache(cached);
    return cached;
  } catch {
    // Offline, blocked, or the service is down. All the same to the caller.
    return null;
  }
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

export interface CapturedRates {
  fx: RateSnapshot;
  /** The provider's date for these rates. */
  on: string;
}

/**
 * The snapshot to freeze onto an expense in `currency`, or null.
 *
 * Null is not an error to report — it is the ordinary consequence of being
 * offline, and the expense saves regardless.
 */
export async function captureRates(currency: CurrencyCode): Promise<CapturedRates | null> {
  const rates = await currentRates();
  if (!rates) return null;
  const fx = snapshotFrom(BASE, rates.perBase as Partial<Record<CurrencyCode, number>>, currency);
  return fx ? { fx, on: rates.date } : null;
}

