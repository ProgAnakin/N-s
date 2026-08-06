/**
 * Invite codes, cleaned up on the way in.
 *
 * The code is six characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no
 * I, O, 0 or 1, because those are what people mistype when reading a code
 * off a screen.
 *
 * The reason this is a function rather than a `maxLength` on the input: a
 * code arrives by being copied out of a chat, and a copy very often brings a
 * space or a newline with it. With a plain six-character limit, pasting
 * "  JOIN42  " keeps "  JOIN" — six characters, all of them wrong — and the
 * field looks full, the button enables, and the reader is told their code
 * does not match anything. Cleaning first and counting second means the
 * paste simply works.
 */

/** Exactly the alphabet `generate_invite_code()` draws from, in 0001. */
const CODE_ALPHABET = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;

export const INVITE_CODE_LENGTH = 6;

export function normaliseInviteCode(input: string): string {
  return input.toUpperCase().replace(CODE_ALPHABET, '').slice(0, INVITE_CODE_LENGTH);
}

export function isCompleteInviteCode(input: string): boolean {
  return normaliseInviteCode(input).length === INVITE_CODE_LENGTH;
}
