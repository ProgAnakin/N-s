/**
 * The flowers.
 *
 * Now and then the app offers one of three pink flowers, and you can send it
 * across. That is the whole feature. It has no purpose beyond being a small
 * unearned nice thing that arrives on an ordinary Tuesday.
 *
 * The three were chosen so the gesture means something in both halves of
 * this couple's world rather than being generic decoration — one Chinese,
 * one Japanese by way of the character both cultures read, one universal.
 *
 * Rules that keep it a delight rather than a nag: at most one offer a day,
 * never twice in a day, and never an offer when you have already sent one.
 * A surprise that appears on schedule is not a surprise, and a surprise that
 * appears constantly is a notification.
 */

import type { CalendarDate } from './calendar';
import { isSameDay } from './calendar';

export type FlowerKind = 'rose' | 'peony' | 'cherry';

export const FLOWER_KINDS: readonly FlowerKind[] = ['rose', 'peony', 'cherry'];

/** How likely an offer is, on an app open that qualifies. */
export const FLOWER_OFFER_CHANCE = 0.28;

export interface FlowerOfferInput {
  today: CalendarDate;
  /** When this person was last shown the popup. */
  lastOfferedOn: CalendarDate | null;
  /** When this person last actually sent one. */
  lastSentOn: CalendarDate | null;
  /** A number in [0, 1). Passed in rather than drawn here, so this is pure. */
  roll: number;
}

export function shouldOfferFlower({
  today,
  lastOfferedOn,
  lastSentOn,
  roll,
}: FlowerOfferInput): boolean {
  if (lastOfferedOn && isSameDay(lastOfferedOn, today)) return false;
  if (lastSentOn && isSameDay(lastSentOn, today)) return false;
  return roll < FLOWER_OFFER_CHANCE;
}

export interface FlowerLike {
  id: string;
  kind: FlowerKind;
  toProfileId: string;
  seen: boolean;
}

export interface FlowerTally {
  kind: FlowerKind;
  count: number;
}

export interface FlowerCount {
  total: number;
  unseen: number;
  byKind: FlowerTally[];
}

/** What one person has been given. */
export function countReceived(
  flowers: readonly FlowerLike[],
  profileId: string,
): FlowerCount {
  const mine = flowers.filter((flower) => flower.toProfileId === profileId);
  const byKind = new Map<FlowerKind, number>();
  for (const flower of mine) byKind.set(flower.kind, (byKind.get(flower.kind) ?? 0) + 1);

  return {
    total: mine.length,
    unseen: mine.filter((flower) => !flower.seen).length,
    // Every kind is listed, including the ones at zero: seeing which one has
    // never arrived is half the charm of a collection.
    byKind: FLOWER_KINDS.map((kind) => ({ kind, count: byKind.get(kind) ?? 0 })),
  };
}

