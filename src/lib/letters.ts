import { compareDates, toEpochDay, type CalendarDate } from './calendar';

/**
 * Letters — the arithmetic, kept away from React.
 *
 * The one rule this module exists to hold: it never counts per person.
 * "She wrote nine and I wrote three" is the same machine as "who owes
 * whom", and it does the same damage. Everything here is about the pair or
 * about the reader's own outbox, never a comparison between the two.
 */

export const LETTER_KINDS = ['thanks', 'small', 'sorry', 'love'] as const;
export type LetterKind = (typeof LETTER_KINDS)[number];

export interface Letter {
  id: string;
  from_profile: string;
  to_profile: string;
  kind: LetterKind;
  body: string;
  /** ISO date. Null means readable now. */
  open_on: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * True while the recipient is not allowed to read it yet.
 *
 * The database is what actually withholds a sealed letter — this is for
 * the author's own view, where the row is present and needs labelling.
 */
export function isSealed(letter: Pick<Letter, 'open_on'>, today: CalendarDate): boolean {
  if (!letter.open_on) return false;
  const opensOn = parseIsoDate(letter.open_on);
  if (!opensOn) return false;
  return compareDates(opensOn, today) > 0;
}

/** Letters written to me that I have not opened. Never a total for both of us. */
export function unopenedFor(letters: readonly Letter[], profileId: string): Letter[] {
  return letters.filter((letter) => letter.to_profile === profileId && letter.read_at === null);
}

/** Letters I have sent that are still sealed — my own outbox, my own business. */
export function sealedFrom(
  letters: readonly Letter[],
  profileId: string,
  today: CalendarDate,
): Letter[] {
  return letters.filter((letter) => letter.from_profile === profileId && isSealed(letter, today));
}

/**
 * Whole days since anybody last wrote one, or null if nobody ever has.
 *
 * Deliberately blind to who wrote it. The question worth asking is "how
 * long has it been quiet between us", and that has one answer, not two.
 */
export function daysSinceLastLetter(
  letters: readonly Letter[],
  today: CalendarDate,
): number | null {
  let newest: CalendarDate | null = null;
  for (const letter of letters) {
    const written = parseIsoDate(letter.created_at);
    if (!written) continue;
    if (!newest || compareDates(written, newest) > 0) newest = written;
  }
  if (!newest) return null;
  return Math.max(0, toEpochDay(today) - toEpochDay(newest));
}

/** A fortnight. Long enough to be a real gap, short enough to still matter. */
export const QUIET_AFTER_DAYS = 14;

/**
 * Whether to say anything about the quiet.
 *
 * It stays silent for a brand new couple — a nudge on day one would be
 * telling somebody they are already behind — and it stays silent for
 * anyone who turned nudges off.
 */
export function shouldNudge(input: {
  letters: readonly Letter[];
  today: CalendarDate;
  nudges: boolean;
}): boolean {
  if (!input.nudges) return false;
  const days = daysSinceLastLetter(input.letters, input.today);
  if (days === null) return false;
  return days >= QUIET_AFTER_DAYS;
}

/**
 * Newest first, with sealed ones from the reader floated to the top.
 *
 * A letter you have written but not yet delivered is the one you are most
 * likely to want to change your mind about, so it should not be buried
 * under the archive.
 */
export function sortForReading(
  letters: readonly Letter[],
  readerId: string,
  today: CalendarDate,
): Letter[] {
  return [...letters].sort((a, b) => {
    const aPending = a.from_profile === readerId && isSealed(a, today);
    const bPending = b.from_profile === readerId && isSealed(b, today);
    if (aPending !== bPending) return aPending ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

/**
 * How full the shelf is, as one number for the two of you.
 *
 * Shown as "you two have written 47" and never broken down, for the reason
 * at the top of this file.
 */
export function shelfCount(letters: readonly Letter[]): number {
  return letters.length;
}

function parseIsoDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}
