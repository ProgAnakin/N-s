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
}

export const QUESTION_BANK: readonly BankQuestion[] = [
  // --- How we talk ---------------------------------------------------
  { id: 'q01', category: 'communication', question: 'When you go quiet, what does it usually mean?' },
  { id: 'q02', category: 'communication', question: "When you're upset, what helps more — space, words, or just having me there?" },
  { id: 'q03', category: 'communication', question: "What's a sign you're stressed that I might miss?" },
  { id: 'q04', category: 'communication', question: 'When something bothers you, do you want to talk about it right away or once it settles?' },
  { id: 'q05', category: 'communication', question: 'Is there something I say that lands badly, even when I mean it well?' },
  { id: 'q06', category: 'communication', question: 'How do you like to be apologised to?' },
  { id: 'q07', category: 'communication', question: 'What does "I\'m fine" mean when you say it?' },
  { id: 'q08', category: 'communication', question: "Is there anything that's hard to say in English but easy in your own language?" },
  { id: 'q09', category: 'communication', question: 'How do you want me to check in when you seem far away?' },

  // --- What love looks like to her ------------------------------------
  { id: 'q10', category: 'love_language', question: 'What makes you feel most loved — words, time, touch, gifts, or help?' },
  { id: 'q11', category: 'love_language', question: "What's the smallest thing someone has done for you that you still remember?" },
  { id: 'q12', category: 'love_language', question: 'How do you like affection shown when other people are around?' },
  { id: 'q13', category: 'love_language', question: 'What kind of compliment actually reaches you?' },
  { id: 'q14', category: 'love_language', question: 'How did your family show love without saying it?' },
  { id: 'q15', category: 'love_language', question: 'What do you need most from me on a hard day?' },
  { id: 'q16', category: 'love_language', question: 'How do you like to celebrate when something goes well for you?' },

  // --- Where she's from ------------------------------------------------
  { id: 'q17', category: 'culture', question: 'What tradition from home do you miss the most?' },
  { id: 'q18', category: 'culture', question: "Which holiday would you want us to keep, wherever we're living?" },
  { id: 'q19', category: 'culture', question: 'What should I know before I meet your family?' },
  { id: 'q20', category: 'culture', question: 'Is there anything I might do that would be rude without me realising?' },
  { id: 'q21', category: 'culture', question: 'What food tastes like home to you?' },
  { id: 'q22', category: 'culture', question: 'How does your family treat guests? What would be expected of me?' },
  { id: 'q23', category: 'culture', question: 'Are there numbers, colours, or gifts that carry meaning for you?' },
  { id: 'q24', category: 'culture', question: 'What do you wish people understood about where you grew up?' },
  { id: 'q25', category: 'culture', question: 'What was a normal weekend like in your family?' },

  // --- What she likes ---------------------------------------------------
  { id: 'q26', category: 'preferences', question: "What's your ideal way to spend a free Saturday?" },
  { id: 'q27', category: 'preferences', question: 'Coffee, tea, or something else — and how exactly?' },
  { id: 'q28', category: 'preferences', question: 'On a trip, do you prefer slow and quiet or full and busy?' },
  { id: 'q29', category: 'preferences', question: "What's a film, song, or book you'd want me to know?" },
  { id: 'q30', category: 'preferences', question: 'What would you never want as a gift?' },
  { id: 'q31', category: 'preferences', question: 'Morning person or night person, honestly?' },
  { id: 'q32', category: 'preferences', question: "What's your comfort food when you're tired?" },
  { id: 'q33', category: 'preferences', question: 'How much time alone do you need in a week to feel like yourself?' },
  { id: 'q34', category: 'preferences', question: 'What kind of plans do you enjoy being surprised by, and which ones do you want to know about first?' },

  // --- Her lines --------------------------------------------------------
  { id: 'q35', category: 'boundaries', question: "Is there a topic you'd rather not talk about yet?" },
  { id: 'q36', category: 'boundaries', question: "What's off-limits to joke about?" },
  { id: 'q37', category: 'boundaries', question: 'How do you feel about photos of us being posted publicly?' },
  { id: 'q38', category: 'boundaries', question: "What's something you'd want me to ask before doing?" },
  { id: 'q39', category: 'boundaries', question: 'How much of us do you want shared with your family, or with mine?' },
  { id: 'q40', category: 'boundaries', question: 'When you need space, how do you want to tell me?' },
  { id: 'q41', category: 'boundaries', question: 'What would make you feel crowded?' },

  // --- What came before -------------------------------------------------
  { id: 'q42', category: 'past', question: "What hurt you before that you'd never want repeated?" },
  { id: 'q43', category: 'past', question: 'What did someone once do for you that you would love again?' },
  { id: 'q44', category: 'past', question: 'What were you like at eighteen?' },
  { id: 'q45', category: 'past', question: "What are you proud of that most people don't know about?" },
  { id: 'q46', category: 'past', question: 'Who shaped you the most growing up?' },
  { id: 'q47', category: 'past', question: 'What was your hardest year, if you want to tell me about it?' },

  // --- Where she's going ------------------------------------------------
  { id: 'q48', category: 'other', question: 'What are you working toward this year?' },
  { id: 'q49', category: 'other', question: 'What does a good life look like to you in five years?' },
  { id: 'q50', category: 'other', question: "What do you worry about that you don't say out loud?" },
  { id: 'q51', category: 'other', question: 'What makes you laugh without fail?' },
  { id: 'q52', category: 'other', question: "What would you want me to remember on a day when you're not okay?" },
  { id: 'q53', category: 'other', question: "What's something you'd like us to be good at as a couple?" },
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
