import { describe, expect, it } from 'vitest';
import { INVITE_CODE_LENGTH, isCompleteInviteCode, normaliseInviteCode } from './invite';

describe('normaliseInviteCode', () => {
  it('leaves a clean code alone', () => {
    expect(normaliseInviteCode('JNK42X')).toBe('JNK42X');
  });

  it('upper-cases what was typed in lower case', () => {
    expect(normaliseInviteCode('jnk42x')).toBe('JNK42X');
  });

  // The bug this module exists for: a six-character limit applied before
  // trimming kept "  JNK" and threw the digits away.
  it('survives a paste that brought whitespace with it', () => {
    expect(normaliseInviteCode('  jnk42x  ')).toBe('JNK42X');
    expect(normaliseInviteCode('JNK42X\n')).toBe('JNK42X');
    expect(normaliseInviteCode('JNK 42X')).toBe('JNK42X');
  });

  it('drops the punctuation people add to make a code readable', () => {
    expect(normaliseInviteCode('JNK-42X')).toBe('JNK42X');
    expect(normaliseInviteCode('"JNK42X"')).toBe('JNK42X');
  });

  it('drops characters the generator never produces', () => {
    // I, O, 0 and 1 are excluded from the alphabet precisely because they are
    // misread; accepting them would only ever produce a code that fails.
    expect(normaliseInviteCode('IO01')).toBe('');
    expect(normaliseInviteCode('JIONK42X')).toBe('JNK42X');
  });

  it('never returns more than the code length', () => {
    expect(normaliseInviteCode('ABCDEFGHJK')).toHaveLength(INVITE_CODE_LENGTH);
  });

  it('is empty for something with nothing usable in it', () => {
    expect(normaliseInviteCode('   ')).toBe('');
    expect(normaliseInviteCode('')).toBe('');
  });
});

describe('isCompleteInviteCode', () => {
  it('is true only at the full length', () => {
    expect(isCompleteInviteCode('JNK42X')).toBe(true);
    expect(isCompleteInviteCode('JNK42')).toBe(false);
  });

  it('judges the cleaned code, not what was typed', () => {
    // Six characters on screen, two of them unusable.
    expect(isCompleteInviteCode('  JNKX')).toBe(false);
    expect(isCompleteInviteCode('  jnk42x  ')).toBe(true);
  });
});
