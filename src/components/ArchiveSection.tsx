import { useState } from 'react';
import { Download, FileJson, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorNote } from '@/components/ui/Bits';
import { SectionHeading, Sheet } from '@/components/ui/Surface';
import { requireClient } from '@/data/client';
import { useCouple, useSession } from '@/data/session';
import { signedUrlFor } from '@/data/storage';
import {
  archiveFilename,
  toHtml,
  toJson,
  type Archive,
  type ArchiveMemory,
} from '@/lib/archive';
import { formatMoney } from '@/lib/money';
import { useStrings } from '@/i18n';
import { usePartnerNames, useToday } from '@/screens/shared';

/**
 * Taking it all with you.
 *
 * The ending screen promises that closing a space is not confiscating it.
 * Until now that was half true: everything stayed readable inside the
 * app, on a database somebody keeps paying for, and there was no way to
 * get any of it out.
 *
 * Two buttons, and the second is the one that matters. The JSON is for
 * moving the data. The single HTML file is for keeping it — photographs
 * inlined, no stylesheet, no server, no app. It opens on a laptop in
 * 2040 by being double-clicked.
 *
 * Nothing here is privileged: every read goes through the same RLS as the
 * rest of the app, so the archive contains exactly what the person asking
 * for it can already see, and never their partner's private notes.
 */
export function ArchiveSection() {
  const s = useStrings();
  const { couple, profile } = useCouple();
  const { partner } = useSession();
  const names = usePartnerNames();
  const today = useToday();

  const [busy, setBusy] = useState<'json' | 'html' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  /**
   * Photographs are fetched and turned into data URIs one at a time.
   *
   * Slower than firing them all at once, and deliberately: a phone on a
   * hotel connection asked for forty images in parallel fails all forty,
   * and a partial archive that does not say it is partial is worse than
   * a slow one. Anything that will not load is skipped rather than
   * aborting the export — a missing photograph should not cost somebody
   * their letters.
   */
  async function inlinePhotos(paths: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const path of paths) {
      try {
        const url = await signedUrlFor(path);
        if (!url) continue;
        const response = await fetch(url);
        if (!response.ok) continue;
        const blob = await response.blob();
        if (blob.size > 8 * 1024 * 1024) continue;
        out.push(await blobToDataUrl(blob));
      } catch {
        // Skipped, not fatal.
      }
    }
    return out;
  }

  async function build(withPhotos: boolean): Promise<Archive> {
    const client = requireClient();
    const id = couple.id;

    setProgress(s.archive.gathering);
    const [memories, photos, letters, notes, expenses, ideas] = await Promise.all([
      client.from('memories').select('*').eq('couple_id', id).order('date'),
      client.from('memory_photos').select('*').eq('couple_id', id).order('sort_order'),
      client.from('letters').select('*').eq('couple_id', id).order('created_at'),
      client.from('remember_facts').select('*').eq('couple_id', id).order('created_at'),
      client.from('expenses').select('*').eq('couple_id', id).order('date'),
      client.from('gift_ideas').select('*').eq('author_id', profile.id).order('created_at'),
    ]);

    const nameFor = (id: string | null) =>
      id === profile.id ? names.myName : id === partner?.id ? names.partnerName : '';

    const photoRows = photos.data ?? [];
    const built: ArchiveMemory[] = [];
    const memoryRows = memories.data ?? [];

    for (const [index, memory] of memoryRows.entries()) {
      const paths = photoRows
        .filter((photo) => photo.memory_id === memory.id)
        .map((photo) => photo.path);
      if (withPhotos && paths.length > 0) {
        setProgress(s.archive.photos(index + 1, memoryRows.length));
      }
      built.push({
        title: memory.title,
        date: memory.date,
        note: memory.note,
        photos: withPhotos ? await inlinePhotos(paths) : [],
      });
    }

    return {
      meta: {
        coupleName: couple.couple_name,
        anniversary: couple.anniversary_date,
        people: [
          { name: names.myName, role: profile.role },
          ...(partner ? [{ name: names.partnerName, role: partner.role }] : []),
        ],
        exportedOn: today,
      },
      memories: built,
      letters: (letters.data ?? []).map((letter) => ({
        kind: letter.kind,
        body: letter.body,
        from: nameFor(letter.from_profile),
        to: nameFor(letter.to_profile),
        date: letter.created_at.slice(0, 10),
        openOn: letter.open_on,
      })),
      notes: (notes.data ?? []).map((note) => ({
        question: note.question,
        answer: note.answer,
        visibility: note.visibility,
        author: nameFor(note.author_id),
      })),
      expenses: (expenses.data ?? []).map((expense) => ({
        label: expense.label,
        amount: formatMoney(expense.amount_cents, expense.currency),
        paidBy: expense.paid_by === profile.role ? names.myName : names.partnerName,
        date: expense.date,
        category: expense.category,
      })),
      ideas: (ideas.data ?? []).map((idea) => ({ title: idea.idea, note: idea.note })),
    };
  }

  async function download(kind: 'json' | 'html') {
    setBusy(kind);
    setError(null);
    try {
      const archive = await build(kind === 'html');
      const body = kind === 'json' ? toJson(archive) : toHtml(archive);
      save(
        body,
        kind === 'json' ? 'application/json' : 'text/html',
        archiveFilename(couple.couple_name, today, kind),
      );
    } catch {
      setError(s.archive.failed);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  return (
    <section>
      <SectionHeading>{s.archive.title}</SectionHeading>
      <p className="-mt-2 mb-4 max-w-prose text-pretty text-sm leading-relaxed text-ink-soft">
        {s.archive.subtitle}
      </p>

      <Sheet className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="font-display text-base font-medium text-ink">{s.archive.htmlTitle}</h3>
          <p className="mt-1 max-w-prose text-pretty text-sm leading-relaxed text-ink-soft">
            {s.archive.htmlBody}
          </p>
          <Button
            variant="primary"
            className="mt-3"
            onClick={() => void download('html')}
            disabled={busy !== null}
          >
            {busy === 'html' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {busy === 'html' ? (progress ?? s.common.saving) : s.archive.htmlAction}
          </Button>
        </div>

        <div className="border-t border-rule pt-4">
          <h3 className="font-display text-base font-medium text-ink">{s.archive.jsonTitle}</h3>
          <p className="mt-1 max-w-prose text-pretty text-sm leading-relaxed text-ink-soft">
            {s.archive.jsonBody}
          </p>
          <Button className="mt-3" onClick={() => void download('json')} disabled={busy !== null}>
            {busy === 'json' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileJson className="h-4 w-4" />
            )}
            {s.archive.jsonAction}
          </Button>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <p className="flex items-start gap-2 border-t border-rule pt-4 text-xs leading-relaxed text-ink-faint">
          <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {s.archive.privacyNote}
        </p>
      </Sheet>
    </section>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Hands the file to the browser and cleans up after itself. */
function save(body: string, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick: revoking synchronously races the download
  // in Safari and produces an empty file.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
