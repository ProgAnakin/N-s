import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Languages, Mic, Plus, Volume2, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ErrorNote, ProgressBar, Spinner } from '@/components/ui/Bits';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, Sheet } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import { removeMedia, uploadMedia, useSignedUrl, UploadError } from '@/data/storage';
import type { PhraseRow } from '@/data/database.types';
import { learnedProgress } from '@/lib/progress';
import { useStrings } from '@/i18n';
import { FilterBar, RecordActions, useCoupleTable } from './shared';

interface Draft {
  id: string | null;
  original: string;
  reading: string;
  translation: string;
  note: string;
  audioPath: string | null;
}

function emptyDraft(): Draft {
  return { id: null, original: '', reading: '', translation: '', note: '', audioPath: null };
}

type Filter = 'all' | 'learning' | 'learned';

/**
 * The phrasebook.
 *
 * Her script gets the serif face and the largest size on the card — it is the
 * thing being learned, so it leads. Practice mode shows the meaning first and
 * asks you to produce the phrase, which is the direction that actually
 * teaches; recognising characters you have already seen teaches very little.
 */
export function PhrasebookScreen() {
  const s = useStrings();
  const { couple } = useCouple();

  const phrases = useCoupleTable('phrases', {
    coupleId: couple.id,
    orderBy: 'created_at',
    ascending: true,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [practising, setPractising] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const progress = useMemo(() => learnedProgress(phrases.rows), [phrases.rows]);

  const visible = phrases.rows.filter((row) =>
    filter === 'all' ? true : filter === 'learned' ? row.learned : !row.learned,
  );

  function startEdit(row: PhraseRow) {
    setDraft({
      id: row.id,
      original: row.script_original,
      reading: row.pinyin_or_reading ?? '',
      translation: row.translation,
      note: row.note ?? '',
      audioPath: row.audio_path,
    });
    setUploadError(null);
  }

  async function onPickAudio(file: File | undefined) {
    if (!file || !draft) return;
    setUploading(true);
    setUploadError(null);
    try {
      const path = await uploadMedia(couple.id, 'phrases', file);
      if (draft.audioPath) await removeMedia(draft.audioPath);
      setDraft({ ...draft, audioPath: path });
    } catch (caught) {
      setUploadError(
        caught instanceof UploadError && caught.reason === 'too_large'
          ? s.errors.uploadTooLarge
          : s.errors.uploadFailed,
      );
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.original.trim() || !draft.translation.trim()) return;

    setSaving(true);
    const values = {
      script_original: draft.original.trim(),
      pinyin_or_reading: draft.reading.trim() || null,
      translation: draft.translation.trim(),
      note: draft.note.trim() || null,
      audio_path: draft.audioPath,
    };
    if (draft.id) await phrases.update(draft.id, values);
    else await phrases.create({ ...values, couple_id: couple.id });
    setSaving(false);
    setDraft(null);
  }

  async function onDelete(row: PhraseRow) {
    await phrases.remove(row.id);
    await removeMedia(row.audio_path);
  }

  if (practising) {
    return <Practice phrases={phrases.rows} onExit={() => setPractising(false)} onLearned={(id) => void phrases.update(id, { learned: true })} />;
  }

  return (
    <div>
      <PageHeader
        kicker={s.nav.phrasebook}
        title={s.phrasebook.title}
        subtitle={s.phrasebook.intro}
        actions={
          <Button variant="primary" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      {phrases.rows.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-ink-soft">
              {s.phrasebook.progress(progress.done, progress.total)}
            </span>
            <Button size="sm" onClick={() => setPractising(true)}>
              {s.phrasebook.practice}
            </Button>
          </div>
          <ProgressBar
            percent={progress.percent}
            tone="jade"
            label={s.phrasebook.progress(progress.done, progress.total)}
          />
        </div>
      )}

      {phrases.rows.length > 0 && (
        <FilterBar>
          <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
            {s.common.all}
          </Chip>
          <Chip selected={filter === 'learning'} onClick={() => setFilter('learning')}>
            {s.phrasebook.notLearned}
          </Chip>
          <Chip selected={filter === 'learned'} onClick={() => setFilter('learned')}>
            {s.phrasebook.learned}
          </Chip>
        </FilterBar>
      )}

      {phrases.rows.length === 0 ? (
        <EmptyState
          icon={<Languages />}
          title={s.phrasebook.emptyTitle}
          body={s.phrasebook.emptyBody}
          action={
            <Button variant="primary" onClick={() => setDraft(emptyDraft())}>
              {s.phrasebook.add}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((row) => (
            <li key={row.id}>
              <PhraseCard
                row={row}
                onEdit={() => startEdit(row)}
                onDelete={() => void onDelete(row)}
                onToggleLearned={() => void phrases.update(row.id, { learned: !row.learned })}
              />
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.phrasebook.edit : s.phrasebook.add}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={saving || uploading || !draft?.original.trim() || !draft?.translation.trim()}
            >
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextField
              label={s.phrasebook.original}
              placeholder={s.phrasebook.originalPlaceholder}
              value={draft.original}
              onChange={(event) => setDraft({ ...draft, original: event.target.value })}
              className="[&_input]:font-script [&_input]:text-xl"
              required
            />
            <TextField
              label={s.phrasebook.reading}
              placeholder={s.phrasebook.readingPlaceholder}
              value={draft.reading}
              onChange={(event) => setDraft({ ...draft, reading: event.target.value })}
              optional
            />
            <TextField
              label={s.phrasebook.translation}
              placeholder={s.phrasebook.translationPlaceholder}
              value={draft.translation}
              onChange={(event) => setDraft({ ...draft, translation: event.target.value })}
              required
            />
            <TextAreaField
              label={s.phrasebook.note}
              placeholder={s.phrasebook.notePlaceholder}
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              rows={3}
              optional
            />

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">{s.phrasebook.audio}</span>
              <p className="text-xs leading-relaxed text-ink-faint">{s.phrasebook.audioHint}</p>
              <input
                ref={fileInput}
                type="file"
                accept="audio/*"
                className="sr-only"
                onChange={(event) => void onPickAudio(event.target.files?.[0])}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
                  {uploading ? <Spinner /> : <Mic className="h-4 w-4" />}
                  {s.phrasebook.audioAdd}
                </Button>
                {draft.audioPath && (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      void removeMedia(draft.audioPath);
                      setDraft({ ...draft, audioPath: null });
                    }}
                  >
                    <X className="h-4 w-4" />
                    {s.phrasebook.audioRemove}
                  </Button>
                )}
              </div>
              {uploadError && <ErrorNote>{uploadError}</ErrorNote>}
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function PhraseCard({
  row,
  onEdit,
  onDelete,
  onToggleLearned,
}: {
  row: PhraseRow;
  onEdit: () => void;
  onDelete: () => void;
  onToggleLearned: () => void;
}) {
  const s = useStrings();
  const audioUrl = useSignedUrl(row.audio_path);

  return (
    <Sheet as="article">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-balance font-script text-2xl leading-snug text-ink">
            {row.script_original}
          </p>
          {row.pinyin_or_reading && (
            <p className="mt-1 text-sm italic text-ink-faint">{row.pinyin_or_reading}</p>
          )}
          <p className="mt-1.5 text-base text-ink-soft">{row.translation}</p>
          {row.note && <p className="mt-2 text-sm leading-relaxed text-ink-faint">{row.note}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-0.5">
            {audioUrl && (
              <IconButton
                label={s.phrasebook.audio}
                onClick={() => void new Audio(audioUrl).play()}
              >
                <Volume2 />
              </IconButton>
            )}
            <RecordActions onEdit={onEdit} onDelete={onDelete} />
          </div>
          <button
            type="button"
            onClick={onToggleLearned}
            aria-pressed={row.learned}
            className={
              row.learned
                ? 'inline-flex items-center gap-1 rounded-sm bg-jade/14 px-1.5 py-0.5 text-xs font-medium text-jade'
                : 'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-ink-faint hover:bg-sunk hover:text-ink'
            }
          >
            {row.learned && <Check className="h-3 w-3" />}
            {row.learned ? s.phrasebook.learned : s.phrasebook.markLearned}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Practice.
 *
 * Meaning first, then reveal. Marking one as learned advances; so does skip.
 * There is no score and no streak — this is not a language app trying to keep
 * someone engaged, it is a person trying to say one thing properly.
 */
function Practice({
  phrases,
  onExit,
  onLearned,
}: {
  phrases: PhraseRow[];
  onExit: () => void;
  onLearned: (id: string) => void;
}) {
  const s = useStrings();
  const deck = useMemo(() => phrases.filter((row) => !row.learned), [phrases]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const card = deck[index];
  const audioUrl = useSignedUrl(card?.audio_path);

  function next() {
    setRevealed(false);
    setIndex((current) => current + 1);
  }

  if (deck.length === 0 || !card) {
    return (
      <div>
        <PageHeader kicker={s.nav.phrasebook} title={s.phrasebook.practice} />
        <EmptyState
          icon={<Languages />}
          title={index > 0 ? s.phrasebook.practiceDone : s.phrasebook.practiceEmpty}
          action={
            <div className="flex gap-2">
              {index > 0 && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setIndex(0);
                    setRevealed(false);
                  }}
                >
                  {s.phrasebook.practice}
                </Button>
              )}
              <Button onClick={onExit}>{s.phrasebook.practiceStop}</Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        kicker={`${index + 1} / ${deck.length}`}
        title={s.phrasebook.practice}
        actions={<Button onClick={onExit}>{s.phrasebook.practiceStop}</Button>}
      />

      <Sheet className="flex min-h-[18rem] flex-col items-center justify-center gap-6 p-8 text-center">
        <p className="text-balance font-display text-2xl leading-snug text-ink">
          {card.translation}
        </p>

        <AnimatePresence mode="wait">
          {revealed ? (
            <motion.div
              key="revealed"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.2, 0.7, 0.3, 1] }}
              className="flex flex-col items-center gap-2"
            >
              <p className="text-balance font-script text-4xl leading-snug text-cinnabar">
                {card.script_original}
              </p>
              {card.pinyin_or_reading && (
                <p className="text-base italic text-ink-faint">{card.pinyin_or_reading}</p>
              )}
              {audioUrl && (
                <Button size="sm" onClick={() => void new Audio(audioUrl).play()}>
                  <Volume2 className="h-4 w-4" />
                  {s.phrasebook.audio}
                </Button>
              )}
            </motion.div>
          ) : (
            <motion.div key="hidden" exit={{ opacity: 0 }}>
              <Button variant="primary" size="lg" onClick={() => setRevealed(true)}>
                {s.phrasebook.practiceReveal}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </Sheet>

      {revealed && (
        <div className="mt-4 flex gap-2">
          <Button block onClick={next}>
            {s.phrasebook.practiceNext}
          </Button>
          <Button
            block
            variant="primary"
            onClick={() => {
              onLearned(card.id);
              next();
            }}
          >
            <Check className="h-4 w-4" />
            {s.phrasebook.markLearned}
          </Button>
        </div>
      )}
    </div>
  );
}
