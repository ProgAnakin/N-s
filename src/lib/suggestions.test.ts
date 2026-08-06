import { describe, expect, it } from 'vitest';
import {
  actionableCount,
  buildSuggestions,
  OCCASION_HORIZON_DAYS,
  REPEAT_AFTER_DAYS,
  topSuggestions,
  type FactLike,
  type OccasionLike,
  type PlanLike,
} from './suggestions';
import type { AnswerKind } from './questions';
import type { CalendarDate } from './calendar';

const TODAY: CalendarDate = { year: 2026, month: 3, day: 10 };

let counter = 0;
function fact(answerKind: AnswerKind, answer: string, question = 'a question'): FactLike {
  counter += 1;
  return { id: `f${counter}`, answer, question, answerKind, updatedOn: null };
}

function occasion(
  label: string,
  daysUntil: number,
  giftWorthy: boolean,
): OccasionLike {
  return { id: `o-${label}`, label, daysUntil, giftWorthy };
}

function plan(title: string, day: CalendarDate, wentWell: boolean | null): PlanLike {
  counter += 1;
  return { id: `p${counter}`, title, day, wentWell, tags: [] };
}

function build(input: Partial<Parameters<typeof buildSuggestions>[0]> = {}) {
  return buildSuggestions({
    facts: [],
    occasions: [],
    plans: [],
    today: TODAY,
    ...input,
  });
}

describe('the app never paraphrases', () => {
  it('carries the answer through verbatim', () => {
    const said = 'My mother’s hotpot, the way she does it at new year.';
    const [suggestion] = build({ facts: [fact('taste', said)] });
    // Rewriting this into "book a hotpot restaurant" is the app putting
    // words in somebody's mouth and taking credit for the idea.
    expect(suggestion?.quote).toBe(said);
  });

  it('keeps the question that produced it, so the context survives', () => {
    const [suggestion] = build({
      facts: [fact('taste', 'Peonies.', 'Which flowers do you actually like?')],
    });
    expect(suggestion?.prompt).toBe('Which flowers do you actually like?');
  });

  it('trims but does not otherwise touch what was written', () => {
    const [suggestion] = build({ facts: [fact('taste', '  Peonies.  ')] });
    expect(suggestion?.quote).toBe('Peonies.');
  });
});

describe('what becomes what', () => {
  it('turns a taste into a gift idea', () => {
    const [suggestion] = build({ facts: [fact('taste', 'Peonies.')] });
    expect(suggestion?.kind).toBe('gift');
  });

  it.each(['activity', 'place', 'date'] as const)('turns a %s into a date idea', (kind) => {
    const [suggestion] = build({ facts: [fact(kind, 'Long walks by water.')] });
    expect(suggestion?.kind).toBe('date');
  });

  it('turns a boundary into a caution, never into an idea', () => {
    const [suggestion] = build({ facts: [fact('boundary', 'Never perfume. I react to it.')] });
    expect(suggestion?.kind).toBe('caution');
  });

  it('makes nothing at all out of an insight', () => {
    // How somebody handles a bad day is not a thing to buy or book, and
    // dressing it up as one would be the app misunderstanding what it was
    // told.
    expect(build({ facts: [fact('insight', 'She goes quiet when overwhelmed.')] })).toEqual([]);
  });

  it('ignores a question that was never answered', () => {
    expect(build({ facts: [fact('taste', '   ')] })).toEqual([]);
  });
});

describe('what outranks what', () => {
  it('puts a caution above every idea', () => {
    const list = build({
      facts: [
        fact('taste', 'Peonies.'),
        fact('activity', 'Cinema.'),
        fact('boundary', 'Never perfume.'),
      ],
      occasions: [occasion('Her birthday', 5, true)],
    });
    // Not making a mistake is worth more than making a gesture.
    expect(list[0]?.kind).toBe('caution');
  });

  it('puts a timely idea above an untimely one', () => {
    const list = build({
      facts: [fact('taste', 'Peonies.'), fact('taste', 'Dark chocolate.')],
      occasions: [occasion('Her birthday', 5, true)],
    });
    expect(list[0]?.occasion).not.toBeNull();
  });

  it('puts a nearer occasion above a further one', () => {
    const soon = build({
      facts: [fact('taste', 'Peonies.')],
      occasions: [occasion('Far', 40, true), occasion('Soon', 3, true)],
    });
    expect(soon[0]?.occasion?.label).toBe('Soon');
  });

  it('still surfaces an idea with nothing coming up, quietly', () => {
    // Half the point of writing something down is finding it again on an
    // ordinary Tuesday.
    const list = build({ facts: [fact('taste', 'Peonies.')] });
    expect(list).toHaveLength(1);
    expect(list[0]?.occasion).toBeNull();
  });
});

