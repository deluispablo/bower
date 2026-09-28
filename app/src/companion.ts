/**
 * A file's companion note (issue #606, spec R-FILE-8): the note Bower wrote
 * about a PDF, a photo or any other file. Pure helpers; the file screen reads
 * the notes' frontmatter and `index.md` and hands the results in.
 *
 * A companion is found, in order, by its `original` field, by a catalogue row
 * that names both the note and the file, and by sharing the file's name
 * (`Name.pdf` → `Name.md`). The folder screen (#611) and Just filed (#616)
 * reuse it.
 */

import type { DriveFile } from './drive.js';
import { folderOf } from './navigation.js';

/** A list item starting with a wikilink: `- [[target|alias]] rest`. */
const ROW = /^\s*[-*+]\s+\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\](.*)$/;
const WIKILINK = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;

function lower(text: string): string {
  return text.trim().toLowerCase();
}

/** A link target's last path segment, lower-cased: `A/B.pdf` → `b.pdf`. */
function lastSegment(target: string): string {
  return lower(target.split('/').pop() ?? '');
}

/**
 * Files the catalogue (`index.md`) ties to a note: a row whose first link is
 * the note and which links to further files (`- [[Note]]: summary
 * ([[Name.pdf]])`). Keyed by the file's target, lower-cased; the value is the
 * note's target, lower-cased. Rows whose first link is a file, and links to
 * notes, are skipped. The first row for a file wins.
 */
export function parseCatalogueFiles(text: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = ROW.exec(line);
    const note = match?.[1]?.trim();
    if (note === undefined || note === '' || /\.[a-z0-9]{1,5}$/i.test(note)) {
      continue;
    }
    for (const link of (match?.[2] ?? '').matchAll(WIKILINK)) {
      const target = link[1]?.trim();
      if (target === undefined || /\.md$/i.test(target)) continue;
      if (!/\.[a-z0-9]{1,5}$/i.test(target)) continue;
      const key = lower(target);
      if (!files.has(key)) files.set(key, lower(note));
    }
  }
  return files;
}

