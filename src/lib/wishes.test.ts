import { describe, expect, it } from 'vitest';
import {
  MAX_WISHES,
  grantValues,
  grantedWishes,
  isGranted,
  isLive,
  liveWishes,
  nextFreeSlot,
  partnerView,
  slotsLeft,
  ungrantValues,
  type Wish,
} from './wishes';

const ME = 'me';
const THEM = 'them';
const TODAY = { year: 2026, month: 8, day: 14 };

function wish(overrides: Partial<Wish> = {}): Wish {
  return {
    id: Math.random().toString(36).slice(2),
    profileId: THEM,
    title: 'The green coat',
    slot: 1,
    ...overrides,
  };
}

describe('three, and only three', () => {
  it('is three', () => {
    // The cap is the design, not a setting. A list with no limit is a
    // shopping basket, and a shopping basket cannot be a gift.
    expect(MAX_WISHES).toBe(3);
  });

  it('offers the lowest free seat', () => {
    const wishes = [wish({ slot: 1 }), wish({ slot: 3 })];
    expect(nextFreeSlot(wishes, THEM)).toBe(2);
  });

  /**
   * Lowest rather than next-highest, so that granting the first wish and
   * writing a new one puts it back in slot 1. Otherwise the list drifts
   * upward and eventually has nowhere left despite being empty.
   */
  it('reuses a freed seat instead of drifting upward', () => {
    const wishes = [
      wish({ slot: null, grantedOn: TODAY }),
      wish({ slot: 2 }),
      wish({ slot: 3 }),
    ];
    expect(nextFreeSlot(wishes, THEM)).toBe(1);
  });

  it('has nothing to offer when all three are taken', () => {
    const wishes = [wish({ slot: 1 }), wish({ slot: 2 }), wish({ slot: 3 })];
    expect(nextFreeSlot(wishes, THEM)).toBeNull();
    expect(slotsLeft(wishes, THEM)).toBe(0);
  });

  it('counts seats per person, not per couple', () => {
    const wishes = [wish({ profileId: ME, slot: 1 }), wish({ profileId: THEM, slot: 1 })];
    expect(slotsLeft(wishes, ME)).toBe(2);
    expect(slotsLeft(wishes, THEM)).toBe(2);
    // Both can hold slot 1 — the seats are theirs, not shared.
    expect(nextFreeSlot(wishes, ME)).toBe(2);
  });
});

describe('live and granted are different things', () => {
  it('reads a live wish as live and a granted one as history', () => {
    expect(isLive(wish({ slot: 2 }))).toBe(true);
    expect(isGranted(wish({ slot: 2 }))).toBe(false);

    const done = wish({ slot: null, grantedOn: TODAY });
    expect(isLive(done)).toBe(false);
    expect(isGranted(done)).toBe(true);
  });

  it('lists live wishes in slot order rather than the order they arrived', () => {
    const wishes = [wish({ slot: 3, title: 'third' }), wish({ slot: 1, title: 'first' })];
    expect(liveWishes(wishes, THEM).map((entry) => entry.title)).toEqual(['first', 'third']);
  });

  it('lists the history newest first', () => {
    const wishes = [
      wish({ slot: null, title: 'older', grantedOn: { year: 2025, month: 12, day: 1 } }),
      wish({ slot: null, title: 'newer', grantedOn: { year: 2026, month: 6, day: 1 } }),
    ];
    expect(grantedWishes(wishes, THEM).map((entry) => entry.title)).toEqual(['newer', 'older']);
  });

  it('keeps one person’s history out of the other’s', () => {
    const wishes = [
      wish({ profileId: ME, slot: null, grantedOn: TODAY, title: 'mine' }),
      wish({ profileId: THEM, slot: null, grantedOn: TODAY, title: 'theirs' }),
    ];
    expect(grantedWishes(wishes, ME).map((entry) => entry.title)).toEqual(['mine']);
  });
});

