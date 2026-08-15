import { describe, expect, it } from 'vitest';
import {
  coverageByCategory,
  filterFacts,
  searchFacts,
  thinnestCategories,
  type Fact,
} from './vault';
import { openQuestions, QUESTION_BANK, questionsInCategory, suggestQuestions } from './questions';

const facts: Fact[] = [
  {
    id: '1',
    category: 'communication',
    question: 'When you go quiet, what does it usually mean?',
    answer: 'Usually tired, not angry. Ask gently, do not push.',
    visibility: 'shared',
    authorId: 'a',
  },
  {
    id: '2',
    category: 'culture',
    question: 'What food tastes like home to you?',
    answer: 'Her grandmother’s tomato and egg.',
    visibility: 'shared',
    authorId: 'a',
  },
  {
    id: '3',
    category: 'boundaries',
    question: 'What is off-limits to joke about?',
    answer: 'Her height. Not funny to her.',
    visibility: 'private',
    authorId: 'a',
  },
];

describe('searchFacts', () => {
  it('returns everything for an empty query', () => {
    expect(searchFacts(facts, '   ')).toHaveLength(3);
  });

  it('searches the answer as well as the question', () => {
    expect(searchFacts(facts, 'tomato').map((f) => f.id)).toEqual(['2']);
  });

  it('requires every term to match', () => {
    expect(searchFacts(facts, 'quiet tired')).toHaveLength(1);
    expect(searchFacts(facts, 'quiet tomato')).toHaveLength(0);
  });

  it('ignores case', () => {
    expect(searchFacts(facts, 'ANGRY')).toHaveLength(1);
  });
});

describe('filterFacts', () => {
  it('filters by category', () => {
    expect(filterFacts(facts, { category: 'culture' })).toHaveLength(1);
  });

  it('filters by visibility', () => {
    expect(filterFacts(facts, { visibility: 'private' }).map((f) => f.id)).toEqual(['3']);
    expect(filterFacts(facts, { visibility: 'shared' })).toHaveLength(2);
  });

  it('combines filters with search', () => {
    expect(filterFacts(facts, { visibility: 'shared', query: 'home' })).toHaveLength(1);
    expect(filterFacts(facts, { visibility: 'private', query: 'home' })).toHaveLength(0);
  });
});

describe('coverage', () => {
  it('reports every category, including the empty ones', () => {
    const coverage = coverageByCategory(facts);
    expect(coverage).toHaveLength(7);
    expect(coverage.find((c) => c.category === 'communication')?.count).toBe(1);
    expect(coverage.find((c) => c.category === 'past')?.count).toBe(0);
  });

  it('points at the categories with the least written down', () => {
    expect(thinnestCategories(facts, 2).every((c) => ['love_language', 'other', 'past', 'preferences'].includes(c))).toBe(
      true,
    );
  });
});

describe('question bank', () => {
  it('ships over fifty questions', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(50);
  });

  it('has unique ids', () => {
    const ids = QUESTION_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every category', () => {
    for (const category of ['communication', 'love_language', 'culture', 'preferences', 'boundaries', 'past', 'other'] as const) {
      expect(questionsInCategory(category).length).toBeGreaterThan(0);
    }
  });

  it('treats an answered question as asked, whatever the casing', () => {
    const answered = ['  WHEN YOU GO QUIET, WHAT DOES IT USUALLY MEAN?  '];
    const open = openQuestions(answered, []);
    expect(open.some((q) => q.id === 'q01')).toBe(false);
    expect(open.length).toBe(QUESTION_BANK.length - 1);
  });

  it('respects dismissed questions', () => {
    expect(openQuestions([], ['q01']).some((q) => q.id === 'q01')).toBe(false);
  });

  it('can narrow to one category', () => {
    expect(openQuestions([], [], 'culture').every((q) => q.category === 'culture')).toBe(true);
  });

  it('suggests a stable selection for a given seed', () => {
    const open = openQuestions([], []);
    expect(suggestQuestions(open, 42, 3)).toEqual(suggestQuestions(open, 42, 3));
    expect(suggestQuestions(open, 42, 3)).toHaveLength(3);
  });

  it('never suggests the same question twice in one batch', () => {
    const open = openQuestions([], []);
    const picked = suggestQuestions(open, 7, 3).map((q) => q.id);
    expect(new Set(picked).size).toBe(3);
  });

  it('copes with an empty or nearly empty pool', () => {
    expect(suggestQuestions([], 1, 3)).toEqual([]);
    expect(suggestQuestions([QUESTION_BANK[0]], 5, 3)).toHaveLength(1);
  });
});
