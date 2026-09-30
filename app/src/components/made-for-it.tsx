/**
 * "Made for it" on a note (issue #792, spec §6.18 R-VERDICT-3): the notes
 * Bower wrote for this item (a tailored CV, a letter) as buttons. Only those
 * notes carry `made_for: "[[<item>]]"`; the item itself stores nothing, so
 * the list is worked out from the notes the app already indexes. R-AG-4 names
 * them "CV · {employer}" and "Letter · {employer}".
 */

import type { JSX } from 'preact';

import type { DriveFile } from '../drive.js';
import { parseWikilink } from '../markdown/wikilinks.js';
import type { NoteMeta } from '../note-meta.js';
import { IconNote } from './icons.js';

import '../styles/made-for-it.css';

/** The notes R-AG-4 names "CV · {employer}" and "Letter · {employer}". */
export function isMadeForName(name: string): boolean {
  return /^(CV|Letter) · /i.test(name);
}

export interface MadeForNote {
  id: string;
  /** The note's name without `.md`. */
  name: string;
}

export interface MadeForCandidate {
  file: Pick<DriveFile, 'id' | 'name' | 'path'>;
  meta: NoteMeta;
}

function baseName(target: string): string {
  const last = target.split('/').pop() ?? target;
  return last
    .replace(/\.md$/i, '')
    .trim()
    .toLowerCase();
}

/**
 * The notes whose `made_for` points at `item` (by note name, or by its
 * title), CVs first, then letters, then the rest, each group in name order.
 * Pure.
 */
export function madeForItem(
  item: { path: string; title?: string },
  candidates: readonly MadeForCandidate[],
): MadeForNote[] {
  const wanted = new Set<string>([baseName(item.path)]);
  if (item.title !== undefined) wanted.add(baseName(item.title));
  const found: MadeForNote[] = [];
  for (const { file, meta } of candidates) {
    if (file.path === item.path) continue;
    const raw = meta.fields.made_for;
    const values: unknown[] = Array.isArray(raw) ? raw : [raw];
    const points = values.some(
      (value) =>
        typeof value === 'string' &&
        wanted.has(baseName(parseWikilink(value).target)),
    );
    if (!points) continue;
    found.push({ id: file.id, name: file.name.replace(/\.md$/i, '') });
  }
  const rank = (note: MadeForNote): number =>
    /^CV · /i.test(note.name) ? 0 : /^Letter · /i.test(note.name) ? 1 : 2;
  return found.sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
}

export interface MadeForItProps {
  notes: readonly MadeForNote[];
}

export function MadeForIt({ notes }: MadeForItProps): JSX.Element | null {
  if (notes.length === 0) return null;
  return (
    <div class="made-for-it">
      <span class="made-for-it-label" id="made-for-it-label">
        Made for it:
      </span>
      <ul class="made-for-it-list" aria-labelledby="made-for-it-label">
        {notes.map((note) => (
          <li key={note.id}>
            <a class="made-for-it-note" href={`/note/${note.id}`}>
              <IconNote />
              <span>{note.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
