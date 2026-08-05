/**
 * Distance between two points on the ground.
 *
 * The only geography this app does. There is deliberately nothing here for
 * tracking a route, a speed, or a history — the app knows a few named points
 * the couple chose, and whether someone is standing near one right now.
 *
 * No imports, no framework: the same twenty lines port straight to Dart.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance in metres, by the haversine formula.
 *
 * Haversine treats the Earth as a sphere, which is wrong by about 0.5% —
 * roughly a metre per two hundred. At the scale this is used for ("am I
 * within 200 m of home?") that error is a rounding detail, and the formula
 * stays numerically stable for the very short distances where the simpler
 * spherical law of cosines falls apart.
 */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithin(a: Coordinates, b: Coordinates, radiusMeters: number): boolean {
  return distanceMeters(a, b) <= Math.max(0, radiusMeters);
}

export interface PlaceLike extends Coordinates {
  id: string;
  label: string;
  radiusMeters: number;
}

export interface PlaceMatch<T extends PlaceLike> {
  place: T;
  distanceMeters: number;
}

/**
 * The closest saved place you are actually inside, or null.
 *
 * Closest-first rather than first-match, so overlapping radii (home and the
 * corner café, on a generous GPS day) resolve to the one you are nearest.
 */
export function placeYouAreAt<T extends PlaceLike>(
  position: Coordinates,
  places: readonly T[],
): PlaceMatch<T> | null {
  let best: PlaceMatch<T> | null = null;

  for (const place of places) {
    const distance = distanceMeters(position, place);
    if (distance > place.radiusMeters) continue;
    if (!best || distance < best.distanceMeters) {
      best = { place, distanceMeters: distance };
    }
  }

  return best;
}

/** Rounded for display: metres up close, kilometres once that reads sillily. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}
