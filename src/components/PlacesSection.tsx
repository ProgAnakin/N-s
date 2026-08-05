import { useState } from 'react';
import { Crosshair, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorNote, Spinner } from '@/components/ui/Bits';
import { TextField, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Sheet } from '@/components/ui/Surface';
import { useCouple, useSession } from '@/data/session';
import { useGeolocation } from '@/data/useGeolocation';
import type { PlaceRow } from '@/data/database.types';
import { useStrings } from '@/i18n';
import { RecordActions, useCoupleTable } from '@/screens/shared';

interface Draft {
  id: string | null;
  label: string;
  latitude: number | null;
  longitude: number | null;
  radius: number;
}

/**
 * The places arrivals can be sent from.
 *
 * Entirely optional: the "I'm home" button works with none saved. Saving one
 * only buys the shortcut of a named button and, if you want it, the app
 * noticing you got there while it is open.
 */
export function PlacesSection() {
  const s = useStrings();
  const { couple, profile } = useCouple();
  const { updateProfile } = useSession();
  const { request, status } = useGeolocation();

  const places = useCoupleTable('places', {
    coupleId: couple.id,
    orderBy: 'created_at',
    ascending: true,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startNew() {
    setDraft({ id: null, label: '', latitude: null, longitude: null, radius: 200 });
    setError(null);
  }

  function startEdit(row: PlaceRow) {
    setDraft({
      id: row.id,
      label: row.label,
      latitude: row.latitude,
      longitude: row.longitude,
      radius: row.radius_m,
    });
    setError(null);
  }

  async function useHere() {
    if (!draft) return;
    setError(null);
    const position = await request();
    if (!position) {
      setError(status === 'denied' ? s.arrivals.locationDenied : s.arrivals.locationUnavailable);
      return;
    }
    setDraft({ ...draft, latitude: position.latitude, longitude: position.longitude });
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.label.trim() || draft.latitude === null || draft.longitude === null) return;

    setSaving(true);
    const values = {
      label: draft.label.trim(),
      latitude: draft.latitude,
      longitude: draft.longitude,
      radius_m: draft.radius,
    };
    if (draft.id) await places.update(draft.id, values);
    else await places.create({ ...values, couple_id: couple.id, created_by: profile.id });
    setSaving(false);
    setDraft(null);
  }

  return (
    <section>
      <h2 className="label-kicker mb-3">{s.settings.places}</h2>
      <Sheet className="flex flex-col gap-4 p-5">
        <Toggle
          label={s.arrivals.autoCheckin}
          hint={s.arrivals.autoCheckinHint}
          checked={profile.auto_checkin}
          onChange={(auto_checkin) => void updateProfile({ auto_checkin })}
        />

        <p className="rounded-sm bg-sunk px-3 py-2 text-xs leading-relaxed text-ink-soft">
          {s.arrivals.autoCheckinLimit}
        </p>

        {places.rows.length === 0 ? (
          <p className="text-sm text-ink-soft">{s.arrivals.placesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {places.rows.map((place) => (
              <li key={place.id} className="flex items-center gap-2 border-b border-rule py-2 last:border-0">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{place.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                  {place.radius_m} m
                </span>
                <RecordActions
                  onEdit={() => startEdit(place)}
                  onDelete={() => void places.remove(place.id)}
                />
              </li>
            ))}
          </ul>
        )}

        <div>
          <Button size="sm" onClick={startNew}>
            <Plus className="h-3.5 w-3.5" />
            {s.arrivals.savePlace}
          </Button>
        </div>
      </Sheet>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.arrivals.editPlace : s.arrivals.savePlace}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={
                saving || !draft?.label.trim() || draft?.latitude === null || draft?.longitude === null
              }
            >
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextField
              label={s.arrivals.placeLabel}
              placeholder={s.arrivals.placeLabelPlaceholder}
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              required
            />

            <div className="flex flex-col gap-2">
              <Button onClick={() => void useHere()} disabled={status === 'locating'}>
                {status === 'locating' ? <Spinner /> : <Crosshair className="h-4 w-4" />}
                {status === 'locating' ? s.arrivals.locating : s.arrivals.useCurrentLocation}
              </Button>
              {draft.latitude !== null && draft.longitude !== null && (
                <p className="font-mono text-xs text-ink-faint">
                  {draft.latitude.toFixed(5)}, {draft.longitude.toFixed(5)}
                </p>
              )}
              {error && <ErrorNote>{error}</ErrorNote>}
            </div>

            <TextField
              label={s.arrivals.placeRadius}
              type="number"
              inputMode="numeric"
              min={25}
              max={5000}
              step={25}
              value={draft.radius}
              onChange={(event) =>
                setDraft({ ...draft, radius: Number(event.target.value) || 200 })
              }
              hint={s.arrivals.placeRadiusHint}
            />
          </form>
        )}
      </Modal>
    </section>
  );
}
