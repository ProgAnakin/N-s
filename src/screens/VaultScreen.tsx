import { useMemo, useState } from 'react';
import { Lock, NotebookPen, Plus, Search, Sparkles, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, VisibilityBadge } from '@/components/ui/Bits';
import { ChoiceField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, Sheet } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import { useTable } from '@/data/useTable';
import { toFact } from '@/data/mappers';
import type {
  AnswerKindColumn,
  FactCategoryColumn,
  RememberFactRow,
  VisibilityColumn,
} from '@/data/database.types';
import { toEpochDay } from '@/lib/calendar';
import { openQuestions, suggestQuestions } from '@/lib/questions';
import { FACT_CATEGORIES, filterFacts, type FactCategory } from '@/lib/vault';
import { useStrings } from '@/i18n';
import { FilterBar, RecordActions, useCoupleTable, usePartnerNames, useToday } from './shared';

interface Draft {
  id: string | null;
  category: FactCategoryColumn;
  question: string;
  answer: string;
  visibility: VisibilityColumn;
  remindOn: string;
  /** Which question from the bank this came from, when it came from one. */
  questionId: string | null;
  /**
   * What kind of thing the answer is.
   *
   * This is the field that decides whether an answer can ever come back as
   * something useful. A prompt from the bank fills it in already — the bank
   * knows that "what food tastes like home" produces a taste — so in the
   * common path nobody is asked anything extra.
   */
  answerKind: AnswerKindColumn;
}

/** Mirrors the CHECK on `remember_facts.answer_kind` in 0011. */
const ANSWER_KINDS: readonly AnswerKindColumn[] = [
  'insight',
  'taste',
  'place',
  'activity',
  'boundary',
  'date',
];

function emptyDraft(question = ''): Draft {
  return {
    id: null,
    category: 'other',
    question,
    answer: '',
    // Private by default. Deciding to share a note about someone should be a
    // deliberate act, not something that happens because you did not look.
    visibility: 'private',
    remindOn: '',
    questionId: null,
    answerKind: 'insight',
  };
}

/**
 * The remember vault.
 *
 * The framing matters as much as the data here. This is not a dossier: the
 * private half is explicitly "my notes on paying attention", and the prompts
 * are offered a few at a time rather than as a fifty-item checklist to grind
 * through. Nothing on this page ranks or scores the other person.
 */
