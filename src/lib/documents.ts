/**
 * Turning a dropped file into the body of a letter.
 *
 * The point is not file management. A letter that arrives as an attachment
 * is a document; a letter you can still edit before you send it is a
 * letter. So every format here reduces to the same thing — plain text in a
 * textarea, with the sender's hand still on it.
 *
 * Three of the four formats are handled here with no dependency at all:
 *
 *   - **Plain text and Markdown** are read as UTF-8.
 *   - **RTF** is stripped of its control words. Not a real parser, and it
 *     does not need to be: the escapes that matter for a letter are the
 *     unicode ones, and everything else is punctuation.
 *   - **DOCX** is a ZIP holding `word/document.xml`. The browser can
 *     already inflate — `DecompressionStream('deflate-raw')` — so the only
 *     thing missing was reading the ZIP directory, which is about eighty
 *     lines. Pulling in a library to do that would have cost more than it
 *     saved.
 *
 * PDF is the exception and lives in `documents-pdf.ts`, loaded only when
 * somebody actually drops one. Extracting text from a PDF means content
 * streams, font encodings and CID maps; hand-rolling that would be a
 * different project, and getting it subtly wrong would put mangled words
 * into somebody's letter without saying so.
 *
 * Everything is framework-agnostic and takes an ArrayBuffer, so it tests
 * without a browser and ports without changes.
 */

export type DocumentKind = 'text' | 'markdown' | 'rtf' | 'docx' | 'pdf';

export type ImportFailure =
  | 'unsupported'
  | 'too_large'
  | 'empty'
  | 'unreadable'
  /** A PDF with no text layer — a scan. Worth its own message. */
  | 'no_text_layer';

export type ImportResult =
  | { ok: true; text: string; kind: DocumentKind }
  | { ok: false; reason: ImportFailure };

/**
 * 2 MB.
 *
 * A letter is words. Anything past this is a document somebody meant to
 * attach rather than say, and refusing early beats freezing the tab while
 * a 40 MB scan inflates in memory.
 */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * What the file drop accepts, for the `accept` attribute.
 *
 * Extensions as well as MIME types: Windows regularly reports a .docx as
 * `application/octet-stream`, and a picker filtered on MIME alone then
 * greys out the very file the reader is trying to choose.
 */
export const ACCEPTED_DOCUMENTS =
  '.txt,.md,.markdown,.rtf,.docx,.pdf,text/plain,text/markdown,application/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf';

/**
 * Which reader a file needs, from its name and type.
 *
 * Extension first. A browser's idea of a file's type is a guess assembled
 * from the operating system, and it is wrong often enough — `.md` as
 * `application/octet-stream`, `.docx` as `application/zip` — that trusting
 * it over the name the person gave the file is the wrong way round.
 */
export function documentKind(fileName: string, mimeType = ''): DocumentKind | null {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

  switch (extension) {
    case 'txt':
    case 'text':
      return 'text';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'rtf':
      return 'rtf';
    case 'docx':
      return 'docx';
    case 'pdf':
      return 'pdf';
  }

  const type = mimeType.toLowerCase();
  if (type === 'application/pdf') return 'pdf';
  if (type.includes('wordprocessingml')) return 'docx';
  if (type === 'application/rtf' || type === 'text/rtf') return 'rtf';
  if (type === 'text/markdown') return 'markdown';
  if (type.startsWith('text/')) return 'text';

  // Deliberately not a fallback to text. A .doc, a .pages or a .key read as
  // UTF-8 produces a screenful of mojibake that looks like a bug in the app
  // rather than a file it cannot read.
  return null;
}

/** UTF-8, with the byte-order mark dropped if one is present. */
export function readPlainText(buffer: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(buffer).replace(/^﻿/, '');
}

/**
 * RTF, reduced to what somebody wrote.
 *
 * Order matters here and is easy to get wrong: `\'e9`-style escapes have to
 * be resolved before control words are stripped, or `\'e9` loses its
 * payload and the accented letters vanish from the middle of words. Groups
 * that are wholly metadata — the font and colour tables, and anything
 * marked `\*` — go first, because their contents are not text and would
 * otherwise survive the control-word pass as a line of font names.
 */
