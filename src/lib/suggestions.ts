import { daysBetween, type CalendarDate } from './calendar';
import type { AnswerKind } from './questions';

/**
 * Turning what somebody told you into something you can act on.
 *
 * This is the loop the app was missing. A question was asked, an answer was
 * written down, and nothing ever read it again — so the vault was a diary
 * rather than a memory. Here is where an answer given in March becomes a
 * reason to book something in June.
 *
 * One rule holds the whole module together: **the app never paraphrases.**
 * It quotes. Turning "I love my mother's hotpot" into "Book a hotpot
 * restaurant" is the app putting words in somebody's mouth and then taking
 * credit for the idea, and when it gets it slightly wrong — which it will —
 * the result is a partner being handed something they did not ask for by
 * somebody who thought they were listening. So a suggestion is always the
 * sentence they actually said, placed next to the occasion that makes it
 * timely. The thinking stays with the person doing the loving.
 *
 * The second rule is about what *not* to suggest. An answer to "what would
 * you never want as a gift" is the single most valuable thing in the vault,
 * and it is valuable precisely because it stops an idea. Boundaries outrank
 * every other kind of suggestion here, and they are never phrased as an
 * idea — they are phrased as a caution.
 *
 * Privacy falls out of the data rather than being enforced here. A private
 * fact is only ever readable by its author, so it only ever reaches that
 * person's client, so a suggestion drawn from it can only ever be shown to
 * them. Nothing in this module needs to know about visibility, and the
 * caller decides which surface each kind belongs on: gift suggestions and
 * cautions go on the gift page, which is private; date suggestions go where
 * both of them can see.
 */

export type SuggestionKind =
  /** Something they mentioned liking, near an occasion. Goes on a private page. */
  | 'gift'
  /** Something they enjoy doing, or somewhere they want to go. */
  | 'date'
  /** A line they drew. Shown to prevent an idea, never to make one. */
  | 'caution'
  /** An evening that went well, long enough ago to be worth doing again. */
  | 'repeat';

export interface FactLike {
  id: string;
  /** Verbatim. Never rewritten. */
  answer: string;
  /** The question that produced it, when it came from the bank. */
  question: string;
  answerKind: AnswerKind;
  updatedOn: CalendarDate | null;
}

export interface OccasionLike {
  id: string;
  label: string;
  daysUntil: number;
  /**
   * Whether a present is the expected shape of the gesture.
   *
   * A birthday is; a national holiday of the country your partner is from is
   * not — that one wants a message, not a parcel. Getting this wrong is how
   * an app becomes a machine for buying unnecessary things.
   */
  giftWorthy: boolean;
}

export interface PlanLike {
  id: string;
  title: string;
  day: CalendarDate;
  wentWell: boolean | null;
  tags: readonly string[];
}

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  /** The row this came from, so the interface can link back to it. */
  sourceId: string;
  /** What they actually said, or what you actually did. Verbatim. */
  quote: string;
  /** The question that produced it, when there was one. */
  prompt: string | null;
  /** The occasion that makes it timely, when there is one. */
  occasion: { id: string; label: string; daysUntil: number } | null;
  /** Higher sorts first. Never shown; it exists so the order is testable. */
  score: number;
}

/** How far ahead an occasion can be and still make an answer feel timely. */
export const OCCASION_HORIZON_DAYS = 45;

/**
 * How long an evening has to have been ago before repeating it is a
 * suggestion rather than a nag. Two months: long enough that "again?" is a
 * nice thought, short enough that you both still remember it.
 */
export const REPEAT_AFTER_DAYS = 60;

/**
 * Answers that can turn into a present.
 *
 * `place` is deliberately absent: somewhere she wants to go is a plan, not
 * a parcel, and it is already covered as a date suggestion.
 */
const GIFTABLE: ReadonlySet<AnswerKind> = new Set<AnswerKind>(['taste']);

/** Answers that can turn into a plan. */
const PLANNABLE: ReadonlySet<AnswerKind> = new Set<AnswerKind>(['activity', 'place', 'date']);

function occasionOf(occasions: readonly OccasionLike[], giftWorthyOnly: boolean) {
  const eligible = occasions
    .filter((occasion) => occasion.daysUntil >= 0 && occasion.daysUntil <= OCCASION_HORIZON_DAYS)
    .filter((occasion) => !giftWorthyOnly || occasion.giftWorthy)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  return eligible[0] ?? null;
}

function trimmed(value: string): string {
  return value.trim();
}

