import { useMemo } from 'react';
import { useCouple } from '@/data/session';
import { useCoupleTable } from '@/screens/shared';
import { toISODate, type CalendarDate } from '@/lib/calendar';
import type { Searchable } from '@/lib/search';
import { useStrings } from '@/i18n';

/**
 * Everything the couple has written, gathered into one list to search.
 *
 * Read only while the search is actually open — `enabled` gates every one of
 * these, so the ordinary cost of the feature on every other page is zero.
 * Ten reads is a lot to pay for a box nobody opened.
 *
 * **What is deliberately not in here**, and why each one:
 *
 * - **Gift ideas and wishes.** They are a surprise. They are private to
 *   their author at the database level, so nobody else could find them — but
 *   a search result is a thing that appears on a screen, and screens get
 *   read over shoulders. The one feature in the app whose whole value is
 *   that the other person does not know does not belong in a box that
 *   answers instantly as you type.
 *
 * - **Sealed letters.** A letter with `open_on` in the future is not
 *   readable yet, and finding it by searching its own text would open it
 *   through the side door. The list below filters them out; the RLS
 *   deliberately does not, because the recipient is allowed the row, just
 *   not yet the reading of it.
 *
 * - **The cycle log and the together log.** Not because they are secret —
 *   the couple chose to keep them — but because neither is prose. There is
 *   nothing in them a person would ever go looking for by word.
 *
 * Private notes *are* in here, and marked. They are yours; being unable to
 * find your own notes is the problem this whole feature exists to fix.
 */
export function useSearchIndex(enabled: boolean): { items: Searchable[]; loading: boolean } {
  const s = useStrings();
  const { couple, profile } = useCouple();
  const options = { coupleId: couple.id, enabled };

  const memories = useCoupleTable('memories', { ...options, columns: 'id,title,note,date' });
  const letters = useCoupleTable('letters', {
    ...options,
    columns: 'id,body,kind,open_on,created_at',
  });
  const facts = useCoupleTable('remember_facts', {
    ...options,
    columns: 'id,question,answer,category,visibility,author_id,created_at',
  });
  const phrases = useCoupleTable('phrases', {
    ...options,
    columns: 'id,script_original,pinyin_or_reading,translation,note',
  });
  const culture = useCoupleTable('culture_notes', {
    ...options,
    columns: 'id,title,note,category',
  });
  const family = useCoupleTable('family_members', {
    ...options,
    columns: 'id,name,relation,notes,belongs_to',
  });
  const ideas = useCoupleTable('date_ideas', { ...options, columns: 'id,title,note,bring' });
  const trips = useCoupleTable('trips', {
    ...options,
    columns: 'id,destination,notes,start_date',
  });
  const dates = useCoupleTable('important_dates', { ...options, columns: 'id,label,date,type' });
  const places = useCoupleTable('places', { ...options, columns: 'id,label' });
  const expenses = useCoupleTable('expenses', {
    ...options,
    columns: 'id,label,note,date,category',
  });

  const items = useMemo<Searchable[]>(() => {
    if (!enabled) return [];
    const out: Searchable[] = [];

    for (const row of memories.rows) {
      out.push({
        id: row.id,
        kind: 'memory',
        title: row.title,
        body: row.note,
        date: row.date,
        href: '/memories',
      });
    }

    for (const row of letters.rows) {
      // Sealed until its day. Searchable text would be an open envelope.
      if (row.open_on && row.open_on > todayIso()) continue;
      out.push({
        id: row.id,
        kind: 'letter',
        title: s.letters.kinds[row.kind]?.name ?? s.nav.letters,
        body: row.body,
        date: row.created_at.slice(0, 10),
        href: '/letters',
      });
    }

    for (const row of facts.rows) {
      out.push({
        id: row.id,
        kind: 'note',
        title: row.question,
        body: row.answer,
        also: [s.factCategories[row.category]],
        date: row.created_at.slice(0, 10),
        href: '/vault',
        onlyMine: row.visibility === 'private' && row.author_id === profile.id,
      });
    }

    for (const row of phrases.rows) {
      out.push({
        id: row.id,
        kind: 'phrase',
        title: row.script_original,
        body: row.translation,
        also: [row.pinyin_or_reading, row.note],
        href: '/phrasebook',
      });
    }

    for (const row of culture.rows) {
      out.push({
        id: row.id,
        kind: 'culture',
        title: row.title,
        body: row.note,
        also: [s.cultureCategories[row.category]],
        href: '/culture',
      });
    }

    for (const row of family.rows) {
      out.push({
        id: row.id,
        kind: 'person',
        title: row.name,
        body: row.notes,
        also: [row.relation],
        href: '/family',
      });
    }

    for (const row of ideas.rows) {
      out.push({
        id: row.id,
        kind: 'idea',
        title: row.title,
        body: row.note,
        also: [row.bring],
        href: '/ideas',
      });
    }

    for (const row of trips.rows) {
      out.push({
        id: row.id,
        kind: 'trip',
        title: row.destination,
        body: row.notes,
        date: row.start_date,
        href: `/trips/${row.id}`,
      });
    }

    for (const row of dates.rows) {
      out.push({
        id: row.id,
        kind: 'date',
        title: row.label,
        also: [s.dateTypes[row.type]],
        date: row.date,
        href: '/dates',
      });
    }

    for (const row of places.rows) {
      out.push({ id: row.id, kind: 'place', title: row.label, href: '/calendar' });
    }

    for (const row of expenses.rows) {
      out.push({
        id: row.id,
        kind: 'expense',
        title: row.label,
        body: row.note,
        also: [s.expenseCategories[row.category]],
        date: row.date,
        href: '/spending',
      });
    }

    return out;
  }, [
    enabled,
    s,
    profile.id,
    memories.rows,
    letters.rows,
    facts.rows,
    phrases.rows,
    culture.rows,
    family.rows,
    ideas.rows,
    trips.rows,
    dates.rows,
    places.rows,
    expenses.rows,
  ]);

  const loading =
    enabled &&
    (memories.loading || letters.loading || facts.loading || phrases.loading || culture.loading);

  return { items, loading };
}

function todayIso(): string {
  const now = new Date();
  const date: CalendarDate = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
  return toISODate(date);
}
