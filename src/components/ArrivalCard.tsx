import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { Check, House, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Surface';
import { Seal } from '@/components/ui/Seal';
import { useCouple, useSession } from '@/data/session';
import { useGeolocation, useGeolocationGranted } from '@/data/useGeolocation';
import type { CheckinRow, PlaceRow } from '@/data/database.types';
import { placeYouAreAt, type PlaceLike } from '@/lib/geo';
import { useI18n, useStrings } from '@/i18n';
import { usePartnerNames, useCoupleTable } from '@/screens/shared';

/** How long before arriving at the same place counts as a new arrival. */
const REPEAT_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * "I'm home", in one tap.
 *
 * The point is not the location technology — it is not having to compose
 * "amor, cheguei" every single evening. So the manual button is the feature
 * and always works; automatic detection is a convenience layered on top,
 * opt-in, and honest about only working while the app is open.
 */
export function ArrivalCard() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple, profile } = useCouple();
  const { partner } = useSession();
  const names = usePartnerNames();
  const { request, status } = useGeolocation();
  const alreadyGranted = useGeolocationGranted();

  const places = useCoupleTable('places', { coupleId: couple.id, orderBy: 'created_at', ascending: true });
  const checkins = useCoupleTable('checkins', {
    coupleId: couple.id,
    orderBy: 'created_at',
    ascending: false,
  });

  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [detected, setDetected] = useState<PlaceRow | null>(null);
  // One automatic attempt per mount: repeatedly waking the GPS on every
  // re-render would drain a battery to no purpose.
  const autoTried = useRef(false);

  const placeLikes = useMemo<(PlaceLike & { row: PlaceRow })[]>(
    () =>
      places.rows.map((row) => ({
        id: row.id,
        label: row.label,
        latitude: row.latitude,
        longitude: row.longitude,
        radiusMeters: row.radius_m,
        row,
      })),
    [places.rows],
  );

  const arrivedRecently = useCallback(
    (placeLabel: string) => {
      const cutoff = Date.now() - REPEAT_WINDOW_MS;
      return checkins.rows.some(
        (row) =>
          row.profile_id === profile.id &&
          row.label === placeLabel &&
          new Date(row.created_at).getTime() > cutoff,
      );
    },
    [checkins.rows, profile.id],
  );

  const send = useCallback(
    async (place: PlaceRow | null, automatic: boolean) => {
      setSending(true);
      await checkins.create({
        couple_id: couple.id,
        profile_id: profile.id,
        place_id: place?.id ?? null,
        label: place?.label ?? s.arrivals.imHome,
        automatic,
      });
      setSending(false);
      setDetected(null);
      setJustSent(true);
      window.setTimeout(() => setJustSent(false), 2500);
    },
    [checkins, couple.id, profile.id, s.arrivals.imHome],
  );

  // --- Automatic detection, only when everything already allows it --------
  useEffect(() => {
    if (autoTried.current) return;
    if (!profile.auto_checkin || alreadyGranted !== true) return;
    if (placeLikes.length === 0 || checkins.loading) return;

    autoTried.current = true;
    void request().then((position) => {
      if (!position) return;
      const match = placeYouAreAt(position, placeLikes);
      if (!match || arrivedRecently(match.place.label)) return;
      // Detected, but not sent behind your back: the card asks first.
      setDetected(match.place.row);
    });
  }, [profile.auto_checkin, alreadyGranted, placeLikes, checkins.loading, request, arrivedRecently]);

  const recent = checkins.rows.slice(0, 4);
  const primaryPlace = places.rows[0] ?? null;

  return (
    <Sheet className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="label-kicker">{s.arrivals.title}</h2>
        {status === 'denied' && (
          <span className="text-xs text-ink-faint">{s.arrivals.locationDenied}</span>
        )}
      </div>

      {/* --- The detected prompt ------------------------------------------- */}
      <AnimatePresence>
        {detected && (
          <m.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-3 flex flex-wrap items-center gap-3 rounded-sm bg-cinnabar/8 px-3 py-2.5"
          >
            <span className="min-w-0 flex-1 text-sm text-ink">
              {s.arrivals.detectedAt(detected.label)}
            </span>
            <Button size="sm" variant="primary" onClick={() => void send(detected, true)}>
              {s.arrivals.detectedSend}
            </Button>
          </m.div>
        )}
      </AnimatePresence>

      {/* --- The button that is the actual feature -------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={() => void send(primaryPlace, false)}
          disabled={sending}
        >
          {justSent ? <Check className="h-4 w-4" /> : <House className="h-4 w-4" />}
          {justSent
            ? s.arrivals.arrived
            : primaryPlace
              ? s.arrivals.imHere(primaryPlace.label)
              : s.arrivals.imHome}
        </Button>

        {places.rows.slice(1, 3).map((place) => (
          <Button key={place.id} size="sm" onClick={() => void send(place, false)} disabled={sending}>
            <MapPin className="h-3.5 w-3.5" />
            {place.label}
          </Button>
        ))}
      </div>

      {/* --- Who got in, and when ------------------------------------------- */}
      {recent.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{s.arrivals.noneYetBody}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {recent.map((row) => (
            <ArrivalRow
              key={row.id}
              row={row}
              locale={intlLocale}
              name={row.profile_id === profile.id ? names.myName : (partner?.display_name ?? names.partnerName)}
              isMe={row.profile_id === profile.id}
            />
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function ArrivalRow({
  row,
  locale,
  name,
  isMe,
}: {
  row: CheckinRow;
  locale: string;
  name: string;
  isMe: boolean;
}) {
  const s = useStrings();
  const when = new Date(row.created_at);
  const sameDay = when.toDateString() === new Date().toDateString();

  return (
    <li className="flex items-center gap-2.5">
      <Seal name={name} size="sm" tone={isMe ? 'jade' : 'cinnabar'} />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        {s.arrivals.arrivedAt(name, row.label)}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-ink-faint">
        {sameDay
          ? when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
          : when.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
      </span>
    </li>
  );
}
