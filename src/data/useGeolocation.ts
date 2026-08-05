import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coordinates } from '@/lib/geo';

/**
 * One-shot access to where the device is.
 *
 * There is no watcher here and no background anything, because the web has
 * no background geolocation — a page that is not open cannot be woken to
 * check where you are. Everything that depends on location in this app
 * therefore happens while someone is looking at it, and the interface says
 * so rather than implying a promise the browser cannot keep.
 *
 * Nothing read here is ever stored. The position is compared against the
 * couple's saved places in memory, and what gets written down is at most
 * "arrived at Home" — never a coordinate.
 */

export type GeolocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  // A phone that has been in a pocket can take a while to get a fix.
  timeout: 15_000,
  // A minute-old fix is fine for "am I within 200 m of home?" and saves
  // waking the GPS.
  maximumAge: 60_000,
};

export function useGeolocation() {
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const request = useCallback((): Promise<Coordinates | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return Promise.resolve(null);
    }

    setStatus('locating');
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (result) => {
          const next = {
            latitude: result.coords.latitude,
            longitude: result.coords.longitude,
          };
          if (mounted.current) {
            setPosition(next);
            setStatus('ready');
          }
          resolve(next);
        },
        (error) => {
          if (mounted.current) {
            setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
          }
          resolve(null);
        },
        OPTIONS,
      );
    });
  }, []);

  return { position, status, request };
}

/**
 * Whether location has already been granted, without asking for it.
 *
 * This is what keeps automatic arrival from ambushing someone with a
 * permission prompt the moment they open the app: the silent check only
 * proceeds when permission is already in hand. Safari has historically not
 * supported querying this, so an unknown answer is treated as "don't ask".
 */
export function useGeolocationGranted(): boolean | null {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      setGranted(false);
      return;
    }
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((result) => {
        if (active) setGranted(result.state === 'granted');
      })
      .catch(() => {
        if (active) setGranted(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return granted;
}
