import { describe, expect, it } from 'vitest';
import { distanceMeters, formatDistance, isWithin, placeYouAreAt, type PlaceLike } from './geo';

// A few real, well-known separations to check the formula against.
const LISBON = { latitude: 38.7223, longitude: -9.1393 };
const PORTO = { latitude: 41.1579, longitude: -8.6291 };
const SAO_PAULO = { latitude: -23.5505, longitude: -46.6333 };
const SHANGHAI = { latitude: 31.2304, longitude: 121.4737 };

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters(LISBON, LISBON)).toBe(0);
  });

  it('matches known distances within a fraction of a percent', () => {
    // Lisbon to Porto is about 274 km as the crow flies.
    expect(distanceMeters(LISBON, PORTO) / 1000).toBeCloseTo(274, 0);
    // São Paulo to Shanghai is one of the longest city pairs there is, and a
    // good check that nothing degenerates at near-antipodal distances.
    const km = distanceMeters(SAO_PAULO, SHANGHAI) / 1000;
    expect(km).toBeGreaterThan(18500);
    expect(km).toBeLessThan(18620);
  });

  it('is symmetric', () => {
    expect(distanceMeters(LISBON, PORTO)).toBeCloseTo(distanceMeters(PORTO, LISBON), 6);
  });

  it('stays accurate at the small distances this app actually uses', () => {
    // A hundredth of a degree of latitude is very close to 1.11 km.
    const near = { latitude: LISBON.latitude + 0.01, longitude: LISBON.longitude };
    expect(distanceMeters(LISBON, near)).toBeCloseTo(1111, -1);
  });

  it('does not lose precision for two points metres apart', () => {
    const step = { latitude: LISBON.latitude + 0.00009, longitude: LISBON.longitude };
    const metres = distanceMeters(LISBON, step);
    expect(metres).toBeGreaterThan(8);
    expect(metres).toBeLessThan(12);
  });

  it('handles crossing the antimeridian without exploding', () => {
    const west = { latitude: 0, longitude: -179.9 };
    const east = { latitude: 0, longitude: 179.9 };
    // The short way round is about 22 km, not most of the equator.
    expect(distanceMeters(west, east) / 1000).toBeLessThan(30);
  });
});

describe('isWithin', () => {
  it('includes the boundary', () => {
    const near = { latitude: LISBON.latitude + 0.001, longitude: LISBON.longitude };
    const exact = distanceMeters(LISBON, near);
    expect(isWithin(LISBON, near, exact)).toBe(true);
    expect(isWithin(LISBON, near, exact - 1)).toBe(false);
  });

  it('treats a negative radius as zero rather than inverting', () => {
    expect(isWithin(LISBON, PORTO, -500)).toBe(false);
  });
});

describe('placeYouAreAt', () => {
  const home: PlaceLike = { id: 'home', label: 'Home', ...LISBON, radiusMeters: 200 };
  const cafe: PlaceLike = {
    id: 'cafe',
    label: 'The café downstairs',
    latitude: LISBON.latitude + 0.0005,
    longitude: LISBON.longitude,
    radiusMeters: 500,
  };

  it('returns null when you are not at any of them', () => {
    expect(placeYouAreAt(PORTO, [home, cafe])).toBeNull();
  });

  it('returns null when there are no places saved', () => {
    expect(placeYouAreAt(LISBON, [])).toBeNull();
  });

  it('picks the nearest when radii overlap', () => {
    // Standing exactly at home, inside both circles.
    expect(placeYouAreAt(LISBON, [cafe, home])?.place.id).toBe('home');
  });

  it('reports how far off you are', () => {
    const match = placeYouAreAt(LISBON, [home]);
    expect(match?.distanceMeters).toBe(0);
  });
});

describe('formatDistance', () => {
  it('rounds metres to something a human would say', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(37)).toBe('40 m');
    expect(formatDistance(994)).toBe('990 m');
  });

  it('switches to kilometres', () => {
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(42000)).toBe('42 km');
  });
});
