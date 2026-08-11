import {
  documentKind,
  MAX_IMPORT_BYTES,
  readDocx,
  readPlainText,
  readRtf,
  tidy,
  type ImportResult,
} from './documents';

/**
 * One dropped file, one answer.
 *
 * The size and kind checks come before anything is read, deliberately: a
 * 40 MB scan should be refused in a millisecond rather than after the tab
 * has spent ten seconds inflating it, and a file the app cannot read
 * should say so before it has produced a screen of replacement characters.
 *
 * PDF is loaded through a dynamic import so pdf.js — the largest thing in
 * the dependency tree by a wide margin — never enters the bundle for the
 * many more people who will drop a .txt or a .docx. The seam is here
 * rather than inside `documents.ts` so that file stays pure.
 */
export async function importDocument(file: {
  name: string;
  type?: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<ImportResult> {
  const kind = documentKind(file.name, file.type ?? '');
  if (kind === null) return { ok: false, reason: 'unsupported' };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, reason: 'too_large' };

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  switch (kind) {
    case 'text':
    case 'markdown': {
      const text = tidy(readPlainText(buffer));
      return text ? { ok: true, text, kind } : { ok: false, reason: 'empty' };
    }

    case 'rtf': {
      const text = readRtf(buffer);
      return text ? { ok: true, text, kind } : { ok: false, reason: 'empty' };
    }

    case 'docx': {
      const text = await readDocx(buffer);
      if (text === null) return { ok: false, reason: 'unreadable' };
      return text ? { ok: true, text, kind } : { ok: false, reason: 'empty' };
    }

    case 'pdf': {
      const { readPdfText } = await import('./documents-pdf');
      const result = await readPdfText(buffer);
      if (result === null) return { ok: false, reason: 'unreadable' };
      // A scan is not a broken file and should not be reported as one —
      // the fix is a different file, not a different app.
      if (result.scanned) return { ok: false, reason: 'no_text_layer' };
      const text = tidy(result.text);
      return text ? { ok: true, text, kind } : { ok: false, reason: 'no_text_layer' };
    }
  }
}