export function readRtf(buffer: ArrayBuffer): string {
  // Latin-1 rather than UTF-8: an RTF's bytes above 127 are code-page
  // escapes, not UTF-8 sequences, and decoding them as UTF-8 corrupts them.
  let text = new TextDecoder('windows-1252').decode(buffer);

  text = removeRtfGroups(text, /^\\(?:\*|fonttbl|colortbl|stylesheet|info|pict|object)\b/);

  text = text
    // Escaped literals are parked here and restored at the very end.
    // Unescaping them in place instead means the brace-stripping pass two
    // lines later deletes them again, and the letter quietly loses every
    // bracket its author typed.
    .replace(/\\\\/g, PARKED.backslash)
    .replace(/\\\{/g, PARKED.open)
    .replace(/\\\}/g, PARKED.close)
    // \uN — the unicode escape, with its ASCII fallback character after it.
    .replace(/\\u(-?\d+)\s?\??/g, (_, code: string) =>
      String.fromCharCode(((Number(code) % 65536) + 65536) % 65536),
    )
    // \'hh — a byte in the document's code page.
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    // The trailing space is part of the control word, not part of the
    // sentence: RTF ends a control word at one space and swallows it. Left
    // in, every paragraph after the first begins with an indent nobody
    // typed.
    .replace(/\\par[d]?\b ?/g, '\n')
    .replace(/\\line\b ?/g, '\n')
    .replace(/\\tab\b ?/g, '\t')
    // Everything else that is a control word.
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
    .replace(/[{}]/g, '')
    .split(PARKED.open)
    .join('{')
    .split(PARKED.close)
    .join('}')
    .split(PARKED.backslash)
    .join('\\');

  return tidy(text);
}

/**
 * Private-use characters, which cannot occur in a document's own text.
 *
 * Built with `fromCharCode` rather than written as literals so the source
 * stays readable: three invisible characters in the middle of a regex is
 * how this kind of substitution becomes a mystery a year later.
 */
const PARKED = {
  backslash: String.fromCharCode(0xe000),
  open: String.fromCharCode(0xe001),
  close: String.fromCharCode(0xe002),
  newline: String.fromCharCode(0xe003),
  tab: String.fromCharCode(0xe004),
} as const;

/** Drops `{\fonttbl …}` and friends, brace-balanced so nesting survives. */
function removeRtfGroups(text: string, opener: RegExp): string {
  let result = '';
  let index = 0;

  while (index < text.length) {
    const character = text[index];
    if (character !== '{') {
      result += character;
      index += 1;
      continue;
    }

    const isMeta = opener.test(text.slice(index + 1, index + 24));
    if (!isMeta) {
      result += character;
      index += 1;
      continue;
    }

    let depth = 0;
    while (index < text.length) {
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
      index += 1;
    }
  }

  return result;
}

// ---------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------

/**
 * The text of a .docx.
 *
 * A .docx is a ZIP. The entry that matters is `word/document.xml`, and its
 * text lives in `<w:t>` elements, one per formatting run — so a sentence
 * where one word is bold arrives as three runs and has to be joined with
 * nothing between them. Paragraphs and explicit breaks become newlines.
 * Everything else in the file is layout.
 */
export async function readDocx(buffer: ArrayBuffer): Promise<string | null> {
  const entry = await readZipEntry(buffer, 'word/document.xml');
  if (entry === null) return null;
  return documentXmlToText(new TextDecoder('utf-8').decode(entry));
}

