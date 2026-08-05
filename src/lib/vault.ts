/**
 * The remember vault — categories, visibility, search, coverage.
 *
 * `visibility` is the load-bearing concept in this whole app. A `shared` note
 * is something both people can see and edit; a `private` note is one person's
 * own attempt to be better at loving the other, and it belongs to its author
 * alone. The database enforces this (see the RLS policies); this module only
 * describes and filters it.
 */

export type FactCategory =
  | 'communication'
  | 'love_language'
  | 'culture'
  | 'preferences'
  | 'boundaries'
  | 'past'
  | 'other';

export const FACT_CATEGORIES: readonly FactCategory[] = [
  'communication',
  'love_language',
  'culture',
  'preferences',
  'boundaries',
  'past',
  'other',
];

export type Visibility = 'shared' | 'private';

export interface Fact {
  id: string;
  category: FactCategory;
  question: string;
  answer: string;
  visibility: Visibility;
  authorId: string;
}

function haystack(fact: Fact): string {
  return `${fact.question} ${fact.answer}`.toLowerCase();
}

/**
 * Naive multi-term search: every whitespace-separated term must appear
 * somewhere in the question or the answer. Good enough for a few hundred
 * notes, and it never surprises you by ranking things.
 */
export function searchFacts(facts: readonly Fact[], query: string): Fact[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...facts];
  return facts.filter((fact) => {
    const text = haystack(fact);
    return terms.every((term) => text.includes(term));
  });
}

export interface FactFilter {
  category?: FactCategory | 'all';
  visibility?: Visibility | 'all';
  query?: string;
}

export function filterFacts(facts: readonly Fact[], filter: FactFilter): Fact[] {
  const { category = 'all', visibility = 'all', query = '' } = filter;
  let result = facts.filter((fact) => {
    if (category !== 'all' && fact.category !== category) return false;
    if (visibility !== 'all' && fact.visibility !== visibility) return false;
    return true;
  });
  if (query.trim()) result = searchFacts(result, query);
  return result;
}

export interface CategoryCoverage {
  category: FactCategory;
  count: number;
}

export function coverageByCategory(facts: readonly Fact[]): CategoryCoverage[] {
  const counts = new Map<FactCategory, number>();
  for (const fact of facts) counts.set(fact.category, (counts.get(fact.category) ?? 0) + 1);
  return FACT_CATEGORIES.map((category) => ({ category, count: counts.get(category) ?? 0 }));
}

/** The categories with the least written down — where the next conversation is. */
export function thinnestCategories(facts: readonly Fact[], count = 2): FactCategory[] {
  return coverageByCategory(facts)
    .sort((a, b) => a.count - b.count || a.category.localeCompare(b.category))
    .slice(0, count)
    .map((entry) => entry.category);
}