describe('which occasions count', () => {
  it('attaches a gift idea only to an occasion where a present is expected', () => {
    const list = build({
      facts: [fact('taste', 'Peonies.')],
      // Her country's national day wants a message, not a parcel.
      occasions: [occasion('National Day', 4, false)],
    });
    expect(list[0]?.occasion).toBeNull();
  });

  it('attaches a date idea to any occasion, present expected or not', () => {
    const list = build({
      facts: [fact('activity', 'Long walks.')],
      occasions: [occasion('National Day', 4, false)],
    });
    expect(list[0]?.occasion?.label).toBe('National Day');
  });

  it('ignores an occasion beyond the horizon', () => {
    const list = build({
      facts: [fact('taste', 'Peonies.')],
      occasions: [occasion('Miles away', OCCASION_HORIZON_DAYS + 1, true)],
    });
    expect(list[0]?.occasion).toBeNull();
  });

  it('ignores an occasion that has already passed', () => {
    const list = build({
      facts: [fact('taste', 'Peonies.')],
      occasions: [occasion('Last week', -7, true)],
    });
    expect(list[0]?.occasion).toBeNull();
  });
});

describe('doing something again', () => {
  it('suggests repeating an evening that went well and was a while ago', () => {
    const list = build({
      plans: [plan('That ramen place', { year: 2025, month: 12, day: 1 }, true)],
    });
    expect(list[0]?.kind).toBe('repeat');
    expect(list[0]?.quote).toBe('That ramen place');
  });

  it('says nothing about one that has not been long enough', () => {
    // "Again?" three days later is a nag, not a suggestion.
    const recent = { year: 2026, month: 3, day: 5 };
    expect(build({ plans: [plan('Dinner', recent, true)] })).toEqual([]);
  });

  it('never suggests repeating one that did not go well', () => {
    const old = { year: 2025, month: 1, day: 1 };
    expect(build({ plans: [plan('That place', old, false)] })).toEqual([]);
  });

  it('never suggests repeating one nobody has judged yet', () => {
    const old = { year: 2025, month: 1, day: 1 };
    expect(build({ plans: [plan('That place', old, null)] })).toEqual([]);
  });

  it('uses the stated threshold', () => {
    const exactly = { year: 2026, month: 1, day: 9 };
    const list = build({ plans: [plan('Exactly', exactly, true)] });
    expect(REPEAT_AFTER_DAYS).toBe(60);
    expect(list).toHaveLength(1);
  });
});

describe('topSuggestions', () => {
  it('takes only the kinds asked for', () => {
    const list = build({
      facts: [fact('taste', 'Peonies.'), fact('activity', 'Cinema.')],
    });
    expect(topSuggestions(list, ['gift']).every((s) => s.kind === 'gift')).toBe(true);
  });

  it('never shows two cards from the same answer', () => {
    const shared = fact('taste', 'Peonies.');
    const list = [
      ...build({ facts: [shared], occasions: [occasion('A', 2, true)] }),
      ...build({ facts: [shared] }),
    ];
    expect(topSuggestions(list, ['gift'], 5)).toHaveLength(1);
  });

  it('caps the list, so nine near-identical cards never appear', () => {
    const facts = Array.from({ length: 9 }, (_, i) => fact('taste', `thing ${i}`));
    expect(topSuggestions(build({ facts }), ['gift'], 3)).toHaveLength(3);
  });

  it('is empty when there is nothing of that kind', () => {
    expect(topSuggestions(build({ facts: [fact('insight', 'x')] }), ['gift'])).toEqual([]);
  });
});

describe('actionableCount', () => {
  it('counts answers that can do work', () => {
    expect(
      actionableCount([
        fact('taste', 'Peonies.'),
        fact('activity', 'Cinema.'),
        fact('boundary', 'No perfume.'),
        fact('insight', 'Goes quiet.'),
      ]),
    ).toBe(3);
  });

  it('does not count an unanswered question', () => {
    expect(actionableCount([fact('taste', '')])).toBe(0);
  });
});
