/**
 * Taking it all with you.
 *
 * The ending screen says, on the hardest page in the app: *closing a
 * space is not confiscating it*. That was half true. Everything stayed
 * readable — inside the app, for as long as the app exists, on a database
 * somebody keeps paying for. There was no way to get any of it out.
 *
 * Two shapes, and the second is the one that matters.
 *
 * **JSON** is the machine's copy: every row, exactly as stored, so the
 * data can be moved somewhere else or read by a program in ten years.
 *
 * **A single HTML file** is the human's copy, and it is the reason this
 * module exists rather than a `select *` in a screen. Photographs
 * embedded as data URIs, no stylesheet to fetch, no server, no app. Drop
 * it on a desktop in 2040 and it opens. For something built to help two
 * people remember, outliving itself is not a nice-to-have — it is the
 * whole point of writing anything down.
 *
 * Pure, like everything in /src/lib: rows in, strings out. The screen
 * fetches, this shapes, the browser saves.
 */

import type { CalendarDate } from './calendar';

export interface ArchiveMeta {
  coupleName: string | null;
  anniversary: string | null;
  /** Both people, so the file can say who it belonged to. */
  people: { name: string; role: string | null }[];
  exportedOn: CalendarDate;
}

export interface ArchiveMemory {
  title: string;
  date: string;
  note: string | null;
  /** Data URIs, already inlined by the caller. Empty when none. */
  photos: string[];
}

export interface ArchiveLetter {
  kind: string;
  body: string;
  from: string;
  to: string;
  date: string;
  openOn: string | null;
}

export interface ArchiveNote {
  question: string;
  answer: string;
  visibility: string;
  author: string;
}

export interface ArchiveExpense {
  label: string;
  amount: string;
  paidBy: string;
  date: string;
  category: string;
}

export interface ArchiveIdea {
  title: string;
  note: string | null;
}

export interface Archive {
  meta: ArchiveMeta;
  memories: ArchiveMemory[];
  letters: ArchiveLetter[];
  notes: ArchiveNote[];
  expenses: ArchiveExpense[];
  ideas: ArchiveIdea[];
}

/** Everything, as data. Ordering is the caller's; this only serialises. */
export function toJson(archive: Archive): string {
  return JSON.stringify(archive, null, 2);
}

/**
 * Escapes text for HTML.
 *
 * Everything in an archive is somebody's own words, and somebody's own
 * words are exactly where an ampersand or a less-than lives. The order
 * matters: `&` first, or the escapes introduced afterwards get escaped
 * again and the reader sees `&amp;lt;` on the page.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Paragraphs from a note, preserving the blank lines somebody typed. */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function section(title: string, count: number, body: string): string {
  if (count === 0) return '';
  return `<section><h2>${escapeHtml(title)}</h2>\n${body}\n</section>`;
}

/**
 * The whole archive as one file that needs nothing else.
 *
 * The styling is inline and deliberately plain — a serif, a warm ground,
 * one column at reading width. It is not trying to be the app. It is
 * trying to still open.
 */
