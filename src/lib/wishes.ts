import type { CalendarDate } from './calendar';
import { daysBetween } from './calendar';

/**
 * Three wishes each.
 *
 * The cap is the entire design. A wishlist with no limit is a shopping
 * basket, and a shopping basket cannot be a gift: forty items say "pick
 * one, any one", which is exactly the shrug the feature exists to avoid.
 * Three forces the question "what do I actually want?" — and answering
 * that is most of the value, before anyone buys anything.
 *
 * The other half is the history. A granted wish does not disappear; it
 * moves onto a shelf of things that happened, which is the closest this
 * app comes to an achievement and is deliberately about being *given to*
 * rather than about doing something. Nobody earns it.
 *
 * What is never built here:
 *
 *   - No prices, and no total. A wish with a price on it is an invoice,
 *     and a partner reading it feels billed.
 *   - No "granted by me / granted by them" split anywhere. The history is
 *     one person's — the wisher's — and who gave what is a detail on a
 *     row, never a tally.
 *   - No reminders that a wish is old. Wanting something for a year is
 *     not a failure to act on.
 */

export const MAX_WISHES = 3;
const SLOTS = [1, 2, 3] as const;
export type Slot = (typeof SLOTS)[number];

export interface Wish {
  id: string;
  profileId: string;
  title: string;
  note?: string | null;
  photoPath?: string | null;
  link?: string | null;
  /** 1–3 while live, null once granted. */
  slot: number | null;
  grantedOn?: CalendarDate | null;
  grantedBy?: string | null;
  grantedNote?: string | null;
  createdAt?: string;
}

export function isLive(wish: Wish): boolean {
  return wish.slot !== null && !wish.grantedOn;
}

export function isGranted(wish: Wish): boolean {
  return Boolean(wish.grantedOn);
}

/** One person's live wishes, in slot order. */
export function liveWishes(wishes: readonly Wish[], profileId: string): Wish[] {
  return wishes
    .filter((wish) => wish.profileId === profileId && isLive(wish))
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
}

/**
 * Their history, newest first.
 *
 * Deliberately not capped and never counted against anything. This is the
 * only list in the app that is allowed to grow without limit, because the
 * limit is the point of the other one.
 */
export function grantedWishes(wishes: readonly Wish[], profileId: string): Wish[] {
  return wishes
    .filter((wish) => wish.profileId === profileId && isGranted(wish))
    .sort((a, b) => compareDatesDescending(a.grantedOn ?? null, b.grantedOn ?? null));
}

function compareDatesDescending(a: CalendarDate | null, b: CalendarDate | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a.year !== b.year) return b.year - a.year;
  if (a.month !== b.month) return b.month - a.month;
  return b.day - a.day;
}

/**
 * The lowest free seat, or null when all three are taken.
 *
 * Lowest rather than next-highest so that granting the wish in slot 1 and
 * adding a new one puts it back in slot 1 — the list keeps its shape
 * instead of drifting to 2, 3, and then nothing.
 */
export function nextFreeSlot(wishes: readonly Wish[], profileId: string): Slot | null {
  const taken = new Set(liveWishes(wishes, profileId).map((wish) => wish.slot));
  return SLOTS.find((slot) => !taken.has(slot)) ?? null;
}

export function slotsLeft(wishes: readonly Wish[], profileId: string): number {
  return MAX_WISHES - liveWishes(wishes, profileId).length;
}

/**
 * What the partner sees, and whether it is any use.
 *
 * `empty` is the state worth designing for: an empty list is not a bug
 * and should not read as one, but it is the difference between the gift
 * page being helpful and being decoration — so the screen needs to know
 * and say something true rather than showing three grey rectangles.
 */
export interface PartnerView {
  wishes: Wish[];
  empty: boolean;
  /** How long since they last touched their list, if it is known. */
  staleDays: number | null;
}

export function partnerView(
  wishes: readonly Wish[],
  partnerId: string,
  today: CalendarDate,
): PartnerView {
  const live = liveWishes(wishes, partnerId);
  const granted = grantedWishes(wishes, partnerId);

  // Measured from the most recent thing that happened on their list at
  // all, granted or added — not from the oldest live wish. Somebody happy
  // with what they wrote a year ago is not stale.
  const latest = granted[0]?.grantedOn ?? null;

  return {
    wishes: live,
    empty: live.length === 0,
    staleDays: latest ? daysBetween(latest, today) : null,
  };
}

/**
 * Turning a wish into the row that grants it.
 *
 * Both fields move together, which is what the database constraint
 * requires: a granted wish holds no seat, a live one holds exactly one,
 * and nothing is ever both. Doing it in one update also means the seat is
 * freed the instant the history is filed, so the person can write a new
 * wish immediately rather than after some cleanup step nobody built.
 */
export function grantValues(
  granterId: string,
  on: CalendarDate,
  note?: string | null,
): {
  slot: null;
  granted_on: string;
  granted_by: string;
  granted_note: string | null;
} {
  return {
    slot: null,
    granted_on: `${on.year}-${pad(on.month)}-${pad(on.day)}`,
    granted_by: granterId,
    granted_note: note?.trim() ? note.trim() : null,
  };
}

/**
 * Putting a granted wish back.
 *
 * Undo matters more here than almost anywhere else in the app: marking
 * the wrong wish granted is one mis-tap, and without this the only way
 * back is to delete somebody's wish and ask them to write it again.
 *
 * Needs a free seat, and says so rather than silently overwriting one.
 */
export function ungrantValues(
  wishes: readonly Wish[],
  wish: Wish,
): { slot: Slot; granted_on: null; granted_by: null; granted_note: null } | null {
  const slot = nextFreeSlot(wishes, wish.profileId);
  if (slot === null) return null;
  return { slot, granted_on: null, granted_by: null, granted_note: null };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