/**
 * Everything worth surfacing right now, most useful first.
 *
 * The ordering is the product decision. A caution beats an idea, because
 * not making a mistake is worth more than making a gesture. A timely idea
 * beats an untimely one. And an idea with nothing coming up still appears,
 * quietly, because half the point of writing something down is finding it
 * again on an ordinary Tuesday.
 */
export function buildSuggestions(input: {
  facts: readonly FactLike[];
  occasions: readonly OccasionLike[];
  plans: readonly PlanLike[];
  today: CalendarDate;
}): Suggestion[] {
  const { facts, occasions, plans, today } = input;
  const out: Suggestion[] = [];

  for (const fact of facts) {
    const quote = trimmed(fact.answer);
    // An unanswered question is a prompt, not a suggestion. The vault
    // already has a place for those.
    if (!quote) continue;

    if (fact.answerKind === 'boundary') {
      const occasion = occasionOf(occasions, true);
      out.push({
        id: `caution:${fact.id}`,
        kind: 'caution',
        sourceId: fact.id,
        quote,
        prompt: trimmed(fact.question) || null,
        occasion: occasion
          ? { id: occasion.id, label: occasion.label, daysUntil: occasion.daysUntil }
          : null,
        // Above everything. A line somebody drew is the most useful thing
        // they ever told you, and it is useful in the moment before a
        // mistake, not after.
        score: occasion ? 1000 - occasion.daysUntil : 900,
      });
      continue;
    }

    if (GIFTABLE.has(fact.answerKind)) {
      const occasion = occasionOf(occasions, true);
      out.push({
        id: `gift:${fact.id}`,
        kind: 'gift',
        sourceId: fact.id,
        quote,
        prompt: trimmed(fact.question) || null,
        occasion: occasion
          ? { id: occasion.id, label: occasion.label, daysUntil: occasion.daysUntil }
          : null,
        score: occasion ? 800 - occasion.daysUntil : 300,
      });
      continue;
    }

    if (PLANNABLE.has(fact.answerKind)) {
      const occasion = occasionOf(occasions, false);
      out.push({
        id: `date:${fact.id}`,
        kind: 'date',
        sourceId: fact.id,
        quote,
        prompt: trimmed(fact.question) || null,
        occasion: occasion
          ? { id: occasion.id, label: occasion.label, daysUntil: occasion.daysUntil }
          : null,
        score: occasion ? 700 - occasion.daysUntil : 250,
      });
    }
    // `insight` produces nothing here on purpose. How somebody handles a bad
    // day is not a thing to buy or book, and dressing it up as one would be
    // the app misunderstanding what it was told.
  }

  for (const plan of plans) {
    if (plan.wentWell !== true) continue;
    const daysAgo = daysBetween(plan.day, today);
    if (daysAgo < REPEAT_AFTER_DAYS) continue;

    out.push({
      id: `repeat:${plan.id}`,
      kind: 'repeat',
      sourceId: plan.id,
      quote: trimmed(plan.title),
      prompt: null,
      occasion: null,
      // Below a timely idea, above an untimely one: it is a good thought
      // rather than a pressing one.
      score: 400,
    });
  }

  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/**
 * The few worth putting on a page, with no more than one from each source.
 *
 * Without the cap, a couple who answered nine taste questions gets nine
 * near-identical cards and stops reading any of them.
 */
export function topSuggestions(
  suggestions: readonly Suggestion[],
  kinds: readonly SuggestionKind[],
  limit = 3,
): Suggestion[] {
  const wanted = new Set(kinds);
  const seen = new Set<string>();
  const out: Suggestion[] = [];

  for (const suggestion of suggestions) {
    if (!wanted.has(suggestion.kind)) continue;
    if (seen.has(suggestion.sourceId)) continue;
    seen.add(suggestion.sourceId);
    out.push(suggestion);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * How much of the vault has turned into something usable.
 *
 * Not a score out of ten and not shown as a percentage of some target — it
 * is a count of answers that can do work, next to the count of answers. A
 * couple with fifty insights and no tastes is not doing worse than one with
 * five tastes; they know different things.
 */
export function actionableCount(facts: readonly FactLike[]): number {
  return facts.filter(
    (fact) =>
      trimmed(fact.answer) !== '' &&
      (GIFTABLE.has(fact.answerKind) ||
        PLANNABLE.has(fact.answerKind) ||
        fact.answerKind === 'boundary'),
  ).length;
}
