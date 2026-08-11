/**
 * The one format that needs a library.
 *
 * Text in a PDF is not text. It is a sequence of glyph indices positioned
 * on a page, and turning that back into a sentence means resolving font
 * encodings, CID maps and the space that is often not a character at all
 * but a gap between two positioned runs. Hand-rolling that would be a
 * different project, and getting it subtly wrong is worse than not doing
 * it: mangled words would land inside a letter somebody is about to send,
 * with nothing to say they had been mangled.
 *
 * So pdf.js does the work, and this file exists to keep it out of the way.
 * It is the only module that imports it, and it is imported dynamically
 * from exactly one place — so the whole library sits in its own chunk and
 * is fetched the first time somebody drops a PDF, and never otherwise.
 *
 * Kept apart from `documents.ts` for the same reason: that file is pure,
 * runs anywhere, and ports to Flutter unchanged. This one does not.
 */

/**
 * Where a line ends.
 *
 * pdf.js reports a text item's `hasEOL` when the producer marked one, but
 * plenty of producers never do, and a page then arrives as one enormous
 * line. The vertical position of each item is the fallback: a jump of more
 * than a few points down the page is a new line whatever the file claims.
 */
const LINE_BREAK_TOLERANCE = 4;

export interface PdfTextResult {
  text: string;
  /** True when the document rendered no text at all — almost always a scan. */
  scanned: boolean;
}

interface TextItemLike {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
}

export async function readPdfText(buffer: ArrayBuffer): Promise<PdfTextResult | null> {
  try {
    const pdfjs = await import('pdfjs-dist');

    // Vite resolves this to a hashed asset and hands back its URL, which is
    // what keeps the worker working in a production build. Pointing at a
    // CDN instead would break the moment the app is offline, and this app
    // is meant to be usable on a train.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();

    const document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      // A letter is words. Nothing here needs to render, and both of these
      // otherwise fetch megabytes of font and character data at runtime.
      disableFontFace: true,
      isEvalSupported: false,
    }).promise;

    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(joinTextItems(content.items as TextItemLike[]));
      page.cleanup();
    }
    await document.destroy();

    const text = pages
      .map((page) => page.trim())
      .filter((page) => page.length > 0)
      .join('\n\n');

    return { text, scanned: text.length === 0 };
  } catch {
    return null;
  }
}

/**
 * One page's items, back into lines.
 *
 * Items are joined with nothing rather than a space, because pdf.js already
 * emits the spaces a document contains as their own items — inserting more
 * puts a gap inside every word that happens to be kerned.
 */
export function joinTextItems(items: readonly TextItemLike[]): string {
  let text = '';
  let previousY: number | null = null;

  for (const item of items) {
    if (typeof item.str !== 'string') continue;

    const y = item.transform?.[5];
    const movedDown =
      typeof y === 'number' &&
      previousY !== null &&
      Math.abs(previousY - y) > LINE_BREAK_TOLERANCE;

    if (movedDown && text.length > 0 && !text.endsWith('\n')) text += '\n';
    text += item.str;
    if (item.hasEOL && !text.endsWith('\n')) text += '\n';

    if (typeof y === 'number') previousY = y;
  }

  return text;
}
