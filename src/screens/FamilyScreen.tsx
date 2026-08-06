import { useState } from 'react';
import { AlertCircle, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Bits';
import { SelectField, TextAreaField, TextField, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader } from '@/components/ui/Surface';
import { Seal } from '@/components/ui/Seal';
import { useCouple } from '@/data/session';
import type { FamilyMemberRow, PartnerRoleColumn } from '@/data/database.types';
import { parseISODate } from '@/lib/calendar';
import { yearsBetween } from '@/lib/calendar';
import { useStrings } from '@/i18n';
import { RecordActions, useCoupleTable, usePartnerNames, useToday } from './shared';

interface Draft {
  id: string | null;
  belongsTo: PartnerRoleColumn;
  name: string;
  relation: string;
  age: string;
  birthday: string;
  notes: string;
  sensitive: boolean;
}

/**
 * The family map.
 *
 * Laid out as two small trees rather than one flat list, because "whose
 * family" is the first thing you need to know and because seeing their side
 * with its own root makes the relationships legible at a glance. The
 * "handle with care" flag is deliberately quiet — a marker, not a warning
 * label on a person.
 */
export function FamilyScreen() {
  const s = useStrings();
  const { couple } = useCouple();
  const names = usePartnerNames();
  const today = useToday();

  const family = useCoupleTable('family_members', { coupleId: couple.id, orderBy: 'created_at', ascending: true });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const theirRole: PartnerRoleColumn = names.me === 'partner_a' ? 'partner_b' : 'partner_a';

  function startNew(belongsTo: PartnerRoleColumn) {
    setDraft({
      id: null,
      belongsTo,
      name: '',
      relation: '',
      age: '',
      birthday: '',
      notes: '',
      sensitive: false,
    });
  }

  function startEdit(row: FamilyMemberRow) {
    setDraft({
      id: row.id,
      belongsTo: row.belongs_to,
      name: row.name,
      relation: row.relation,
      age: row.age === null ? '' : String(row.age),
      birthday: row.birthday ?? '',
      notes: row.notes ?? '',
      sensitive: row.sensitive,
    });
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.name.trim()) return;

    setSaving(true);
    const parsedAge = Number.parseInt(draft.age, 10);
    const values = {
      belongs_to: draft.belongsTo,
      name: draft.name.trim(),
      relation: draft.relation.trim(),
      age: Number.isFinite(parsedAge) ? parsedAge : null,
      birthday: draft.birthday || null,
      notes: draft.notes.trim() || null,
      sensitive: draft.sensitive,
    };
    if (draft.id) await family.update(draft.id, values);
    else await family.create({ ...values, couple_id: couple.id });
    setSaving(false);
    setDraft(null);
  }

  const sides: { role: PartnerRoleColumn; label: string }[] = [
    { role: theirRole, label: names.partnerName },
    { role: names.me, label: names.myName },
  ];

  return (
    <div>
      <PageHeader
        kicker={s.nav.family}
        title={s.family.title}
        subtitle={s.family.intro}
        actions={
          <Button variant="primary" onClick={() => startNew(theirRole)}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      {family.rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={s.family.emptyTitle}
          body={s.family.emptyBody}
          action={
            <Button variant="primary" onClick={() => startNew(theirRole)}>
              {s.family.add}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          {sides.map((side) => {
            const members = family.rows.filter((row) => row.belongs_to === side.role);
            if (members.length === 0) return null;

            return (
              <section key={side.role}>
                {/* The root of this little tree. */}
                <div className="mb-4 flex items-center gap-2.5">
                  <Seal
                    name={side.label}
                    size="sm"
                    tone={side.role === names.me ? 'jade' : 'cinnabar'}
                  />
                  <h2 className="font-display text-lg font-medium text-ink">{side.label}</h2>
                </div>

                <ul className="relative flex flex-col gap-2.5 pl-7">
                  {/* Trunk */}
                  <span
                    aria-hidden="true"
                    className="absolute bottom-6 left-[11px] top-[-8px] w-px bg-rule"
                  />

                  {members.map((row) => {
                    const birthday = parseISODate(row.birthday);
                    const age =
                      row.age ?? (birthday ? yearsBetween(birthday, today) : null);

                    return (
                      <li key={row.id} className="relative">
                        {/* Branch: a quarter curve off the trunk, not a right angle. */}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 24"
                          fill="none"
                          className="absolute -left-[17px] top-0 h-6 w-4 text-rule"
                        >
                          <path
                            d="M1 0v10c0 5 4 8 9 8h5"
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeLinecap="round"
                          />
                        </svg>

                        <div className="sheet flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <h3 className="font-display text-base font-medium text-ink">
                                {row.name}
                              </h3>
                              {row.relation && (
                                <span className="text-sm text-ink-soft">{row.relation}</span>
                              )}
                              {age !== null && (
                                <span className="text-sm tabular-nums text-ink-faint">{age}</span>
                              )}
                              {row.sensitive && (
                                <Tag tone="cinnabar">
                                  <AlertCircle className="h-3 w-3" />
                                  {s.family.sensitive}
                                </Tag>
                              )}
                            </div>
                            {row.notes && (
                              <p className="mt-1.5 whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-soft">
                                {row.notes}
                              </p>
                            )}
                          </div>
                          <RecordActions
                            onEdit={() => startEdit(row)}
                            onDelete={() => void family.remove(row.id)}
                          />
                        </div>
                      </li>
                    );
                  })}

                  <li className="relative pt-1">
                    <Button size="sm" variant="quiet" onClick={() => startNew(side.role)}>
                      <Plus className="h-3.5 w-3.5" />
                      {s.family.add}
                    </Button>
                  </li>
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.family.edit : s.family.add}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={saving || !draft?.name.trim()}
            >
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextField
              label={s.family.name}
              placeholder={s.family.namePlaceholder}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
            />
            <TextField
              label={s.family.relation}
              placeholder={s.family.relationPlaceholder}
              value={draft.relation}
              onChange={(event) => setDraft({ ...draft, relation: event.target.value })}
            />
            <SelectField
              label={s.family.belongsTo}
              value={draft.belongsTo}
              onChange={(event) =>
                setDraft({ ...draft, belongsTo: event.target.value as PartnerRoleColumn })
              }
            >
              <option value={theirRole}>{names.partnerName}</option>
              <option value={names.me}>{names.myName}</option>
            </SelectField>

            <div className="grid grid-cols-2 gap-4">
              <TextField
                label={s.family.age}
                type="number"
                inputMode="numeric"
                min={0}
                max={129}
                value={draft.age}
                onChange={(event) => setDraft({ ...draft, age: event.target.value })}
                optional
              />
              <TextField
                label={s.family.birthday}
                type="date"
                value={draft.birthday}
                onChange={(event) => setDraft({ ...draft, birthday: event.target.value })}
                optional
              />
            </div>

            <TextAreaField
              label={s.family.notes}
              placeholder={s.family.notesPlaceholder}
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              rows={4}
            />

            <Toggle
              label={s.family.sensitive}
              hint={s.family.sensitiveHint}
              checked={draft.sensitive}
              onChange={(sensitive) => setDraft({ ...draft, sensitive })}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
