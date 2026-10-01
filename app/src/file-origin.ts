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
import { dayWords } from './meta-line.js';
import type { DateInput } from './meta-line.js';
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

/** What `filedBy` reads of a file: its name, kind and times. */
export interface FiledSource extends Pick<DriveFile, 'name' | 'mimeType'> {
  modifiedTime?: string | undefined;
  /** Drive's created time, when the listing asked for it. */
  createdTime?: string | undefined;
  /** When the run that filed it finished (run history), when known. */
  filedAt?: string | undefined;
}

/** Who filed a file and when (R-API-3), in the words the screens use. */
export interface FiledFacts {
  /** Bower filed or wrote it, the person added it, or nobody says. */
  by: 'bower' | 'you' | null;
  /** When, ISO; `null` when the file carries no time at all. */
  at: string | null;
  /** The meta line's part: "filed by Bower yesterday", "added by you
   * 29 Sep", or, with no known origin, "added 29 Sep". */
  line: string;
  /** About's "Filed" row value: "yesterday, by Bower, as it is",
   * "29 Sep, by you", or just "29 Sep". */
  about: string;
}

/**
 * Who filed `file` and when (R-API-3, FI-About-375). `origin` is `originOf`
 * the file. Bower's time is the run's (`filedAt`) when known, else Drive's
 * created time, else the last change. A file filed before report v2 has no
 * origin: it reads "added <when>" from Drive's created time. An original
 * Bower filed unchanged adds "as it is" in About.
 */
export function filedBy(
  file: FiledSource,
  origin: Origin | null,
  now: DateInput,
): FiledFacts {
  const by =
    origin === 'filed' || origin === 'asked'
      ? 'bower'
      : origin === null
        ? null
        : 'you';
  const at =
    (by === 'bower' ? file.filedAt : undefined) ??
    file.createdTime ??
    file.modifiedTime ??
    null;
  const when = at === null ? '' : dayWords(at, now);
  const join = (...parts: string[]): string =>
    parts.filter((part) => part !== '').join(' ');
  if (by === 'bower') {
    const asItIs = origin === 'filed' && fileKind(file) !== 'note';
    return {
      by,
      at,
      line: join('filed by Bower', when),
      about: [when, 'by Bower', asItIs ? 'as it is' : '']
        .filter((part) => part !== '')
        .join(', '),
    };
  }
  if (by === 'you') {
    return {
      by,
      at,
      line: join('added by you', when),
      about: [when, 'by you'].filter((part) => part !== '').join(', '),
    };
  }
  return { by, at, line: join('added', when), about: when };
}

/** What `filedHistory` reads of a finished run (`api.ts#Run`). */
export interface HistoryRun {
  state: string;
  finishedAt?: string | undefined;
  items?: readonly { path: string; to?: string | undefined }[] | undefined;
}

/**
 * When each file a run filed was filed, by its path from the top of the
 * Bower folder (R-API-3, #922), from the run history (`GET /runs`): every
 * finished run's items that say where they ended up (`to`, report v2) map
 * to that run's `finishedAt`; the newest run wins. A run reported before
 * report v2 has no `to` and adds nothing, so its files fall back to
 * Drive's created time ("added <when>").
 */
export function filedHistory(
  runs: readonly HistoryRun[],
): ReadonlyMap<string, string> {
  const at = new Map<string, string>();
  for (const run of runs) {
    if (run.state !== 'done' || run.finishedAt === undefined) continue;
    const finished = run.finishedAt;
    for (const item of run.items ?? []) {
      if (item.to === undefined || item.to === '') continue;
      const known = at.get(item.to);
      if (known === undefined || Date.parse(finished) > Date.parse(known)) {
        at.set(item.to, finished);
      }
    }
  }
  return at;
}

/**
 * `file` and its origin with the run history applied (#922): a file the
 * history names was filed by Bower at that run's end, unless the file or
 * the catalogue already says the person put it there. Pass the result to
 * `filedBy`.
 */
export function withHistory<T extends FiledSource & Pick<DriveFile, 'path'>>(
  file: T,
  origin: Origin | null,
  history: ReadonlyMap<string, string>,
): { file: T; origin: Origin | null } {
  const filedAt = history.get(file.path);
  if (filedAt === undefined) return { file, origin };
  const known = origin ?? 'filed';
  if (known !== 'filed' && known !== 'asked') return { file, origin: known };
  // Moving a file keeps Drive's times, so an original Bower filed reads its
  // run's time. A file changed since (a note a later run updated) keeps
  // reading its own last change, as the demo's contract does.
  const changed = Date.parse(file.modifiedTime ?? '');
  if (!Number.isNaN(changed) && changed >= Date.parse(filedAt)) {
    return { file, origin: known };
  }
  return { file: { ...file, filedAt }, origin: known };
}
