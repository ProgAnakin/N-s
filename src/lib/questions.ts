/**
 * The question bank.
 *
 * Fifty things worth knowing about someone, grouped by the categories the
 * vault uses. They are prompts, not a checklist — the vault shows a few at a
 * time, they can be dismissed, and answering one is what turns it into a
 * saved note.
 *
 * Written to be asked out loud, slowly, over months. Nothing here should read
 * like an intake form, and nothing here asks her to justify herself.
 */

import type { FactCategory } from './vault';

export interface BankQuestion {
  id: string;
  category: FactCategory;
  question: string;
  /**
   * What kind of answer this question naturally produces.
   *
   * This is the field that makes the app able to *do* anything with an
   * answer. "What food tastes like home to you" and "what should I know
   * before I meet your family" are both culture questions, and only one of
   * them can ever become a restaurant booking. Recording the shape of the
   * expected answer up front means nothing downstream has to read the
   * sentence and guess.
   *
   * `boundary` is the important one. "What would you never want as a gift"
   * yields an answer the app must use to *stop* a suggestion, not to make
   * one — and getting that backwards would be worse than having no
   * suggestions at all.
   */
  yields: AnswerKind;
}

/**
 * The shape of an answer. Mirrors `remember_facts.answer_kind` in 0011.
 *
 * - `insight`  — how they work. Shapes how you talk, never what you buy.
 * - `taste`    — a food, a drink, a flower, a song. Buyable.
 * - `place`    — somewhere they like or want to go. Bookable.
 * - `activity` — something they enjoy doing. Plannable.
 * - `boundary` — a line. Never a suggestion; surfaced as a caution.
 * - `date`     — something with a day attached.
 */
export type AnswerKind = 'insight' | 'taste' | 'place' | 'activity' | 'boundary' | 'date';

