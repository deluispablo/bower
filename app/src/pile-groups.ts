/**
 * Which pile a thing came from (R-PILE-5). The confirm dialog, the tidy-up
 * sheet and Just filed group things under "From your pile: “…”", so a person
 * can tell which of their piles each file belonged to.
 *
 * The confirm dialog reads the live piles (`pileConfirm`). After the run the
 * runner has moved the files and the pile notes out of the inbox, and the
 * store forgets the piles (`prunePiles`), so the origin of each file name is
 * remembered on this device when "Yes, tidy up" is pressed
 * (`rememberPileOrigins`) and looked up by the name the file had in the
 * inbox (`pileOriginOf`). The names are the only thing kept; the person's
 * note is cut to a short line.
 */

import type { DriveFile } from './drive.js';
import type { Pile } from './pile-store.js';
import { processedKind, visiblePendingCount } from './run-progress.js';

export const PILE_ORIGINS_KEY = 'bower:pile-origins';

/** How many file names are remembered, oldest dropped first. */
export const PILE_ORIGINS_MAX = 300;

const SNIPPET_MAX = 60;

/** The first words of a pile's note on one line, cut with "…". */
export function pileSnippet(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= SNIPPET_MAX) return line;
  return `${line.slice(0, SNIPPET_MAX).trimEnd()}…`;
}

/** "From your pile: “Five job offers…”", or the no-note line. */
export function pileHeading(text: string): string {
  const snippet = pileSnippet(text);
  return snippet === ''
    ? 'From your pile: no note'
    : `From your pile: “${snippet}”`;
}

function readOrigins(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PILE_ORIGINS_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Record<string, string> = {};
    for (const [name, heading] of Object.entries(parsed)) {
      if (typeof heading === 'string') out[name] = heading;
    }
    return out;
  } catch {
    return {};
  }
}

function writeOrigins(origins: Record<string, string>): void {
  try {
    localStorage.setItem(PILE_ORIGINS_KEY, JSON.stringify(origins));
  } catch (err) {
    console.error(err);
  }
}

/** Remembers, for each file of each pile, the heading of its pile. */
export function rememberPileOrigins(piles: readonly Pile[]): void {
  if (piles.length === 0) return;
  const origins = readOrigins();
  for (const pile of piles) {
    const heading = pileHeading(pile.text);
    for (const item of pile.items) {
      // Re-inserting moves the name to the end (newest last).
      delete origins[item.name];
      origins[item.name] = heading;
    }
  }
  const names = Object.keys(origins);
  for (const name of names.slice(0, Math.max(0, names.length - PILE_ORIGINS_MAX)))
    delete origins[name];
  writeOrigins(origins);
}

/** The heading of the pile a file of this inbox name came from, if any. */
export function pileOriginOf(name: string): string | undefined {
  return readOrigins()[name];
}

/** Forgets every remembered origin (sign-out, `resetPiles`). */
export function clearPileOrigins(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PILE_ORIGINS_KEY);
  } catch (err) {
    console.error(err);
  }
}

/** One pile's row in the confirm dialog. */
export interface ConfirmPile {
  id: string;
  /** "From your pile: “…”". */
  label: string;
  /** Things of this pile in the inbox now. */
  count: number;
}

/** What the confirm dialog says about piles. */
export interface PileConfirm {
  piles: ConfirmPile[];
  /** Things in the inbox that belong to no pile (Drive, Obsidian…). */
  elsewhere: number;
}

/**
 * The piles variant of the confirm dialog: one row per pile that still has
 * things in the inbox, and how many things came from elsewhere. `undefined`
 * when no pile has anything waiting (the plain dialog then).
 */
export function pileConfirm(
  files: readonly DriveFile[],
  piles: readonly Pile[],
): PileConfirm | undefined {
  const waiting = new Set<string>();
  for (const file of files) {
    if (visiblePendingCount([file]) !== 1) continue;
    if (processedKind(file.path, undefined) === 'request') continue;
    waiting.add(file.name);
  }
  const rows: ConfirmPile[] = [];
  const claimed = new Set<string>();
  for (const pile of piles) {
    const names = pile.items
      .map((item) => item.name)
      .filter((name) => waiting.has(name) && !claimed.has(name));
    if (names.length === 0) continue;
    for (const name of names) claimed.add(name);
    rows.push({ id: pile.id, label: pileHeading(pile.text), count: names.length });
  }
  if (rows.length === 0) return undefined;
  return { piles: rows, elsewhere: waiting.size - claimed.size };
}

/** "10 things: 2 piles and 2 added from elsewhere" / "10 things in 2 piles". */
export function pileConfirmLine(total: number, confirm: PileConfirm): string {
  const things = `${total} ${total === 1 ? 'thing' : 'things'}`;
  const n = confirm.piles.length;
  const piles = `${n} ${n === 1 ? 'pile' : 'piles'}`;
  if (confirm.elsewhere === 0) return `${things} in ${piles}`;
  return `${things}: ${piles} and ${confirm.elsewhere} added from elsewhere`;
}

/** Items in first-seen group order, keyed by an origin (or none). */
export interface OriginGroup<T> {
  origin: string | undefined;
  rows: T[];
}

/**
 * Groups `rows` by the pile they came from, groups in order of first
 * appearance, rows without an origin last. A list with no origin at all is
 * one group with no heading, so callers can tell "nothing to group" apart.
 */
export function groupByOrigin<T>(
  rows: readonly T[],
  originOf: (row: T) => string | undefined,
): OriginGroup<T>[] {
  const groups = new Map<string, T[]>();
  const rest: T[] = [];
  for (const row of rows) {
    const origin = originOf(row);
    if (origin === undefined) {
      rest.push(row);
      continue;
    }
    const list = groups.get(origin);
    if (list === undefined) groups.set(origin, [row]);
    else list.push(row);
  }
  const out: OriginGroup<T>[] = [...groups].map(([origin, list]) => ({
    origin,
    rows: list,
  }));
  if (rest.length > 0) out.push({ origin: undefined, rows: rest });
  return out;
}
