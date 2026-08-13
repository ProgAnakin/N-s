import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorNote } from '@/components/ui/Bits';
import { ConfirmDialog } from '@/components/ui/Modal';
import { SectionHeading, Sheet } from '@/components/ui/Surface';
import { requireClient } from '@/data/client';
import { useCouple, useSession } from '@/data/session';
import { clearTableCache } from '@/data/useTable';
import { reportWriteFailure } from '@/data/write-status';
import { removeMedia } from '@/data/storage';
import { useStrings } from '@/i18n';
import { usePartnerNames } from '@/screens/shared';

/**
 * Actually going.
 *
 * `leave_couple()` unlinks you and keeps everything. That is the right
 * default — most people who leave have not decided anything permanent —
 * but it left no way to decide something permanent. A space both partners
 * had left kept every photograph, letter and expense for ever, with no
 * reader and nobody able to remove it. Unreachable and still stored is
 * the worst of both.
 *
 * The line this draws is the same one migration 0014 writes into the
 * policies: **what is yours alone goes when you say so; what belonged to
 * both of you survives while the other person is still there.** Deleting
 * your things is not the same act as deleting theirs, and the screen says
 * which one is about to happen before it happens — with the list, not a
 * shrug about it being irreversible.
 */
export function EraseSection() {
  const s = useStrings();
  const { couple, profile } = useCouple();
  const { partner, reload } = useSession();
  const names = usePartnerNames();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alone = partner === null;

  async function erase() {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const client = requireClient();

      /*
       * Storage first, database second.
       *
       * Postgres cannot reach the bucket, so the rows that name the files
       * have to still exist when the files are removed. Doing it the
       * other way round leaves objects in the bucket that nothing points
       * at — invisible, unbilled to nobody, and impossible to find later.
       *
       * Only when nobody is left: while the partner is still there the
       * photographs are theirs too.
       */
      if (alone) {
        const [photos, phrases, trips] = await Promise.all([
          client.from('memory_photos').select('path').eq('couple_id', couple.id),
          client.from('phrases').select('audio_path').eq('couple_id', couple.id),
          client.from('trip_items').select('attachment_path').eq('couple_id', couple.id),
        ]);
        const paths = [
          ...(photos.data ?? []).map((row) => row.path),
          ...(phrases.data ?? []).map((row) => row.audio_path),
          ...(trips.data ?? []).map((row) => row.attachment_path),
        ];
        for (const path of paths) await removeMedia(path);
      }

      // Mine either way: the wish photographs are only ever mine.
      const wishes = await client
        .from('wishes')
        .select('photo_path')
        .eq('profile_id', profile.id);
      for (const wish of wishes.data ?? []) await removeMedia(wish.photo_path);

      const { error: rpcError } = await client.rpc('delete_my_data');
      if (rpcError) {
        reportWriteFailure(rpcError);
        setError(s.erase.failed);
        return;
      }

      clearTableCache();
      await reload();
    } catch {
      setError(s.erase.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionHeading>{s.erase.title}</SectionHeading>
      <p className="-mt-2 mb-4 max-w-prose text-pretty text-sm leading-relaxed text-ink-soft">
        {s.erase.subtitle}
      </p>

      <Sheet className="flex flex-col gap-5 p-5">
        {/* The list, before the button. Somebody deciding this needs to
            know what it costs, and "cannot be undone" is not that. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="label-kicker mb-2 text-cinnabar">{s.erase.whatGoes}</h3>
            <ul className="flex flex-col gap-1 text-sm leading-relaxed text-ink-soft">
              {s.erase.whatGoesList.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="label-kicker mb-2">
              {alone ? s.erase.whatStaysAlone : s.erase.whatStays(names.partnerName)}
            </h3>
            <ul className="flex flex-col gap-1 text-sm leading-relaxed text-ink-soft">
              {(alone ? s.erase.whatStaysAloneList : s.erase.whatStaysList).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex flex-col gap-3 border-t border-rule pt-4">
          {/* The way out, before the way through. This is the only
              irreversible action in the app and it used to sit here with
              no mention of the keepsake at all — the copy for offering it
              had been written and never wired to anything. Somebody about
              to delete four years of letters should not have to already
              know that downloading them first was an option. */}
          <a
            href="#keepsake"
            className="self-start text-sm text-cinnabar underline underline-offset-4"
          >
            {s.erase.exportFirst}
          </a>
          <Button onClick={() => setConfirming(true)} disabled={busy}>
            <Trash2 className="h-4 w-4" />
            {busy ? s.common.saving : s.erase.action}
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirming}
        title={s.erase.confirm}
        body={s.erase.confirmBody}
        confirmLabel={s.erase.confirmAction}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void erase()}
      />
    </section>
  );
}