export function VaultScreen() {
  const s = useStrings();
  const { couple, profile } = useCouple();
  const names = usePartnerNames();
  const today = useToday();

  const facts = useCoupleTable('remember_facts', { coupleId: couple.id, orderBy: 'updated_at' });
  const dismissed = useTable('dismissed_questions', {
    column: 'author_id',
    value: profile.id,
    orderBy: 'created_at',
  });

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FactCategory | 'all'>('all');
  const [visibility, setVisibility] = useState<VisibilityColumn | 'all'>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPrompts, setShowPrompts] = useState(true);

  const domainFacts = useMemo(() => facts.rows.map(toFact), [facts.rows]);
  const visible = useMemo(
    () => filterFacts(domainFacts, { category, visibility, query }),
    [domainFacts, category, visibility, query],
  );

  const sharedCount = domainFacts.filter((fact) => fact.visibility === 'shared').length;
  const privateCount = domainFacts.length - sharedCount;

  const prompts = useMemo(() => {
    const answered = facts.rows.map((row) => row.question);
    const dismissedIds = dismissed.rows.map((row) => row.question_id);
    // Seeded by the day so the same three sit there all day rather than
    // reshuffling on every render.
    return suggestQuestions(openQuestions(answered, dismissedIds), toEpochDay(today), 3);
  }, [facts.rows, dismissed.rows, today]);

  function startEdit(row: RememberFactRow) {
    setDraft({
      id: row.id,
      category: row.category,
      question: row.question,
      questionId: row.question_id ?? null,
      answerKind: row.answer_kind ?? 'insight',
      answer: row.answer,
      visibility: row.visibility,
      remindOn: row.remind_on ?? '',
    });
  }

  // Accepts an optional event so the same handler serves both the form's
  // submit and the footer button, which lives outside the <form>.
  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.question.trim()) return;

    setSaving(true);
    const values = {
      category: draft.category,
      question: draft.question.trim(),
      answer: draft.answer.trim(),
      visibility: draft.visibility,
      remind_on: draft.remindOn || null,
      question_id: draft.questionId,
      answer_kind: draft.answerKind,
    };

    if (draft.id) {
      await facts.update(draft.id, values);
    } else {
      await facts.create({ ...values, couple_id: couple.id, author_id: profile.id });
    }
    setSaving(false);
    setDraft(null);
  }

  async function dismissPrompt(questionId: string) {
    await dismissed.create({
      couple_id: couple.id,
      author_id: profile.id,
      question_id: questionId,
    });
  }

  const filtering = query.trim() !== '' || category !== 'all' || visibility !== 'all';

  return (
    <div>
      <PageHeader
        kicker={s.nav.vault}
        // Her actual name, rather than "her": the app should not assume the
        // shape of the couple using it.
        title={names.hasPartner ? s.nav.vaultOf(names.partnerName) : s.vault.title}
        subtitle={s.vault.intro}
        actions={
          <Button variant="primary" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      {/* --- Prompts ------------------------------------------------------- */}
      {showPrompts && prompts.length > 0 && (
        <section className="mb-8" aria-labelledby="prompts">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="prompts" className="label-kicker flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-cinnabar" />
              {s.vault.promptsTitle}
            </h2>
            <button
              type="button"
              onClick={() => setShowPrompts(false)}
              className="text-xs text-ink-faint underline-offset-4 hover:text-ink hover:underline"
            >
              {s.common.close}
            </button>
          </div>
          <p className="mb-3 text-sm text-ink-soft">{s.vault.promptsBody}</p>
          <ul className="flex flex-col gap-2">
            {prompts.map((prompt) => (
              <li key={prompt.id}>
                <Sheet className="flex items-start gap-3">
                  <p className="min-w-0 flex-1 text-pretty font-display text-base leading-snug text-ink">
                    {prompt.question}
                  </p>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        setDraft({
                          ...emptyDraft(prompt.question),
                          category: prompt.category,
                          // The bank already knows what shape of answer this
                          // question produces, so the reader is asked nothing
                          // extra in the common path.
                          questionId: prompt.id,
                          answerKind: prompt.yields,
                        })
                      }
                    >
                      {s.vault.promptsAnswer}
                    </Button>
                    <IconButton
                      label={s.vault.promptsDismiss}
                      onClick={() => void dismissPrompt(prompt.id)}
                    >
                      <X />
                    </IconButton>
                  </div>
                </Sheet>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Search and filters --------------------------------------------- */}
      <div className="mb-4">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={s.vault.searchPlaceholder}
            aria-label={s.common.search}
            className="field pl-9"
          />
        </div>
      </div>

      <FilterBar>
        <Chip selected={visibility === 'all'} onClick={() => setVisibility('all')}>
          {s.common.all} · {domainFacts.length}
        </Chip>
        <Chip selected={visibility === 'shared'} onClick={() => setVisibility('shared')}>
          {s.vault.countShared(sharedCount)}
        </Chip>
        <Chip selected={visibility === 'private'} onClick={() => setVisibility('private')}>
          {s.vault.countPrivate(privateCount)}
        </Chip>
      </FilterBar>

      <FilterBar>
        <Chip selected={category === 'all'} onClick={() => setCategory('all')}>
          {s.common.all}
        </Chip>
        {FACT_CATEGORIES.map((value) => (
          <Chip key={value} selected={category === value} onClick={() => setCategory(value)}>
            {s.factCategories[value]}
          </Chip>
        ))}
      </FilterBar>

      {/* --- The notes ------------------------------------------------------- */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title={filtering ? s.common.noResults : s.vault.emptyTitle}
          body={filtering ? s.vault.emptyFiltered : s.vault.emptyBody}
          action={
            !filtering && (
              <Button variant="primary" onClick={() => setDraft(emptyDraft())}>
                {s.vault.addFact}
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((fact) => {
            const row = facts.rows.find((candidate) => candidate.id === fact.id);
            if (!row) return null;
            return (
              <li key={fact.id}>
                <Sheet as="article">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <VisibilityBadge visibility={fact.visibility} />
                        <span className="text-xs text-ink-faint">
                          {s.factCategories[fact.category]}
                        </span>
                      </div>
                      <h3 className="text-pretty font-display text-base font-medium leading-snug text-ink">
                        {fact.question}
                      </h3>
                      {fact.answer && (
                        <p className="mt-1.5 whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-soft">
                          {fact.answer}
                        </p>
                      )}
                    </div>
                    <RecordActions
                      onEdit={() => startEdit(row)}
                      onDelete={() => void facts.remove(fact.id)}
                    />
                  </div>
                </Sheet>
              </li>
            );
          })}
        </ul>
      )}

      {/* --- Editor ---------------------------------------------------------- */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.vault.editFact : s.vault.addFact}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={saving || !draft?.question.trim()}
            >
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextAreaField
              label={s.vault.question}
              placeholder={s.vault.questionPlaceholder}
              value={draft.question}
              onChange={(event) => setDraft({ ...draft, question: event.target.value })}
              rows={2}
              required
            />
            <TextAreaField
              label={s.vault.answer}
              placeholder={s.vault.answerPlaceholder}
              value={draft.answer}
              onChange={(event) => setDraft({ ...draft, answer: event.target.value })}
              rows={5}
            />
            <SelectField
              label={s.vault.category}
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value as FactCategoryColumn })
              }
            >
              {FACT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {s.factCategories[value]}
                </option>
              ))}
            </SelectField>

            {/* Placed above visibility rather than below: what a note *is*
                comes before who may read it, and a prompt from the bank has
                already answered this one. */}
            <SelectField
              label={s.vault.answerKind}
              value={draft.answerKind}
              onChange={(event) =>
                setDraft({ ...draft, answerKind: event.target.value as AnswerKindColumn })
              }
              hint={s.vault.answerKindHints[draft.answerKind] ?? s.vault.answerKindHint}
            >
              {ANSWER_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {s.vault.answerKinds[kind]}
                </option>
              ))}
            </SelectField>

            <ChoiceField
              label={s.vault.visibility}
              value={draft.visibility}
              onChange={(value) => setDraft({ ...draft, visibility: value })}
              options={[
                {
                  value: 'private',
                  label: s.common.private,
                  hint: s.common.privateHint,
                },
                {
                  value: 'shared',
                  label: s.common.shared,
                  hint: s.common.sharedHint,
                },
              ]}
            />

            <TextField
              label={s.vault.remindOn}
              type="date"
              value={draft.remindOn}
              onChange={(event) => setDraft({ ...draft, remindOn: event.target.value })}
              hint={s.vault.remindOnHint}
              optional
            />

            {draft.visibility === 'private' && (
              <p className="flex items-start gap-2 rounded-sm bg-sunk px-3 py-2 text-xs leading-relaxed text-ink-soft">
                <Lock className="mt-px h-3.5 w-3.5 shrink-0" />
                {s.vault.privateNoteBody}
              </p>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
