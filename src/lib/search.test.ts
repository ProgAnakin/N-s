import { describe, expect, it } from 'vitest';
import {
  fold,
  groupByKind,
  quoteAround,
  scoreItem,
  search,
  terms,
  type Searchable,
} from './search';

/**
 * Finding it again.
 *
 * Three rules, and each has its own describe block below: it quotes rather
 * than summarises, it matches substrings so Chinese works at all, and it
 * never widens what somebody can see.
 */

function item(over: Partial<Searchable> = {}): Searchable {
  return {
    id: `i-${Math.random().toString(36).slice(2)}`,
    kind: 'note',
    title: 'What flowers do you actually like?',
    body: 'Peonies, the big pale ones. Not roses, she was quite firm about that.',
    href: '/vault',
    date: '2025-03-01',
    ...over,
  };
}

describe('fold', () => {
  it('lowercases and strips accents', () => {
    expect(fold('Avó CAFÉ').text).toBe('avo cafe');
  });

  it('leaves Chinese alone', () => {
    expect(fold('慢慢来').text).toBe('慢慢来');
  });

  /**
   * The whole reason folding is not a one-liner: 'é' decomposes to two code
   * units, so an index into the folded string means nothing in the original
   * — and an index into the original is exactly what quoting verbatim needs.
   */
  it('maps every folded character back to where it came from', () => {
    const folded = fold('café');
    expect(folded.text).toBe('cafe');
    expect(folded.map).toEqual([0, 1, 2, 3]);

    const combining = fold('café');
    expect(combining.text).toBe('cafe');
    // The combining accent folds away to nothing and takes no slot.
    expect(combining.map).toEqual([0, 1, 2, 3]);
  });
});

describe('terms', () => {
  it('splits on whitespace and folds each piece', () => {
    expect(terms('  Avó   CAFÉ ')).toEqual(['avo', 'cafe']);
  });

  it('drops duplicates so a repeated word does not score twice', () => {
    expect(terms('peonies peonies')).toEqual(['peonies']);
  });

  it('is empty for an empty query', () => {
    expect(terms('   ')).toEqual([]);
    expect(search('   ', [item()])).toEqual([]);
  });
});

describe('matching', () => {
  it('finds a word in the body', () => {
    expect(search('peonies', [item()])).toHaveLength(1);
  });

  it('finds a word in the title', () => {
    expect(search('flowers', [item()])).toHaveLength(1);
  });

  it('ignores case and accents, because nobody types accents into a search box', () => {
    const avo = item({ title: 'A avó dela', body: 'Mora em São Paulo.' });
    expect(search('avo', [avo])).toHaveLength(1);
    expect(search('SAO PAULO', [avo])).toHaveLength(1);
  });

  /**
   * Chinese has no spaces. A word-boundary tokeniser would never find this,
   * and it is most of the phrasebook.
   */
  it('matches inside a run of Chinese with no spaces in it', () => {
    const phrase = item({ kind: 'phrase', title: '慢慢来', body: 'Take your time' });
    expect(search('慢来', [phrase])).toHaveLength(1);
    expect(search('慢慢来', [phrase])).toHaveLength(1);
  });

  /**
   * Typing a second word to narrow a search and getting *more* results is
   * the single most annoying thing a search box can do.
   */
  it('requires every term, so a longer query narrows', () => {
    const one = item({ title: 'Her mother', body: 'Calls every Sunday.' });
    const two = item({ title: 'Her brother', body: 'Calls at new year.' });

    expect(search('calls', [one, two])).toHaveLength(2);
    expect(search('calls sunday', [one, two])).toHaveLength(1);
  });

  it('finds terms spread across the title and the body', () => {
    expect(search('flowers peonies', [item()])).toHaveLength(1);
  });

  it('returns nothing rather than everything when nothing matches', () => {
    expect(search('helicopter', [item()])).toEqual([]);
  });

  /**
   * A category is worth matching — "show me the food ones" — but is not
   * something a person wrote, so it never becomes a quote.
   */
  it('matches on the extra text without ever quoting it', () => {
    const note = item({ title: 'Fish at new year', body: null, also: ['food', 'tradition'] });
    const [hit] = search('food', [note]);
    expect(hit).toBeDefined();
    expect(hit!.quote).toBeNull();
  });
});

