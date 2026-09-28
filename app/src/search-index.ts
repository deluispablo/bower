/**
 * The local search index (#592, spec R-SEARCH-1 to R-SEARCH-3): one
 * MiniSearch index over every visible folder, note and file, matching on
 * name (a note's display title), path (display names), kind word and, for
 * notes read before, their text. Prefix matching everywhere; typo
 * tolerance (edit distance 1) for terms of four or more letters.
 *
 * The index is serialised into the `searchIndex` store (`cache.ts`) and
 * updated incrementally when the vault index changes (`syncSearchIndex`).
 * Everything except `persistSearchIndex` / `restoreSearchIndex` is pure and
 * unit-tested directly; the screens (#593, #594) only render what
 * `searchVault` returns.
 */

import MiniSearch from 'minisearch';
import type { SearchResult } from 'minisearch';

import { loadSearchIndex, saveSearchIndex } from './cache.js';
import type { DriveFile } from './drive.js';
import { FOLDER_MIME } from './drive.js';
import { displayName, paraKindOf } from './navigation.js';
import type { ParaKind } from './navigation.js';
import { noteTitle } from './note-title.js';
import { snippet, toPlainWords } from './search.js';
import {
  FILE_KIND_LABELS,
  fileKind,
  fileTitle,
  isAppFile,
  kindBadge,
} from './vault-index.js';
import type { VaultIndex } from './vault-index.js';

/** Which result group a hit belongs to. */
export type HitKind = 'folder' | 'note' | 'file';

/** A matched stretch of a title: `[start, end)` offsets. */
export interface TitleSpan {
  start: number;
  end: number;
}

/** One step of a hit's location, with the PARA kind of its top folder. */
export interface PathSegment {
  name: string;
  /** The landmark the path starts in (Projects, Areas...), or `null`. */
  para: ParaKind | null;
}

export interface SearchHit {
  kind: HitKind;
  file: DriveFile;
  /** Display title: a note's title, a file's name without extension. */
  title: string;
  /** Where the query matches `title`, in order, never overlapping. */
  highlights: TitleSpan[];
  /** The folders above the hit, numeric prefixes removed. */
  path: PathSegment[];
  /** `path` joined with " › ". */
  pathText: string;
  /** "Folder", "Note", "PDF", "Photo"... */
  kindWord: string;
  /** The short badge for the row ("PDF", "JPG", "MD"); empty for a folder. */
  badge: string;
  /** Text around the match, for a hit found in a note's text. */
  snippet: string | null;
  score: number;
}

export interface SearchResults {
  folders: SearchHit[];
  notes: SearchHit[];
  files: SearchHit[];
  /**
   * True when the top hit needed typo tolerance (some word of the query
   * matched only approximately): the screens then show the hint "Close
   * enough counts: “flat hnt” finds Flat hunt."
   */
  fuzzy: boolean;
}

export interface SearchOptions {
  /** A folder path (relative to the Bower folder): only hits inside it. */
  scope?: string;
  /** Only these groups. */
  kinds?: readonly HitKind[];
  /** Epoch milliseconds: only hits modified at or after this time. */
  since?: number;
  /** Keep Bower's own files (`CLAUDE.md`, reports...) in. Off by default. */
  showAppFiles?: boolean;
}

// --- Display paths ------------------------------------------------------

/**
 * The folders of `path` (its last segment, the name itself, dropped when
 * `dropLast`) as display names with their PARA kind: "1-Projects/Flat
 * hunt" → Projects › Flat hunt. Never a numeric prefix, never a `/`.
 */
export function pathSegments(path: string, dropLast: boolean): PathSegment[] {
  const parts = path.split('/').filter(Boolean);
  const folders = dropLast ? parts.slice(0, -1) : parts;
  const top = folders[0];
  const para = top === undefined ? null : paraKindOf(top);
  return folders.map((name) => ({ name: displayName(name), para }));
}

/** `segments` as one line: "Projects › Flat hunt". */
export function formatPath(segments: readonly PathSegment[]): string {
  return segments.map((segment) => segment.name).join(' › ');
}

// --- Documents ----------------------------------------------------------

/** What MiniSearch indexes (and stores) for one folder, note or file. */
interface IndexDoc {
  id: string;
  title: string;
  path: string;
  kindWord: string;
  text: string;
  /** Stored only: the group. */
  kind: HitKind;
  /** Stored only: changes whenever the document needs re-indexing. */
  sig: string;
}