/** The file a note's `original` names: `[[A/B.pdf|alias]]` → `b.pdf`. */
export function originalName(original: string): string {
  const inner = /\[\[([^\]|#]+)/.exec(original)?.[1] ?? original;
  return lastSegment(inner);
}

function sameFolderNotes(
  file: Pick<DriveFile, 'path'>,
  notes: readonly DriveFile[],
): DriveFile[] {
  const folder = folderOf(file.path);
  return notes.filter((note) => folderOf(note.path) === folder);
}

/** The note `Name.md` beside `Name.pdf`, if any. */
export function sameNameNote(
  file: Pick<DriveFile, 'path'>,
  byPath: ReadonlyMap<string, DriveFile>,
): DriveFile | undefined {
  return byPath.get(file.path.replace(/\.[^./]+$/, '.md'));
}

export interface CompanionSources {
  /** Every note of the vault. */
  notes: readonly DriveFile[];
  byPath: ReadonlyMap<string, DriveFile>;
  /** Each note's `original` (a note id → its raw value), as far as read. */
  originals: ReadonlyMap<string, string>;
  /** `parseCatalogueFiles` of `index.md`. */
  catalogue: ReadonlyMap<string, string>;
}

/** The notes worth reading for `original`: the same-name one first, then the folder's others. */
export function companionCandidates(
  file: DriveFile,
  notes: readonly DriveFile[],
  byPath: ReadonlyMap<string, DriveFile>,
): DriveFile[] {
  const first = sameNameNote(file, byPath);
  const rest = sameFolderNotes(file, notes).filter(
    (note) => note.id !== first?.id,
  );
  return first === undefined ? rest : [first, ...rest];
}

/** `file`'s companion note, or `undefined` when there is none. */
export function findCompanion(
  file: DriveFile,
  sources: CompanionSources,
): DriveFile | undefined {
  const name = lower(file.name);
  const inFolder = sameFolderNotes(file, sources.notes);
  const claimed = inFolder.find((note) => {
    const original = sources.originals.get(note.id);
    return original !== undefined && originalName(original) === name;
  });
  if (claimed !== undefined) return claimed;

  const target =
    sources.catalogue.get(lower(file.path)) ?? sources.catalogue.get(name);
  if (target !== undefined) {
    const listed = sources.notes.find((note) => {
      const path = lower(note.path).replace(/\.md$/, '');
      const title = lower(note.name).replace(/\.md$/, '');
      return path === target || title === lastSegment(target);
    });
    if (listed !== undefined) return listed;
  }

  return sameNameNote(file, sources.byPath);
}

export interface PageLink {
  /** "p. 4". */
  label: string;
  page: number;
  /** What is on that page. */
  text: string;
}

const WHERE_HEADING = /^#{1,6}\s+where to look\s*$/i;
const PAGE_ITEM =
  /^\s*[-*+]\s+\[\[[^\]|#]*#page=(\d+)(?:\|([^\]]*))?\]\]\s*[:\-–—]?\s*(.*)$/i;

/** The lines of a note's "Where to look" section, or `null` when it has none. */
function whereSection(
  lines: readonly string[],
): { start: number; end: number } | null {
  const start = lines.findIndex((line) => WHERE_HEADING.test(line.trim()));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/** A note's "Where to look" list of page links, in order; empty when none. */
export function whereToLook(noteText: string): PageLink[] {
  const lines = noteText.split(/\r\n|\r|\n/);
  const section = whereSection(lines);
  if (section === null) return [];
  const links: PageLink[] = [];
  for (const line of lines.slice(section.start + 1, section.end)) {
    const match = PAGE_ITEM.exec(line);
    if (match === null) continue;
    const page = Number(match[1]);
    if (!Number.isInteger(page) || page < 1) continue;
    links.push({
      page,
      label: (match[2] ?? '').trim() || `p. ${String(page)}`,
      text: (match[3] ?? '').trim(),
    });
  }
  return links;
}

/** The note with its "Where to look" section taken out (the screen shows it apart). */
export function withoutWhereToLook(noteText: string): string {
  const lines = noteText.split(/\r\n|\r|\n/);
  const section = whereSection(lines);
  if (section === null) return noteText;
  return [...lines.slice(0, section.start), ...lines.slice(section.end)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** The page's own address: the file's Drive link at that page. */
export function pageUrl(driveUrl: string, page: number): string {
  return `${driveUrl.split('#')[0] ?? driveUrl}#page=${String(page)}`;
}

export type SourceKind = 'doc' | 'sheet' | 'slides';

const SOURCE_KIND_WORDS: Readonly<Record<SourceKind, string>> = {
  doc: 'Doc',
  sheet: 'Sheet',
  slides: 'Slides',
};

const SOURCE_KEPT: Readonly<Record<SourceKind, string>> = {
  sheet:
    'Bower keeps the first sheet only, as a table. The original, with all its sheets, stays where it was in your Drive.',
  doc: 'Bower keeps its text only. The original, with its layout, stays where it was in your Drive.',
  slides:
    'Bower keeps it as a PDF. The original, with everything you can edit, stays where it was in your Drive.',
};

/** `bowerSourceKind` as a kind, or `null` for anything else. */
export function sourceKindOf(
  file: Pick<DriveFile, 'appProperties'>,
): SourceKind | null {
  const value = file.appProperties?.bowerSourceKind;
  return value === 'doc' || value === 'sheet' || value === 'slides'
    ? value
    : null;
}

/** A copy's notice, "A copy of your Google Sheet “Flat budget”. …". */
export function copyNotice(kind: SourceKind, name: string | null): string {
  const of = name === null ? '' : ` “${name}”`;
  return `A copy of your Google ${SOURCE_KIND_WORDS[kind]}${of}. ${SOURCE_KEPT[kind]}`;
}

/** Where a copy's original opens in Drive. */
export function sourceUrl(kind: SourceKind, id: string): string {
  const base = {
    doc: 'document',
    sheet: 'spreadsheets',
    slides: 'presentation',
  }[kind];
  return `https://docs.google.com/${base}/d/${encodeURIComponent(id)}/edit`;
}

/** Where a file sits in its folder's list, and its neighbours. */
export interface Walk {
  previous: DriveFile | null;
  next: DriveFile | null;
  /** 1-based. */
  position: number;
  total: number;
}

/** `file`'s place among `items`, the folder's list in its current order; `null` when it is not there. */
export function walkOf(
  items: readonly DriveFile[],
  file: Pick<DriveFile, 'id'>,
): Walk | null {
  const at = items.findIndex((item) => item.id === file.id);
  if (at === -1) return null;
  return {
    previous: items[at - 1] ?? null,
    next: items[at + 1] ?? null,
    position: at + 1,
    total: items.length,
  };
}