describe('what it shows you', () => {
  /**
   * The rule the rest of the app keeps about a partner's words, kept in the
   * place it would be easiest to break — because a summary is so much
   * tidier than a quote.
   */
  it('quotes the words that were written, with the match inside them', () => {
    const [hit] = search('roses', [item()]);
    const quote = hit!.quote!;

    expect(quote.match).toBe('roses');
    expect(`${quote.before}${quote.match}${quote.after}`.replace(/…/g, '')).toBe(
      'Peonies, the big pale ones. Not roses, she was quite firm about that.',
    );
  });

  it('keeps the original case and accents in the quote', () => {
    const note = item({ body: 'Ela disse: não gosto de rosas, gosto de peônias.' });
    const [hit] = search('peonias', [note]);
    expect(hit!.quote!.match).toBe('peônias');
  });

  it('marks where it trimmed, and nowhere else', () => {
    const long = 'x'.repeat(200) + ' needle ' + 'y'.repeat(200);
    const quote = quoteAround(long, { start: 201, end: 207, wholeWord: true });

    expect(quote.before.startsWith('…')).toBe(true);
    expect(quote.after.endsWith('…')).toBe(true);
    expect(quote.match).toBe('needle');
  });

  it('adds no ellipsis to a quote that is the whole thing', () => {
    const [hit] = search('peonies', [item({ body: 'Peonies.' })]);
    expect(hit!.quote).toEqual({ before: '', match: 'Peonies', after: '.' });
  });

  it('does not begin a quote mid-word where there are spaces to snap to', () => {
    const body = 'They went to the market on Saturday morning and bought peonies for the table.';
    const [hit] = search('peonies', [item({ body })]);
    const before = hit!.quote!.before.replace('…', '');
    expect(body).toContain(before);
    expect(before.startsWith(' ')).toBe(false);
  });

  it('has nothing to quote when the match was only in the title', () => {
    const [hit] = search('flowers', [item({ body: null })]);
    expect(hit!.quote).toBeNull();
  });
});

describe('the order they come back in', () => {
  it('puts a title match above a body match', () => {
    const inTitle = item({ id: 'title', title: 'Peonies', body: 'Something else entirely.' });
    const inBody = item({ id: 'body', title: 'Flowers', body: 'She likes peonies.' });

    const [first] = search('peonies', [inBody, inTitle]);
    expect(first!.item.id).toBe('title');
  });

  it('puts a whole word above the middle of a longer one', () => {
    const whole = item({ id: 'whole', title: 'Rose', body: null });
    const inside = item({ id: 'inside', title: 'Prosecco', body: null });

    const hits = search('rose', [inside, whole]);
    expect(hits.map((hit) => hit.item.id)).toEqual(['whole', 'inside']);
  });

  it('breaks a tie on date, newest first', () => {
    const older = item({ id: 'older', title: 'Peonies', body: null, date: '2024-01-01' });
    const newer = item({ id: 'newer', title: 'Peonies', body: null, date: '2026-01-01' });

    expect(search('peonies', [older, newer]).map((hit) => hit.item.id)).toEqual(['newer', 'older']);
  });

  /**
   * Postgres promises nothing about row order without an ORDER BY, so two
   * identical searches can be handed the same rows in a different order. The
   * results must not move.
   */
  it('lands the same way however the rows happened to arrive', () => {
    const a = item({ id: 'a', title: 'Peonies', body: null, date: '2026-01-01' });
    const b = item({ id: 'b', title: 'Peonies', body: null, date: '2026-01-01' });

    const once = search('peonies', [a, b]).map((hit) => hit.item.id);
    const again = search('peonies', [b, a]).map((hit) => hit.item.id);
    expect(once).toEqual(['a', 'b']);
    expect(again).toEqual(once);
  });
});

describe('what is private stays private', () => {
  /**
   * This module never sees a row it was not handed — the decision is made
   * where the rows are collected. What it does carry is the flag, so the
   * interface can say which results only one person can see. Finding out
   * that a search *matched* something you cannot read is itself a leak.
   */
  it('carries the flag through untouched', () => {
    const mine = item({ id: 'mine', onlyMine: true });
    const [hit] = search('peonies', [mine]);
    expect(hit!.item.onlyMine).toBe(true);
  });

  it('finds nothing in a list it was not given', () => {
    expect(search('peonies', [])).toEqual([]);
  });
});

describe('groupByKind', () => {
  it('groups results without reordering them', () => {
    const hits = search('peonies', [
      item({ id: 'n', kind: 'note', title: 'Peonies', body: null, date: '2026-03-01' }),
      item({ id: 'm', kind: 'memory', title: 'Peonies', body: null, date: '2026-02-01' }),
      item({ id: 'n2', kind: 'note', title: 'Peonies', body: null, date: '2026-01-01' }),
    ]);

    // Ranked note, memory, note by date — so the note group keeps the first
    // and the third, in that order, and appears first because its best
    // result did.
    expect(groupByKind(hits)).toEqual([
      { kind: 'note', hits: [hits[0], hits[2]] },
      { kind: 'memory', hits: [hits[1]] },
    ]);
  });

  it('is empty for no results', () => {
    expect(groupByKind([])).toEqual([]);
  });
});

describe('scoreItem', () => {
  it('is null for an empty term list rather than matching everything', () => {
    expect(scoreItem(item(), [])).toBeNull();
  });
});