export const QUESTION_BANK: readonly BankQuestion[] = [
  // --- How we talk ---------------------------------------------------
  { id: 'q01', category: 'communication', question: 'When you go quiet, what does it usually mean?', yields: 'insight' },
  { id: 'q02', category: 'communication', question: "When you're upset, what helps more — space, words, or just having me there?", yields: 'insight' },
  { id: 'q03', category: 'communication', question: "What's a sign you're stressed that I might miss?", yields: 'insight' },
  { id: 'q04', category: 'communication', question: 'When something bothers you, do you want to talk about it right away or once it settles?', yields: 'insight' },
  { id: 'q05', category: 'communication', question: 'Is there something I say that lands badly, even when I mean it well?', yields: 'insight' },
  { id: 'q06', category: 'communication', question: 'How do you like to be apologised to?', yields: 'insight' },
  { id: 'q07', category: 'communication', question: 'What does "I\'m fine" mean when you say it?', yields: 'insight' },
  { id: 'q08', category: 'communication', question: "Is there anything that's hard to say in English but easy in your own language?", yields: 'insight' },
  { id: 'q09', category: 'communication', question: 'How do you want me to check in when you seem far away?', yields: 'insight' },

  // --- What love looks like to her ------------------------------------
  { id: 'q10', category: 'love_language', question: 'What makes you feel most loved — words, time, touch, gifts, or help?', yields: 'insight' },
  { id: 'q11', category: 'love_language', question: "What's the smallest thing someone has done for you that you still remember?", yields: 'insight' },
  { id: 'q12', category: 'love_language', question: 'How do you like affection shown when other people are around?', yields: 'insight' },
  { id: 'q13', category: 'love_language', question: 'What kind of compliment actually reaches you?', yields: 'insight' },
  { id: 'q14', category: 'love_language', question: 'How did your family show love without saying it?', yields: 'insight' },
  { id: 'q15', category: 'love_language', question: 'What do you need most from me on a hard day?', yields: 'insight' },
  { id: 'q16', category: 'love_language', question: 'How do you like to celebrate when something goes well for you?', yields: 'activity' },

  // --- Where she's from ------------------------------------------------
  { id: 'q17', category: 'culture', question: 'What tradition from home do you miss the most?', yields: 'date' },
  { id: 'q18', category: 'culture', question: "Which holiday would you want us to keep, wherever we're living?", yields: 'date' },
  { id: 'q19', category: 'culture', question: 'What should I know before I meet your family?', yields: 'insight' },
  { id: 'q20', category: 'culture', question: 'Is there anything I might do that would be rude without me realising?', yields: 'insight' },
  { id: 'q21', category: 'culture', question: 'What food tastes like home to you?', yields: 'taste' },
  { id: 'q22', category: 'culture', question: 'How does your family treat guests? What would be expected of me?', yields: 'insight' },
  { id: 'q23', category: 'culture', question: 'Are there numbers, colours, or gifts that carry meaning for you?', yields: 'taste' },
  { id: 'q24', category: 'culture', question: 'What do you wish people understood about where you grew up?', yields: 'insight' },
  { id: 'q25', category: 'culture', question: 'What was a normal weekend like in your family?', yields: 'insight' },

  // --- What she likes ---------------------------------------------------
  { id: 'q26', category: 'preferences', question: "What's your ideal way to spend a free Saturday?", yields: 'activity' },
  { id: 'q27', category: 'preferences', question: 'Coffee, tea, or something else — and how exactly?', yields: 'taste' },
  { id: 'q28', category: 'preferences', question: 'On a trip, do you prefer slow and quiet or full and busy?', yields: 'insight' },
  { id: 'q29', category: 'preferences', question: "What's a film, song, or book you'd want me to know?", yields: 'taste' },
  { id: 'q30', category: 'preferences', question: 'What would you never want as a gift?', yields: 'boundary' },
  { id: 'q31', category: 'preferences', question: 'Morning person or night person, honestly?', yields: 'insight' },
  { id: 'q32', category: 'preferences', question: "What's your comfort food when you're tired?", yields: 'taste' },
  { id: 'q33', category: 'preferences', question: 'How much time alone do you need in a week to feel like yourself?', yields: 'insight' },
  { id: 'q34', category: 'preferences', question: 'What kind of plans do you enjoy being surprised by, and which ones do you want to know about first?', yields: 'insight' },

  // --- Her lines --------------------------------------------------------
  { id: 'q35', category: 'boundaries', question: "Is there a topic you'd rather not talk about yet?", yields: 'boundary' },
  { id: 'q36', category: 'boundaries', question: "What's off-limits to joke about?", yields: 'boundary' },
  { id: 'q37', category: 'boundaries', question: 'How do you feel about photos of us being posted publicly?', yields: 'boundary' },
  { id: 'q38', category: 'boundaries', question: "What's something you'd want me to ask before doing?", yields: 'boundary' },
  { id: 'q39', category: 'boundaries', question: 'How much of us do you want shared with your family, or with mine?', yields: 'boundary' },
  { id: 'q40', category: 'boundaries', question: 'When you need space, how do you want to tell me?', yields: 'boundary' },
  { id: 'q41', category: 'boundaries', question: 'What would make you feel crowded?', yields: 'boundary' },

  // --- What came before -------------------------------------------------
  { id: 'q42', category: 'past', question: "What hurt you before that you'd never want repeated?", yields: 'boundary' },
  { id: 'q43', category: 'past', question: 'What did someone once do for you that you would love again?', yields: 'activity' },
  { id: 'q44', category: 'past', question: 'What were you like at eighteen?', yields: 'insight' },
  { id: 'q45', category: 'past', question: "What are you proud of that most people don't know about?", yields: 'insight' },
  { id: 'q46', category: 'past', question: 'Who shaped you the most growing up?', yields: 'insight' },
  { id: 'q47', category: 'past', question: 'What was your hardest year, if you want to tell me about it?', yields: 'insight' },

  // --- Where she's going ------------------------------------------------
  { id: 'q48', category: 'other', question: 'What are you working toward this year?', yields: 'insight' },
  { id: 'q49', category: 'other', question: 'What does a good life look like to you in five years?', yields: 'insight' },
  { id: 'q50', category: 'other', question: "What do you worry about that you don't say out loud?", yields: 'insight' },
  { id: 'q51', category: 'other', question: 'What makes you laugh without fail?', yields: 'insight' },
  { id: 'q52', category: 'other', question: "What would you want me to remember on a day when you're not okay?", yields: 'insight' },
  { id: 'q53', category: 'other', question: "What's something you'd like us to be good at as a couple?", yields: 'insight' },
];

export function questionsInCategory(category: FactCategory): BankQuestion[] {
  return QUESTION_BANK.filter((question) => question.category === category);
}

/**
 * Questions not yet answered or dismissed.
 *
 * Matching is done on the question text rather than on an id, because a saved
 * answer should still count as "asked" after the wording has been edited, and
 * because questions typed by hand should be able to satisfy a prompt too.
 */
export function openQuestions(
  answeredQuestions: readonly string[],
  dismissedIds: readonly string[],
  category: FactCategory | 'all' = 'all',
): BankQuestion[] {
  const answered = new Set(answeredQuestions.map((q) => q.trim().toLowerCase()));
  const dismissed = new Set(dismissedIds);
  return QUESTION_BANK.filter((question) => {
    if (dismissed.has(question.id)) return false;
    if (answered.has(question.question.trim().toLowerCase())) return false;
    return category === 'all' || question.category === category;
  });
}

/**
 * A small rotating selection, stable for a given day so the prompts don't
 * reshuffle every time the screen re-renders.
 */
export function suggestQuestions(
  open: readonly BankQuestion[],
  seed: number,
  count = 3,
): BankQuestion[] {
  if (open.length === 0) return [];
  const start = Math.abs(Math.trunc(seed)) % open.length;
  const picked: BankQuestion[] = [];
  for (let i = 0; i < Math.min(count, open.length); i += 1) {
    picked.push(open[(start + i) % open.length]!);
  }
  return picked;
}
