/**
 * Who put a file or a note in its folder (issue #349): the origin a folder
 * screen shows under each row ("PDF · filed by Bower"). This module is the
 * app side of the contract; whatever writes an origin (the agent's
 * `index.md` rows for files, #369, or the app itself later) follows it.
 * Pure: no Drive calls, unit-tested in `file-origin.test.ts`.
 *
 * Where the origin comes from, first answer wins:
 *
 * 1. The file's Drive `appProperties`: key `bowerOrigin` (`ORIGIN_APP_PROPERTY`),
 *    value one of the `Origin` keys (`filed`, `yours`, `asked`, `drive`).
 *    Drive keeps these private to the app's OAuth client, so only Bower
 *    itself can set them.
 * 2. A row in `index.md` (the catalogue at the top of the Bower folder): one
 *    list item whose first thing is a wikilink to the file, then fields
 *    separated by ` · `, for example
 *
 *        - [[1-Projects/Flat hunt/Lease agreement 2026.pdf]] · PDF · filed by Bower
 *
 *    The link is the path from the top of the Bower folder, extension
 *    included for anything that is not a note (a note's `.md` may be left
 *    out; a bare name with no `/` matches by name, the way Obsidian resolves
 *    it). Any field that is an `Origin` key or its label (`ORIGIN_LABELS`,
 *    any letter case) is the origin; every other field (the type, a short
 *    description) is for people reading the catalogue and ignored here. A
 *    line with no such field says nothing about the origin.
 * 3. Neither: `ORIGIN_FALLBACK`, a neutral "in this folder".
 */

import type { DriveFile } from './drive.js';
import { FILE_KIND_LABELS, fileKind } from './vault-index.js';

export type Origin = 'filed' | 'yours' | 'asked' | 'drive';

/** The Drive app property that carries a file's `Origin`. */
export const ORIGIN_APP_PROPERTY = 'bowerOrigin';

/** What each origin reads as on a folder screen (lower case, mid-sentence). */
export const ORIGIN_LABELS: Readonly<Record<Origin, string>> = {
  filed: 'filed by Bower',
  yours: 'your note',
  asked: 'Bower wrote it when you asked',
  drive: 'from your Drive, as Markdown',
};

/** Shown when neither the file nor `index.md` says who put it there. */
export const ORIGIN_FALLBACK = 'in this folder';

/** `index.md`'s path from the top of the Bower folder. */
export const CATALOGUE_PATH = 'index.md';

const BY_WORD: ReadonlyMap<string, Origin> = new Map(
  (Object.entries(ORIGIN_LABELS) as [Origin, string][]).flatMap(
    ([origin, label]): [string, Origin][] => [
      [origin, origin],
      [label.toLowerCase(), origin],
    ],
  ),
);

/** `value` as an `Origin`, or `null` when it is none of the keys or labels. */
export function parseOrigin(value: string): Origin | null {
  return BY_WORD.get(value.trim().toLowerCase()) ?? null;
}

/** A list item starting with a wikilink: `- [[target|alias]] rest`. */
const ROW = /^\s*[-*+]\s+\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\](.*)$/;

/**
 * Every origin `index.md`'s text states, keyed by the row's link target,
 * lower-cased and trimmed. Lines that are not a wikilink list item, or carry
 * no origin field, are skipped. The first row for a target wins.
 */
export function parseCatalogueOrigins(text: string): Map<string, Origin> {
  const origins = new Map<string, Origin>();
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = ROW.exec(line);
    const target = match?.[1]?.trim().toLowerCase();
    if (target === undefined || target === '' || origins.has(target)) continue;
    const fields = (match?.[2] ?? '').split('·').slice(1);
    for (const field of fields) {
      const origin = parseOrigin(field);
      if (origin !== null) {
        origins.set(target, origin);
        break;
      }
    }
  }
  return origins;
}

/** The link targets a catalogue row could use for `file`, most exact first. */
function targetsFor(file: Pick<DriveFile, 'name' | 'path'>): string[] {
  const path = file.path.toLowerCase();
  const name = file.name.toLowerCase();
  const targets = [path];
  if (path.endsWith('.md')) targets.push(path.slice(0, -3));
  targets.push(name);
  if (name.endsWith('.md')) targets.push(name.slice(0, -3));
  return targets;
}

/**
 * `file`'s origin: its `bowerOrigin` app property when that is a known
 * value, else its row in the catalogue (`parseCatalogueOrigins`), else
 * `null`.
 */
export function originOf(
  file: Pick<DriveFile, 'name' | 'path' | 'appProperties'>,
  catalogue: ReadonlyMap<string, Origin>,
): Origin | null {
  const fromDrive = file.appProperties?.[ORIGIN_APP_PROPERTY];
  if (fromDrive !== undefined) {
    const origin = parseOrigin(fromDrive);
    if (origin !== null) return origin;
  }
  for (const target of targetsFor(file)) {
    const origin = catalogue.get(target);
    if (origin !== undefined) return origin;
  }
  return null;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The line under a folder row's title. A file with a known origin: its
 * type and origin ("PDF · filed by Bower"). A note with a known origin:
 * the origin alone, which already says it is a note ("Your note", "Bower
 * wrote it when you asked"). Neither has one (#502): just the type ("PDF",
 * "Note") — `ORIGIN_FALLBACK`'s "in this folder" said nothing a folder row
 * doesn't already say by being there.
 */
export function originLine(
  file: Pick<DriveFile, 'name' | 'mimeType'>,
  origin: Origin | null,
): string {
  const kind = fileKind(file);
  if (origin === null) return FILE_KIND_LABELS[kind];
  if (kind === 'note') return capitalise(ORIGIN_LABELS[origin]);
  return `${FILE_KIND_LABELS[kind]} · ${ORIGIN_LABELS[origin]}`;
}