/** A note's text kept for snippets is cut here; a snippet needs little. */
const TEXT_LIMIT = 8000;

function hitKindOf(file: DriveFile): HitKind {
  if (file.mimeType === FOLDER_MIME) return 'folder';
  return fileKind(file) === 'note' ? 'note' : 'file';
}

function kindWordOf(file: DriveFile, kind: HitKind): string {
  if (kind === 'folder') return 'Folder';
  return FILE_KIND_LABELS[fileKind(file)];
}

function titleOf(
  file: DriveFile,
  kind: HitKind,
  text: string | undefined,
): string {
  if (kind === 'folder') return displayName(file.name);
  if (kind === 'note') return noteTitle(file, text);
  return fileTitle(file.name);
}

function docFor(file: DriveFile, rawText: string | undefined): IndexDoc {
  const kind = hitKindOf(file);
  const text =
    kind === 'note' && rawText !== undefined
      ? toPlainWords(rawText).slice(0, TEXT_LIMIT)
      : '';
  const title = titleOf(file, kind, rawText);
  const path = formatPath(pathSegments(file.path, true));
  const kindWord = kindWordOf(file, kind);
  const sig = [
    title,
    path,
    kindWord,
    file.modifiedTime ?? '',
    text.length,
  ].join('\u0001');
  return { id: file.id, title, path, kindWord, text, kind, sig };
}

// --- The index ----------------------------------------------------------

/** Lower-case and drop accents, so "cafe" finds "Café". */
function fold(term: string): string {
  return term.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Typo tolerance: one edit, for terms of three or more letters ("flat hnt" finds Flat hunt). */
function fuzzyFor(term: string): number | false {
  return term.length >= 3 ? 1 : false;
}

const OPTIONS = {
  fields: ['title', 'path', 'kindWord', 'text'],
  storeFields: ['title', 'kind', 'sig', 'text'],
  processTerm: (term: string): string => fold(term),
  searchOptions: {
    prefix: true,
    fuzzy: fuzzyFor,
    combineWith: 'AND',
    boost: { title: 4, path: 1.5, kindWord: 1, text: 0.6 },
  },
} as const;

export interface SearchIndexHandle {
  ms: MiniSearch<IndexDoc>;
  /** Ids currently indexed (not discarded). */
  ids: Set<string>;
}

function newMiniSearch(): MiniSearch<IndexDoc> {
  return new MiniSearch<IndexDoc>({
    fields: [...OPTIONS.fields],
    storeFields: [...OPTIONS.storeFields],
    processTerm: OPTIONS.processTerm,
    searchOptions: {
      ...OPTIONS.searchOptions,
      boost: { ...OPTIONS.searchOptions.boost },
    },
  });
}

/** Note text already read, by file id (the caller's cache). */
export type NoteTexts = ReadonlyMap<string, string>;

/** An empty index. */
export function createSearchIndex(): SearchIndexHandle {
  return { ms: newMiniSearch(), ids: new Set() };
}

/**
 * Brings `handle` in step with `vault`: adds what is new, re-indexes what
 * changed (renamed, moved, edited, text read since), drops what is gone.
 * Cheap when nothing changed: one signature compare per file. Returns how
 * many documents were added or replaced and removed.
 */
export function syncSearchIndex(
  handle: SearchIndexHandle,
  vault: VaultIndex,
  texts: NoteTexts = new Map(),
): { updated: number; removed: number } {
  const { ms } = handle;
  let updated = 0;
  const seen = new Set<string>();
  const files = [...vault.folders, ...vault.notes, ...vault.files];
  for (const file of files) {
    seen.add(file.id);
    const doc = docFor(file, texts.get(file.id));
    if (handle.ids.has(file.id)) {
      if (ms.getStoredFields(file.id)?.sig === doc.sig) continue;
      ms.replace(doc);
    } else {
      ms.add(doc);
      handle.ids.add(file.id);
    }
    updated += 1;
  }
  const gone: string[] = [];
  for (const id of handle.ids) if (!seen.has(id)) gone.push(id);
  for (const id of gone) {
    ms.discard(id);
    handle.ids.delete(id);
  }
  return { updated, removed: gone.length };
}

/** A fresh index over `vault` (and the note text read so far). */
export function buildSearchIndex(
  vault: VaultIndex,
  texts: NoteTexts = new Map(),
): SearchIndexHandle {
  const handle = createSearchIndex();
  syncSearchIndex(handle, vault, texts);
  return handle;
}

// --- Persistence --------------------------------------------------------

const FORMAT = 1;

/** `handle` as the string kept in the `searchIndex` store. */
export function serialiseSearchIndex(handle: SearchIndexHandle): string {
  return JSON.stringify({ format: FORMAT, index: handle.ms.toJSON() });
}

/** The index in `json`, or `undefined` when it is unusable (then rebuild). */
export function deserialiseSearchIndex(
  json: string,
): SearchIndexHandle | undefined {
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { format?: unknown }).format !== FORMAT
    ) {
      return undefined;
    }
    const plain = (parsed as { index: Parameters<typeof MiniSearch.loadJS>[0] })
      .index;
    const ms = MiniSearch.loadJS<IndexDoc>(plain, {
      fields: [...OPTIONS.fields],
      storeFields: [...OPTIONS.storeFields],
      processTerm: OPTIONS.processTerm,
      searchOptions: {
        ...OPTIONS.searchOptions,
        boost: { ...OPTIONS.searchOptions.boost },
      },
    });
    const ids = new Set<string>();
    for (const id of Object.values(plain.documentIds)) ids.add(String(id));
    return { ms, ids };
  } catch (error) {
    console.error('The saved search index could not be read', error);
    return undefined;
  }
}