export function documentXmlToText(xml: string): string {
  /*
   * The three structural tags become sentinels first, and everything else
   * between runs is then thrown away.
   *
   * The obvious version — scan the gap between two runs for newlines —
   * works on Word's own output, because Word writes the whole body on one
   * line. It falls apart on any producer that pretty-prints its XML: the
   * indentation between `</w:p>` and the next `<w:p>` reads as extra
   * paragraph breaks, and the letter arrives double-spaced throughout.
   * Whitespace in the markup is layout; only the tags are structure.
   */
  const marked = xml
    .replace(/<w:tab\b[^>]*\/>/g, PARKED.tab)
    .replace(/<w:br\b[^>]*\/>/g, PARKED.newline)
    .replace(/<\/w:p>/g, PARKED.newline);

  let text = '';
  // `<w:t>` and `<w:t xml:space="preserve">`, but never `<w:tab/>` — hence
  // the explicit boundary on the opening tag.
  const run = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  let lastEnd = 0;

  const structureOnly = (between: string) =>
    Array.from(between)
      .filter((character) => character === PARKED.tab || character === PARKED.newline)
      .join('');

  while ((match = run.exec(marked)) !== null) {
    text += structureOnly(marked.slice(lastEnd, match.index));
    text += decodeXmlEntities(match[1]);
    lastEnd = run.lastIndex;
  }
  text += structureOnly(marked.slice(lastEnd));

  return tidy(text.split(PARKED.tab).join('\t').split(PARKED.newline).join('\n'));
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    // Last, so an `&amp;lt;` in the source does not become a `<`.
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------
// Just enough ZIP
// ---------------------------------------------------------------------

const SIGNATURE_END_OF_DIRECTORY = 0x06054b50;
const SIGNATURE_DIRECTORY_ENTRY = 0x02014b50;

/**
 * One named entry out of a ZIP, decompressed.
 *
 * Read through the central directory rather than by scanning for local
 * headers: a local header's sizes may be zeroed with the real values in a
 * trailing data descriptor, which is exactly how Word writes files that
 * were streamed. The directory always has them.
 *
 * Returns null when the archive is malformed or the entry is not there —
 * a .docx with no `word/document.xml` is not a .docx, and guessing at
 * another entry would produce confident nonsense.
 */
export async function readZipEntry(
  buffer: ArrayBuffer,
  wanted: string,
): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const endOffset = findEndOfDirectory(view, bytes.length);
  if (endOffset === null) return null;

  let entryOffset = view.getUint32(endOffset + 16, true);
  const entryCount = view.getUint16(endOffset + 10, true);

  for (let index = 0; index < entryCount; index += 1) {
    if (entryOffset + 46 > bytes.length) return null;
    if (view.getUint32(entryOffset, true) !== SIGNATURE_DIRECTORY_ENTRY) return null;

    const method = view.getUint16(entryOffset + 10, true);
    const compressedSize = view.getUint32(entryOffset + 20, true);
    const nameLength = view.getUint16(entryOffset + 28, true);
    const extraLength = view.getUint16(entryOffset + 30, true);
    const commentLength = view.getUint16(entryOffset + 32, true);
    const localOffset = view.getUint32(entryOffset + 42, true);

    const name = new TextDecoder('utf-8').decode(
      bytes.subarray(entryOffset + 46, entryOffset + 46 + nameLength),
    );

    if (name === wanted) {
      // The local header repeats the name and extra field, and its extra
      // field length routinely differs from the directory's — so the data
      // start has to be read from the local header itself.
      if (localOffset + 30 > bytes.length) return null;
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(start, start + compressedSize);

      if (method === 0) return data;
      if (method === 8) return inflateRaw(data as Uint8Array<ArrayBuffer>);
      return null;
    }

    entryOffset += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

/**
 * The end-of-central-directory record.
 *
 * Scanned backwards because it is the last thing in the file, and it can be
 * followed by up to 64 KB of comment — so its position is not fixed and has
 * to be found rather than computed.
 */
function findEndOfDirectory(view: DataView, length: number): number | null {
  const earliest = Math.max(0, length - 0xffff - 22);
  for (let offset = length - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === SIGNATURE_END_OF_DIRECTORY) return offset;
  }
  return null;
}

/**
 * Deflate, using what the platform already has.
 *
 * Built from a ReadableStream rather than `new Blob([…]).stream()`, and
 * drained with a reader rather than `new Response(stream)`. Both of the
 * shorter spellings work in a browser and neither works under jsdom, so
 * the convenient version passes review and fails the moment anything
 * tests it.
 */
async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const source = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });

    // `DecompressionStream` is typed as accepting `BufferSource` in and
    // emitting `Uint8Array`, so the pair does not line up with a stream of
    // one type — hence the two annotations rather than one.
    const reader = (
      source.pipeThrough(new DecompressionStream('deflate-raw')) as ReadableStream<Uint8Array>
    ).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }

    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Tidying
// ---------------------------------------------------------------------

/**
 * What a person would have typed.
 *
 * Every one of these substitutions fixes something a converter leaves
 * behind: CRLFs from Windows, non-breaking spaces from Word, runs of blank
 * lines where a page break used to be, and trailing spaces at the end of
 * every line of a PDF extraction. None of it changes the words.
 */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
