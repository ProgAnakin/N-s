import { describe, expect, it } from 'vitest';
import {
  archiveFilename,
  escapeHtml,
  toHtml,
  toJson,
  type Archive,
} from './archive';

/**
 * The copy you keep.
 *
 * What is being checked here is not formatting. It is that the file still
 * opens, and that it still contains somebody's actual words — which is
 * the only reason to build an archive at all. So: no external requests,
 * nothing lost to escaping, and nothing silently dropped.
 */

const TODAY = { year: 2026, month: 8, day: 14 };

function archive(overrides: Partial<Archive> = {}): Archive {
  return {
    meta: {
      coupleName: 'Nós',
      anniversary: '2023-06-01',
      people: [
        { name: 'Léo', role: 'partner_a' },
        { name: 'Yan', role: 'partner_b' },
      ],
      exportedOn: TODAY,
    },
    memories: [],
    letters: [],
    notes: [],
    expenses: [],
    ideas: [],
    ...overrides,
  };
}

describe('the file has to still open', () => {
  /**
   * The whole premise. A file that fetches a stylesheet, a font or an
   * image from a server is a file that stops working the day that server
   * does — which for an archive is the only day that matters.
   */
  it('reaches for nothing outside itself', () => {
    const html = toHtml(
      archive({
        memories: [
          {
            title: 'Porto',
            date: '2026-05-02',
            note: 'It rained.',
            photos: ['data:image/jpeg;base64,AAAA'],
          },
        ],
      }),
    );

    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/<script\b/);
    expect(html).not.toMatch(/https?:\/\//);
    // The one src in the document is the photograph, and it is inline.
    expect(html).toContain('src="data:image/jpeg;base64,AAAA"');
  });

  it('is a complete document, not a fragment', () => {
    const html = toHtml(archive());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
});

describe('somebody’s words survive intact', () => {
  it('keeps the characters that break naive escaping', () => {
    const html = toHtml(
      archive({
        letters: [
          {
            kind: 'thanks',
            body: 'Você & eu <3 — 我想你',
            from: 'Yan',
            to: 'Léo',
            date: '2026-03-01',
            openOn: null,
          },
        ],
      }),
    );

    expect(html).toContain('Você &amp; eu &lt;3 — 我想你');
  });

  /**
   * `&` has to be escaped before the escapes it introduces, or the
   * reader is shown `&amp;lt;` where the author wrote `<`.
   */
  it('escapes the ampersand first', () => {
    expect(escapeHtml('a < b & c')).toBe('a &lt; b &amp; c');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('keeps the blank lines somebody typed between paragraphs', () => {
    const html = toHtml(
      archive({
        memories: [
          { title: 'A day', date: '2026-01-01', note: 'First.\n\nSecond.', photos: [] },
        ],
      }),
    );
    expect(html).toContain('<p>First.</p>');
    expect(html).toContain('<p>Second.</p>');
  });

  it('keeps a single newline as a line break rather than losing it', () => {
    const html = toHtml(
      archive({
        memories: [{ title: 'x', date: '2026-01-01', note: 'one\ntwo', photos: [] }],
      }),
    );
    expect(html).toContain('one<br>two');
  });
});

describe('nothing is quietly dropped', () => {
  it('carries every kind of thing the couple wrote', () => {
    const html = toHtml(
      archive({
        memories: [{ title: 'The rain', date: '2026-05-02', note: null, photos: [] }],
        letters: [
          { kind: 'thanks', body: 'For the soup.', from: 'Yan', to: 'Léo', date: '2026-03-01', openOn: null },
        ],
        notes: [
          { question: 'Favourite tea', answer: 'Pu-erh', visibility: 'shared', author: 'Léo' },
        ],
        expenses: [
          {
            label: 'Dinner',
            amount: '€45,00',
            paidBy: 'Léo',
            date: '2026-04-01',
            category: 'food',
            split: 'Down the middle',
          },
        ],
        ideas: [{ title: 'The rooftop', note: 'Go before eight' }],
      }),
    );

    for (const words of ['The rain', 'For the soup.', 'Pu-erh', 'Dinner', 'The rooftop']) {
      expect(html).toContain(words);
    }

    // How it was divided, which the keepsake used to drop. Without it a
    // dinner they split and a dinner one of them bought alone come out of
    // the export as the same row, and this is the file you are left
    // holding after erasing the account.
    expect(html).toContain('How it was split');
    expect(html).toContain('Down the middle');
  });

  /**
   * An empty section printed as an empty heading reads as data loss.
   * Absent is the honest rendering of "there were none".
   */
  it('leaves out a section that has nothing in it', () => {
    const html = toHtml(archive({ memories: [{ title: 'x', date: '2026-01-01', note: null, photos: [] }] }));
    expect(html).toContain('Memories');
    expect(html).not.toContain('Letters');
    expect(html).not.toContain('What we spent');
  });

  it('names who it belonged to and when it was taken out', () => {
    const html = toHtml(archive());
    expect(html).toContain('Léo');
    expect(html).toContain('Yan');
    expect(html).toContain('2026-08-14');
  });
});

describe('the machine-readable copy', () => {
  it('round-trips without losing anything', () => {
    const original = archive({
      memories: [{ title: 'Porto', date: '2026-05-02', note: 'Rain.', photos: [] }],
    });
    expect(JSON.parse(toJson(original))).toEqual(original);
  });
});

describe('the filename', () => {
  it('sorts by date and offends no filesystem', () => {
    expect(archiveFilename('Nós dois', TODAY, 'html')).toBe('nos-dois-2026-08-14.html');
    expect(archiveFilename('Léo & Yan', TODAY, 'json')).toBe('leo-yan-2026-08-14.json');
  });

  it('still produces a name when the couple never chose one', () => {
    expect(archiveFilename(null, TODAY, 'json')).toBe('nos-2026-08-14.json');
    expect(archiveFilename('', TODAY, 'html')).toBe('nos-2026-08-14.html');
  });

  it('pads the month and day, so files sort in the order they happened', () => {
    expect(archiveFilename('a', { year: 2026, month: 1, day: 5 }, 'json')).toBe(
      'a-2026-01-05.json',
    );
  });
});