/** Saves `handle` in IndexedDB. */
export async function persistSearchIndex(
  handle: SearchIndexHandle,
): Promise<void> {
  await saveSearchIndex({
    json: serialiseSearchIndex(handle),
    builtAt: new Date().toISOString(),
  });
}

/** The saved index, or `undefined` when there is none or it is unreadable. */
export async function restoreSearchIndex(): Promise<
  SearchIndexHandle | undefined
> {
  const entry = await loadSearchIndex();
  return entry === undefined ? undefined : deserialiseSearchIndex(entry.json);
}

// --- Searching ----------------------------------------------------------

const WORD = /[\p{L}\p{N}]+/gu;

function tokensOf(query: string): string[] {
  return (query.match(WORD) ?? []).map(fold);
}

/** Whether `a` and `b` are at most one insertion, deletion or swap-free substitution apart. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.slice(i) === long.slice(i + 1);
}

interface Word {
  start: number;
  end: number;
  folded: string;
}

function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  for (const match of text.matchAll(WORD)) {
    const start = match.index;
    words.push({ start, end: start + match[0].length, folded: fold(match[0]) });
  }
  return words;
}

/** Whether a title word (or any word in `words`) stands in for `token`. */
function matchWord(token: string, words: readonly Word[]): Word | null {
  const prefix = words.find((word) => word.folded.startsWith(token));
  if (prefix !== undefined) return prefix;
  if (token.length < 3) return null;
  return words.find((word) => withinOneEdit(token, word.folded)) ?? null;
}

