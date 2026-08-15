import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_DOCUMENTS,
  documentKind,
  documentXmlToText,
  readDocx,
  readPlainText,
  readRtf,
  readZipEntry,
  tidy,
} from './documents';

/**
 * Reading a dropped file well enough to put it in a letter.
 *
 * The bar throughout is that somebody's words survive intact. A converter
 * that drops an accent, runs two paragraphs together, or silently returns
 * a screenful of mojibake is worse than one that refuses the file, because
 * the mangling arrives inside something they are about to send.
 */

function utf8(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

describe('working out what a file is', () => {
  it('goes by the extension the person gave it', () => {
    expect(documentKind('letter.txt')).toBe('text');
    expect(documentKind('NOTES.MD')).toBe('markdown');
    expect(documentKind('carta.rtf')).toBe('rtf');
    expect(documentKind('Letter.docx')).toBe('docx');
    expect(documentKind('scan.pdf')).toBe('pdf');
  });

  /**
   * The browser's idea of a file's type comes from the operating system and
   * is wrong often enough to matter: Windows reports .docx as
   * `application/octet-stream` about as often as not.
   */
  it('trusts the extension over a type the operating system guessed', () => {
    expect(documentKind('letter.docx', 'application/octet-stream')).toBe('docx');
    expect(documentKind('notes.md', 'application/octet-stream')).toBe('markdown');
  });

  it('falls back to the type when there is no extension at all', () => {
    expect(documentKind('letter', 'application/pdf')).toBe('pdf');
    expect(documentKind('letter', 'text/plain')).toBe('text');
    expect(
      documentKind(
        'letter',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('docx');
  });

  /**
   * A .doc or .pages decoded as UTF-8 produces a screen of replacement
   * characters. Refusing reads as "the app cannot open this"; accepting
   * reads as "the app is broken".
   */
  it('refuses a format it cannot read rather than producing mojibake', () => {
    expect(documentKind('old.doc', 'application/msword')).toBeNull();
    expect(documentKind('deck.key')).toBeNull();
    expect(documentKind('photo.jpg', 'image/jpeg')).toBeNull();
  });

  it('offers extensions as well as types to the file picker', () => {
    // A picker filtered on MIME alone greys out the .docx the reader is
    // trying to choose, on exactly the systems that report it wrongly.
    for (const extension of ['.txt', '.md', '.rtf', '.docx', '.pdf']) {
      expect(ACCEPTED_DOCUMENTS).toContain(extension);
    }
  });
});

describe('plain text', () => {
  it('reads UTF-8 including the characters that usually break', () => {
    expect(readPlainText(utf8('Saudades. 我想你。 Ainda bem que existe você.'))).toBe(
      'Saudades. 我想你。 Ainda bem que existe você.',
    );
  });

  it('drops a byte-order mark rather than leaving it in the first word', () => {
    expect(readPlainText(utf8('﻿Querida'))).toBe('Querida');
  });
});

describe('RTF', () => {
  it('keeps the words and drops the formatting', () => {
    const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0\froman Times;}}\f0\fs24 Hello there.\par Second line.}`;
    expect(readRtf(utf8(rtf))).toBe('Hello there.\nSecond line.');
  });

  /**
   * The ordering trap. Control words have to be stripped *after* the
   * escapes are resolved, or `\'e9` loses its hex payload and every
   * accented letter disappears from the middle of a word.
   */
  it('resolves accented characters instead of eating them', () => {
    const rtf = String.raw`{\rtf1\ansi caf\'e9 e cora\'e7\'e3o}`;
    expect(readRtf(utf8(rtf))).toBe('café e coração');
  });

  it('resolves the unicode escape and drops its ASCII fallback', () => {
    // Built rather than written out: an RTF unicode escape is a backslash,
    // a "u", a decimal code point and a fallback character, and spelling
    // that out as a literal in a test file is one editor away from being
    // silently turned into the character it describes.
    const escape = (codePoint: number) => '\\u' + codePoint + '?';
    const rtf = '{\\rtf1\\ansi ' + [25105, 24819, 20320].map(escape).join('') + '}';

    expect(readRtf(utf8(rtf))).toBe('我想你');
  });

  it('throws away the font table rather than reading it as a sentence', () => {
    const rtf = String.raw`{\rtf1{\fonttbl{\f0 Calibri;}{\f1 Cambria;}}\f0 Only this.}`;
    const text = readRtf(utf8(rtf));
    expect(text).toBe('Only this.');
    expect(text).not.toContain('Calibri');
  });

  it('keeps a literal brace that was escaped', () => {
    expect(readRtf(utf8(String.raw`{\rtf1 a \{b\} c}`))).toBe('a {b} c');
  });
});

// ---------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------

/** A minimal but real ZIP, so the reader is tested against bytes. */
function zip(entries: { name: string; data: Uint8Array; store?: boolean }[]): ArrayBuffer {
  const locals: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const compressed = entry.store ? entry.data : new Uint8Array(deflateRawSync(entry.data));
    const method = entry.store ? 0 : 8;

    const local = new Uint8Array(30 + name.length + compressed.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, method, true);
    localView.setUint32(18, compressed.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(compressed, 30 + name.length);
    locals.push(local);

    const record = new Uint8Array(46 + name.length);
    const recordView = new DataView(record.buffer);
    recordView.setUint32(0, 0x02014b50, true);
    recordView.setUint16(10, method, true);
    recordView.setUint32(20, compressed.length, true);
    recordView.setUint32(24, entry.data.length, true);
    recordView.setUint16(28, name.length, true);
    recordView.setUint32(42, offset, true);
    record.set(name, 46);
    directory.push(record);

    offset += local.length;
  }

  const directorySize = directory.reduce((sum, record) => sum + record.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);

  const total = [...locals, ...directory, end];
  const out = new Uint8Array(total.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of total) {
    out.set(part, at);
    at += part.length;
  }
  return out.buffer;
}

const DOCUMENT_XML = `<?xml version="1.0"?>
<w:document xmlns:w="x"><w:body>
<w:p><w:r><w:t>Querida,</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">you stayed up so I </w:t></w:r><w:r><w:t>would not</w:t></w:r><w:r><w:t xml:space="preserve"> eat alone.</w:t></w:r></w:p>
<w:p><w:r><w:t>Caf&#233; &amp; coração</w:t></w:r></w:p>
</w:body></w:document>`;

describe('DOCX', () => {
  it('reads the text out of a real archive', async () => {
    const buffer = zip([
      { name: '[Content_Types].xml', data: new TextEncoder().encode('<Types/>') },
      { name: 'word/document.xml', data: new TextEncoder().encode(DOCUMENT_XML) },
    ]);

    expect(await readDocx(buffer)).toBe(
      'Querida,\nyou stayed up so I would not eat alone.\nCafé & coração',
    );
  });

  it('reads an entry that was stored rather than deflated', async () => {
    const buffer = zip([
      { name: 'word/document.xml', data: new TextEncoder().encode(DOCUMENT_XML), store: true },
    ]);
    expect(await readDocx(buffer)).toContain('Querida');
  });

  it('returns nothing for an archive that is not a document', async () => {
    const buffer = zip([{ name: 'mimetype', data: new TextEncoder().encode('x') }]);
    expect(await readDocx(buffer)).toBeNull();
  });

  it('returns nothing rather than throwing on bytes that are not a ZIP', async () => {
    expect(await readZipEntry(utf8('not a zip at all'), 'word/document.xml')).toBeNull();
  });

  /**
   * The run-joining rule, which is the whole trick.
   *
   * Word splits a sentence at every change of formatting, so one bold word
   * turns one sentence into three runs. Joining them with a space puts gaps
   * inside words; joining paragraphs without a newline runs the whole
   * letter into a single line. Both are wrong in a way you only notice
   * after sending it.
   */
  it('joins runs with nothing and paragraphs with a newline', () => {
    const xml =
      '<w:p><w:r><w:t>un</w:t></w:r><w:r><w:t>breakable</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>next</w:t></w:r></w:p>';
    expect(documentXmlToText(xml)).toBe('unbreakable\nnext');
  });

  it('keeps an explicit line break inside a paragraph', () => {
    const xml = '<w:p><w:r><w:t>one</w:t><w:br/><w:t>two</w:t></w:r></w:p>';
    expect(documentXmlToText(xml)).toBe('one\ntwo');
  });

  it('does not mistake a tab element for a text element', () => {
    // `<w:tab/>` starts with the same three characters as `<w:t>`, and a
    // loose pattern turns every tab into a stray fragment of markup.
    const xml = '<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t></w:r></w:p>';
    expect(documentXmlToText(xml)).toBe('a\tb');
  });

  it('unescapes an ampersand last, so &amp;lt; stays literal', () => {
    expect(documentXmlToText('<w:p><w:r><w:t>&amp;lt;3</w:t></w:r></w:p>')).toBe('&lt;3');
  });
});

describe('tidying', () => {
  it('normalises what converters leave behind without touching the words', () => {
    expect(tidy('one\r\n\r\n\r\n\r\ntwo   three four  \n')).toBe('one\n\ntwo three four');
  });

  it('keeps a deliberate blank line between paragraphs', () => {
    expect(tidy('first\n\nsecond')).toBe('first\n\nsecond');
  });
});
