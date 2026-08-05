import { describe, expect, it } from 'vitest';
import type { CalendarDate } from './calendar';
import {
  countReceived,
  FLOWER_OFFER_CHANCE,
  shouldOfferFlower,
  type FlowerLike,
} from './flowers';

const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });
const TODAY = d(2026, 3, 14);

describe('shouldOfferFlower', () => {
  it('offers on a lucky roll when nothing has happened today', () => {
    expect(
      shouldOfferFlower({ today: TODAY, lastOfferedOn: null, lastSentOn: null, roll: 0 }),
    ).toBe(true);
  });

  it('stays quiet on an unlucky roll', () => {
    expect(
      shouldOfferFlower({ today: TODAY, lastOfferedOn: null, lastSentOn: null, roll: 0.99 }),
    ).toBe(false);
  });

  it('never offers twice in one day, however lucky the roll', () => {
    expect(
      shouldOfferFlower({ today: TODAY, lastOfferedOn: TODAY, lastSentOn: null, roll: 0 }),
    ).toBe(false);
  });

  it('does not offer another once one has been sent today', () => {
    expect(
      shouldOfferFlower({ today: TODAY, lastOfferedOn: null, lastSentOn: TODAY, roll: 0 }),
    ).toBe(false);
  });

  it('comes back the next day', () => {
    expect(
      shouldOfferFlower({
        today: TODAY,
        lastOfferedOn: d(2026, 3, 13),
        lastSentOn: d(2026, 3, 13),
        roll: 0,
      }),
    ).toBe(true);
  });

  it('sits well below certainty, so it stays a surprise', () => {
    expect(FLOWER_OFFER_CHANCE).toBeGreaterThan(0);
    expect(FLOWER_OFFER_CHANCE).toBeLessThan(0.5);
    // The roll at the threshold is excluded, the one just under is not.
    const at = (roll: number) =>
      shouldOfferFlower({ today: TODAY, lastOfferedOn: null, lastSentOn: null, roll });
    expect(at(FLOWER_OFFER_CHANCE)).toBe(false);
    expect(at(FLOWER_OFFER_CHANCE - 0.001)).toBe(true);
  });
});


describe('countReceived', () => {
  const flowers: FlowerLike[] = [
    { id: '1', kind: 'rose', toProfileId: 'ana', seen: true },
    { id: '2', kind: 'rose', toProfileId: 'ana', seen: false },
    { id: '3', kind: 'peony', toProfileId: 'ana', seen: false },
    { id: '4', kind: 'cherry', toProfileId: 'leo', seen: false },
  ];

  it('counts only what was sent to that person', () => {
    expect(countReceived(flowers, 'ana').total).toBe(3);
    expect(countReceived(flowers, 'leo').total).toBe(1);
  });

  it('counts the unseen ones for the badge', () => {
    expect(countReceived(flowers, 'ana').unseen).toBe(2);
  });

  it('lists every kind, including the ones never received', () => {
    const counts = countReceived(flowers, 'leo');
    expect(counts.byKind).toEqual([
      { kind: 'rose', count: 0 },
      { kind: 'peony', count: 0 },
      { kind: 'cherry', count: 1 },
    ]);
  });

  it('is all zeros for someone who has received none', () => {
    const counts = countReceived([], 'ana');
    expect(counts.total).toBe(0);
    expect(counts.byKind.every((entry) => entry.count === 0)).toBe(true);
  });
});