function highlightsFor(title: string, tokens: readonly string[]): TitleSpan[] {
  const words = wordsOf(title);
  const spans: TitleSpan[] = [];
  for (const token of tokens) {
    const exact = words.find((word) => word.folded.startsWith(token));
    if (exact !== undefined) {
      spans.push({ start: exact.start, end: exact.start + token.length });
      continue;
    }
    const near = matchWord(token, words);
    if (near !== null) spans.push({ start: near.start, end: near.end });
  }
  spans.sort((a, b) => a.start - b.start);
  const merged: TitleSpan[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/**
 * True when some word of the query is not an exact or prefix match for
 * anything the hit's index terms hold, yet is one typo away from a word of
 * the hit: that word needed the tolerance.
 */
function needsTolerance(
  tokens: readonly string[],
  result: SearchResult,
  doc: IndexDoc,
): boolean {
  const words = [
    ...result.terms.map((term) => ({ start: 0, end: 0, folded: term })),
    ...wordsOf(`${doc.title} ${doc.path}`),
  ];
  return tokens.some((token) => {
    if (result.terms.some((term) => term.startsWith(token))) return false;
    if (token.length < 3) return false;
    return words.some((word) => withinOneEdit(token, word.folded));
  });
}

function inScope(file: DriveFile, scope: string | undefined): boolean {
  if (scope === undefined || scope === '') return true;
  return file.path.startsWith(`${scope}/`);
}

function passes(
  file: DriveFile,
  kind: HitKind,
  options: SearchOptions,
): boolean {
  if (options.kinds !== undefined && !options.kinds.includes(kind))
    return false;
  if (!inScope(file, options.scope)) return false;
  if (options.showAppFiles !== true && isAppFile(file.path, file.name)) {
    return false;
  }
  if (options.since !== undefined) {
    const modified =
      file.modifiedTime === undefined ? NaN : Date.parse(file.modifiedTime);
    if (!(modified >= options.since)) return false;
  }
  return true;
}

function hitFor(
  file: DriveFile,
  doc: { title: string; text: string },
  tokens: readonly string[],
  terms: readonly string[],
  hasTextMatch: boolean,
  score: number,
): SearchHit {
  const kind = hitKindOf(file);
  const path = pathSegments(file.path, true);
  let found: string | null = null;
  if (hasTextMatch && doc.text !== '') {
    for (const candidate of [...tokens, ...terms]) {
      found = snippet(doc.text, candidate);
      if (found !== null) break;
    }
  }
  return {
    kind,
    file,
    title: doc.title,
    highlights: highlightsFor(doc.title, tokens),
    path,
    pathText: formatPath(path),
    kindWord: kindWordOf(file, kind),
    badge: kind === 'folder' ? '' : kindBadge(fileKind(file), file),
    snippet: found,
    score,
  };
}

function emptyResults(): SearchResults {
  return { folders: [], notes: [], files: [], fuzzy: false };
}

function push(results: SearchResults, hit: SearchHit): void {
  if (hit.kind === 'folder') results.folders.push(hit);
  else if (hit.kind === 'note') results.notes.push(hit);
  else results.files.push(hit);
}

/**
 * Searches `handle` (kept in step with `vault`): folders, notes and files
 * matching `query`, best first in each group. A blank query finds nothing.
 * Hits no longer in `vault` and Bower's own files are left out.
 */
export function searchVault(
  handle: SearchIndexHandle,
  vault: VaultIndex,
  query: string,
  options: SearchOptions = {},
): SearchResults {
  const results = emptyResults();
  const tokens = tokensOf(query);
  if (tokens.length === 0) return results;

  let first = true;
  for (const result of handle.ms.search(tokens.join(' '))) {
    const file = vault.byId.get(String(result.id));
    if (file === undefined) continue;
    const kind = hitKindOf(file);
    if (!passes(file, kind, options)) continue;
    const doc = {
      title: String(result.title ?? ''),
      text: typeof result.text === 'string' ? result.text : '',
    };
    const hasTextMatch = Object.values(result.match).some((fields) =>
      fields.includes('text'),
    );
    if (first) {
      first = false;
      results.fuzzy = needsTolerance(tokens, result, {
        id: file.id,
        title: doc.title,
        path: formatPath(pathSegments(file.path, true)),
        kindWord: '',
        text: '',
        kind,
        sig: '',
      });
    }
    push(
      results,
      hitFor(file, doc, tokens, result.terms, hasTextMatch, result.score),
    );
  }
  return results;
}

/**
 * `results` with Drive's full-text hits added after the local ones: only
 * files in `vault` (so hidden and processed files never appear), passing
 * the same `options`, and none already found locally. Their text was not
 * read, so they carry no snippet unless `snippets` has one.
 */
export function mergeFullText(
  results: SearchResults,
  driveFiles: readonly DriveFile[],
  vault: VaultIndex,
  query: string,
  options: SearchOptions = {},
  snippets: ReadonlyMap<string, string | null> = new Map(),
): SearchResults {
  const merged: SearchResults = {
    folders: [...results.folders],
    notes: [...results.notes],
    files: [...results.files],
    fuzzy: results.fuzzy,
  };
  const seen = new Set(
    [...merged.folders, ...merged.notes, ...merged.files].map(
      (hit) => hit.file.id,
    ),
  );
  const tokens = tokensOf(query);
  for (const found of driveFiles) {
    if (seen.has(found.id)) continue;
    const file = vault.byId.get(found.id);
    if (file === undefined) continue;
    const kind = hitKindOf(file);
    if (!passes(file, kind, options)) continue;
    seen.add(file.id);
    const hit = hitFor(
      file,
      { title: titleOf(file, kind, undefined), text: '' },
      tokens,
      [],
      false,
      0,
    );
    hit.snippet = snippets.get(file.id) ?? null;
    push(merged, hit);
  }
  return merged;
}
