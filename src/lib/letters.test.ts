import { describe, expect, it } from 'vitest';
import {
  daysSinceLastLetter,
  isSealed,
  QUIET_AFTER_DAYS,
  sealedFrom,
  shelfCount,
  shouldNudge,
  sortForReading,
  unopenedFor,
  type Letter,
} from './letters';

const HIM = 'him';
const HER = 'her';
const TODAY = { year: 2026, month: 3, day: 10 };

function letter(overrides: Partial<Letter> = {}): Letter {
  return {
    id: crypto.randomUUID(),
    from_profile: HIM,
    to_profile: HER,
    kind: 'thanks',
    body: 'For the soup.',
    open_on: null,
    read_at: null,
    created_at: '2026-03-10T09:00:00.000Z',
    ...overrides,
  };
}

describe('isSealed', () => {
  it('is open when there is no date on it', () => {
    expect(isSealed({ open_on: null }, TODAY)).toBe(false);
  });

  it('is sealed until the day arrives', () => {
    expect(isSealed({ open_on: '2026-03-11' }, TODAY)).toBe(true);
  });

  it('opens on the day itself, not the day after', () => {
    expect(isSealed({ open_on: '2026-03-10' }, TODAY)).toBe(false);
  });

  it('stays open once the day has passed', () => {
    expect(isSealed({ open_on: '2026-01-01' }, TODAY)).toBe(false);
  });
});

describe('unopenedFor', () => {
  it('counts only what was written to me', () => {
    const letters = [
      letter({ to_profile: HER }),
      letter({ from_profile: HER, to_profile: HIM }),
      letter({ to_profile: HER, read_at: '2026-03-10T10:00:00.000Z' }),
    ];
    expect(unopenedFor(letters, HER)).toHaveLength(1);
  });

  it('is empty for someone with nothing waiting', () => {
    expect(unopenedFor([letter()], HIM)).toEqual([]);
  });
});

describe('sealedFrom', () => {
  it('shows me my own undelivered letters and nobody else’s', () => {
    const letters = [
      letter({ from_profile: HIM, open_on: '2026-12-25' }),
      letter({ from_profile: HER, to_profile: HIM, open_on: '2026-12-25' }),
      letter({ from_profile: HIM, open_on: null }),
    ];
    expect(sealedFrom(letters, HIM, TODAY)).toHaveLength(1);
  });
});

describe('daysSinceLastLetter', () => {
  it('is null when there are none', () => {
    expect(daysSinceLastLetter([], TODAY)).toBeNull();
  });

  it('counts from the most recent one whoever wrote it', () => {
    const letters = [
      letter({ created_at: '2026-02-01T09:00:00.000Z' }),
      letter({ from_profile: HER, to_profile: HIM, created_at: '2026-03-08T09:00:00.000Z' }),
    ];
    expect(daysSinceLastLetter(letters, TODAY)).toBe(2);
  });

  it('is zero on the day one was written', () => {
    expect(daysSinceLastLetter([letter()], TODAY)).toBe(0);
  });

  it('never goes negative for a letter dated ahead of today', () => {
    const ahead = letter({ created_at: '2026-04-01T09:00:00.000Z' });
    expect(daysSinceLastLetter([ahead], TODAY)).toBe(0);
  });
});

describe('shouldNudge', () => {
  const stale = [letter({ created_at: '2026-02-01T09:00:00.000Z' })];

  it('says nothing to a couple who have never written one', () => {
    expect(shouldNudge({ letters: [], today: TODAY, nudges: true })).toBe(false);
  });

  it('says nothing to somebody who turned nudges off', () => {
    expect(shouldNudge({ letters: stale, today: TODAY, nudges: false })).toBe(false);
  });

  it('says nothing while it is still recent', () => {
    expect(shouldNudge({ letters: [letter()], today: TODAY, nudges: true })).toBe(false);
  });

  it('speaks up after a quiet fortnight', () => {
    expect(shouldNudge({ letters: stale, today: TODAY, nudges: true })).toBe(true);
  });

  it('speaks up exactly on the threshold', () => {
    const onTheDay = [letter({ created_at: '2026-02-24T09:00:00.000Z' })];
    expect(daysSinceLastLetter(onTheDay, TODAY)).toBe(QUIET_AFTER_DAYS);
    expect(shouldNudge({ letters: onTheDay, today: TODAY, nudges: true })).toBe(true);
  });
});

describe('sortForReading', () => {
  it('floats my own undelivered letters above the archive', () => {
    const archive = letter({ created_at: '2026-03-09T09:00:00.000Z' });
    const pending = letter({ created_at: '2026-01-01T09:00:00.000Z', open_on: '2026-12-25' });
    const order = sortForReading([archive, pending], HIM, TODAY).map((row) => row.id);
    expect(order).toEqual([pending.id, archive.id]);
  });

  it('does not float the other person’s sealed letters, which I cannot see anyway', () => {
    const mine = letter({ created_at: '2026-03-09T09:00:00.000Z' });
    const theirs = letter({
      from_profile: HER,
      to_profile: HIM,
      created_at: '2026-01-01T09:00:00.000Z',
      open_on: '2026-12-25',
    });
    const order = sortForReading([theirs, mine], HIM, TODAY).map((row) => row.id);
    expect(order).toEqual([mine.id, theirs.id]);
  });

  it('is newest first otherwise', () => {
    const older = letter({ created_at: '2026-01-01T09:00:00.000Z' });
    const newer = letter({ created_at: '2026-03-01T09:00:00.000Z' });
    expect(sortForReading([older, newer], HIM, TODAY).map((row) => row.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it('leaves the input alone', () => {
    const input = [letter({ created_at: '2026-01-01T09:00:00.000Z' }), letter()];
    const before = input.map((row) => row.id);
    sortForReading(input, HIM, TODAY);
    expect(input.map((row) => row.id)).toEqual(before);
  });
});

describe('the shelf is never a scoreboard', () => {
  it('counts the pair, not the people', () => {
    const letters = [
      letter({ from_profile: HIM }),
      letter({ from_profile: HIM }),
      letter({ from_profile: HER, to_profile: HIM }),
    ];
    expect(shelfCount(letters)).toBe(3);
  });

  // Guards the rule rather than an implementation: if a future change adds a
  // per-author breakdown to this module, this fails and asks why.
  it('exposes no per-author tally', async () => {
    const module: Record<string, unknown> = await import('./letters');
    const suspicious = Object.keys(module).filter((name) =>
      /countBy|byAuthor|perPerson|ratio|score|tally/i.test(name),
    );
    expect(suspicious).toEqual([]);
  });
});