describe('granting one', () => {
  it('frees the seat in the same breath as filing the history', () => {
    const values = grantValues(ME, TODAY, '  the one with wooden buttons  ');
    expect(values).toEqual({
      // Both move together, which is what the database constraint
      // requires: nothing is ever granted *and* holding a seat.
      slot: null,
      granted_on: '2026-08-14',
      granted_by: ME,
      granted_note: 'the one with wooden buttons',
    });
  });

  it('pads the date so it is a real ISO day', () => {
    expect(grantValues(ME, { year: 2026, month: 1, day: 5 }).granted_on).toBe('2026-01-05');
  });

  it('stores nothing rather than an empty note', () => {
    expect(grantValues(ME, TODAY, '   ').granted_note).toBeNull();
    expect(grantValues(ME, TODAY).granted_note).toBeNull();
  });

  it('frees a seat, so a new wish can go straight in', () => {
    const granted = wish({ slot: 1 });
    const after = [
      { ...granted, slot: null, grantedOn: TODAY },
      wish({ slot: 2 }),
      wish({ slot: 3 }),
    ];
    expect(nextFreeSlot(after, THEM)).toBe(1);
  });
});

/**
 * Undo matters more here than anywhere else in the app.
 *
 * Marking the wrong wish granted is one mis-tap, and without a way back
 * the only remedy is deleting somebody's wish and asking them to write it
 * out again.
 */
describe('putting one back', () => {
  it('returns it to the lowest free seat and clears the history fields', () => {
    const granted = wish({ slot: null, grantedOn: TODAY, grantedBy: ME, grantedNote: 'x' });
    expect(ungrantValues([granted, wish({ slot: 2 })], granted)).toEqual({
      slot: 1,
      granted_on: null,
      granted_by: null,
      granted_note: null,
    });
  });

  it('refuses rather than overwriting a seat that is taken', () => {
    const granted = wish({ slot: null, grantedOn: TODAY });
    const full = [granted, wish({ slot: 1 }), wish({ slot: 2 }), wish({ slot: 3 })];
    expect(ungrantValues(full, granted)).toBeNull();
  });
});

describe('what the partner sees', () => {
  it('shows their live wishes and nothing of their history’s bookkeeping', () => {
    const wishes = [
      wish({ profileId: THEM, slot: 1, title: 'the coat' }),
      wish({ profileId: THEM, slot: null, grantedOn: TODAY, title: 'the book' }),
    ];
    const view = partnerView(wishes, THEM, TODAY);
    expect(view.wishes.map((entry) => entry.title)).toEqual(['the coat']);
    expect(view.empty).toBe(false);
  });

  /**
   * An empty list is not a bug and must not read as one — but the gift
   * page needs to know, so it can say something true instead of showing
   * three grey rectangles.
   */
  it('says outright when there is nothing there', () => {
    expect(partnerView([], THEM, TODAY).empty).toBe(true);
  });

  it('measures staleness from the last thing that happened, not the oldest wish', () => {
    const wishes = [
      wish({ profileId: THEM, slot: 1 }),
      wish({
        profileId: THEM,
        slot: null,
        grantedOn: { year: 2026, month: 7, day: 15 },
      }),
    ];
    // Somebody happy with what they wrote a year ago is not stale.
    expect(partnerView(wishes, THEM, TODAY).staleDays).toBe(30);
  });

  it('has no answer for staleness when nothing has ever been granted', () => {
    expect(partnerView([wish({ profileId: THEM })], THEM, TODAY).staleDays).toBeNull();
  });
});

describe('what a wishlist is never allowed to become', () => {
  it('carries no price anywhere', () => {
    // A wish with a price on it is an invoice, and a partner reading it
    // feels billed.
    expect(Object.keys(wish())).not.toContain('cents');
    expect(Object.keys(wish())).not.toContain('price');
  });

  it('never splits the history by who gave what', () => {
    const wishes = [
      wish({ profileId: THEM, slot: null, grantedOn: TODAY, grantedBy: ME }),
      wish({ profileId: THEM, slot: null, grantedOn: TODAY, grantedBy: THEM }),
    ];
    // One person's shelf, whole. Who gave what is a detail on a row, and
    // there is deliberately no function here that groups by giver.
    expect(grantedWishes(wishes, THEM)).toHaveLength(2);
  });
});
