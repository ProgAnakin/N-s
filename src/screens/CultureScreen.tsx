import { useState } from 'react';
import { Compass, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip, Tag } from '@/components/ui/Bits';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, Sheet } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import type { CultureCategoryColumn, CultureNoteRow } from '@/data/database.types';
import { useStrings } from '@/i18n';
import { FilterBar, RecordActions, useCoupleTable } from './shared';

const CULTURE_CATEGORIES: readonly CultureCategoryColumn[] = [
  'lucky',
  'unlucky',
  'tradition',
  'food',
  'etiquette',
  'gift',
];

interface Draft {
  id: string | null;
  title: string;
  note: string;
  category: CultureCategoryColumn;
}

function emptyDraft(): Draft {
  return { id: null, title: '', note: '', category: 'tradition' };
}

/** The cultural manual — the rules that are obvious to everyone inside a culture. */
export function CultureScreen() {
  const s = useStrings();
  const { couple } = useCouple();

  const notes = useCoupleTable('culture_notes', { coupleId: couple.id, orderBy: 'created_at' });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<CultureCategoryColumn | 'all'>('all');

  const visible = notes.rows.filter((row) => category === 'all' || row.category === category);

  function startEdit(row: CultureNoteRow) {
    setDraft({ id: row.id, title: row.title, note: row.note, category: row.category });
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.title.trim()) return;

    setSaving(true);
    const values = {
      title: draft.title.trim(),
      note: draft.note.trim(),
      category: draft.category,
    };
    if (draft.id) await notes.update(draft.id, values);
    else await notes.create({ ...values, couple_id: couple.id });
    setSaving(false);
    setDraft(null);
  }

  return (
    <div>
      <PageHeader
        kicker={s.nav.culture}
        title={s.culture.title}
        subtitle={s.culture.intro}
        actions={
          <Button variant="primary" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      {notes.rows.length > 0 && (
        <FilterBar>
          <Chip selected={category === 'all'} onClick={() => setCategory('all')}>
            {s.common.all}
          </Chip>
          {CULTURE_CATEGORIES.map((value) => (
            <Chip key={value} selected={category === value} onClick={() => setCategory(value)}>
              {s.cultureCategories[value]}
            </Chip>
          ))}
        </FilterBar>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Compass />}
          title={notes.rows.length === 0 ? s.culture.emptyTitle : s.common.noResults}
          body={notes.rows.length === 0 ? s.culture.emptyBody : s.common.noResultsHint}
          action={
            notes.rows.length === 0 && (
              <Button variant="primary" onClick={() => setDraft(emptyDraft())}>
                {s.culture.add}
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((row) => (
            <li key={row.id}>
              <Sheet as="article" className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Tag tone={row.category === 'unlucky' ? 'cinnabar' : 'jade'} className="mb-2">
                    {s.cultureCategories[row.category]}
                  </Tag>
                  <h3 className="text-pretty font-display text-base font-medium leading-snug text-ink">
                    {row.title}
                  </h3>
                  {row.note && (
                    <p className="mt-1.5 whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-soft">
                      {row.note}
                    </p>
                  )}
                </div>
                <RecordActions
                  onEdit={() => startEdit(row)}
                  onDelete={() => void notes.remove(row.id)}
                />
              </Sheet>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.culture.edit : s.culture.add}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={saving || !draft?.title.trim()}
            >
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextField
              label={s.culture.noteTitle}
              placeholder={s.culture.titlePlaceholder}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              required
            />
            <SelectField
              label={s.culture.category}
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value as CultureCategoryColumn })
              }
            >
              {CULTURE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {s.cultureCategories[value]}
                </option>
              ))}
            </SelectField>
            <TextAreaField
              label={s.culture.note}
              placeholder={s.culture.notePlaceholder}
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              rows={5}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