export function toHtml(archive: Archive): string {
  const { meta } = archive;
  const title = meta.coupleName ? `${meta.coupleName}` : 'Nós';
  const names = meta.people.map((person) => person.name).filter(Boolean);

  const memories = archive.memories
    .map(
      (memory) => `<article class="memory">
  <p class="when">${escapeHtml(memory.date)}</p>
  <h3>${escapeHtml(memory.title)}</h3>
  ${memory.note ? paragraphs(memory.note) : ''}
  ${memory.photos
    .map((src) => `<img src="${src}" alt="">`)
    .join('\n  ')}
</article>`,
    )
    .join('\n');

  const letters = archive.letters
    .map(
      (letter) => `<article class="letter">
  <p class="when">${escapeHtml(letter.date)} · ${escapeHtml(letter.from)} → ${escapeHtml(letter.to)}</p>
  ${paragraphs(letter.body)}
</article>`,
    )
    .join('\n');

  const notes = archive.notes
    .map(
      (note) => `<div class="note">
  <p class="q">${escapeHtml(note.question)}</p>
  <p class="a">${escapeHtml(note.answer)}</p>
</div>`,
    )
    .join('\n');

  const expenses = `<table>
<thead><tr><th>When</th><th>What</th><th>Who</th><th class="num">How much</th></tr></thead>
<tbody>
${archive.expenses
  .map(
    (expense) =>
      `<tr><td>${escapeHtml(expense.date)}</td><td>${escapeHtml(expense.label)}</td><td>${escapeHtml(expense.paidBy)}</td><td class="num">${escapeHtml(expense.amount)}</td></tr>`,
  )
  .join('\n')}
</tbody></table>`;

  const ideas = `<ul>
${archive.ideas
  .map(
    (idea) =>
      `<li>${escapeHtml(idea.title)}${idea.note ? ` — <span>${escapeHtml(idea.note)}</span>` : ''}</li>`,
  )
  .join('\n')}
</ul>`;

  // No external anything: no font link, no stylesheet, no script. A file
  // that reaches for the network is a file that stops working.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0 auto; padding: 3rem 1.25rem 6rem; max-width: 42rem;
    background: #faf5ec; color: #1c1a17;
    font: 16px/1.65 "Iowan Old Style", Palatino, Georgia, serif;
  }
  header { border-bottom: 2px solid #d8cdb8; padding-bottom: 1.5rem; margin-bottom: 2.5rem; }
  h1 { font-size: 2.25rem; margin: 0 0 .35rem; font-weight: 500; }
  .sub { color: #6b6459; margin: 0; font-size: .95rem; }
  h2 {
    font-size: .78rem; letter-spacing: .13em; text-transform: uppercase;
    color: #6b6459; border-bottom: 1px solid #e2d9c8;
    padding-bottom: .4rem; margin: 3.5rem 0 1.25rem; font-weight: 600;
  }
  .memory, .letter { margin: 0 0 2.5rem; }
  .when { font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; color: #8a8177; margin: 0 0 .3rem; }
  h3 { font-size: 1.3rem; margin: 0 0 .6rem; font-weight: 500; }
  p { margin: 0 0 .8rem; }
  img { max-width: 100%; height: auto; display: block; margin: 1rem 0; border: 1px solid #e2d9c8; }
  .letter { border-left: 2px solid #b2472f; padding-left: 1.1rem; }
  .note { margin-bottom: 1.1rem; }
  .note .q { color: #6b6459; font-size: .9rem; margin: 0; }
  .note .a { margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th { text-align: left; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: #6b6459; border-bottom: 1px solid #d8cdb8; padding: 0 .5rem .4rem 0; }
  td { padding: .45rem .5rem .45rem 0; border-bottom: 1px solid #ece4d6; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  ul { padding-left: 1.1rem; }
  li span { color: #6b6459; }
  footer { margin-top: 5rem; padding-top: 1.5rem; border-top: 1px solid #e2d9c8; color: #8a8177; font-size: .8rem; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">${escapeHtml(names.join(' &amp; ').replace('&amp;amp;', '&amp;'))}${
    meta.anniversary ? ` · since ${escapeHtml(meta.anniversary)}` : ''
  }</p>
</header>

${section('Memories', archive.memories.length, memories)}
${section('Letters', archive.letters.length, letters)}
${section('What we learned about each other', archive.notes.length, notes)}
${section('What we spent', archive.expenses.length, expenses)}
${section('Things we meant to do', archive.ideas.length, ideas)}

<footer>
  Taken out of Nós on ${meta.exportedOn.year}-${pad(meta.exportedOn.month)}-${pad(meta.exportedOn.day)}.
  This file needs nothing else — no app, no server, no connection. Keep it somewhere you will find it.
</footer>
</body>
</html>
`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A filename that sorts by date and offends no filesystem. */
export function archiveFilename(
  coupleName: string | null,
  on: CalendarDate,
  extension: 'json' | 'html',
): string {
  const stem = (coupleName ?? 'nos')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${stem || 'nos'}-${on.year}-${pad(on.month)}-${pad(on.day)}.${extension}`;
}
