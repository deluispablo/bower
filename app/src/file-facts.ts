/**
 * `.bower/file-facts.json` (issue #610): counts the runner makes without AI
 * for files whose metadata Drive does not have — a PDF's pages, an Excel
 * file's sheets, what a ZIP holds — so a file's meta line can say "42
 * pages", "3 sheets", "14 files" (boards `Phone-File-*`). The runner writes
 * it (`write_file_facts`, `agent/run.sh`); paths are relative to the Bower
 * folder. Pure parsing here plus one cached read by path, like
 * `readLastRunOutcome` in `vault-store.tsx`.
 */

import { FOLDER_MIME, getText, listFolder } from './drive.js';

/** The counts known for one file; a missing one was not counted. */
export interface FileFacts {
  pages?: number;
  sheets?: number;
  entries?: number;
}

/** Path (relative to the Bower folder) to that file's facts. */
export type FileFactsMap = ReadonlyMap<string, FileFacts>;

const FACTS_FOLDER = '.bower';
const FACTS_FILE = 'file-facts.json';

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Parses the file's text. Anything that is not the shape the runner writes
 * (malformed JSON, a wrong-typed count, an entry that is not an object) is
 * dropped, so a bad entry only costs its own fact. Never throws.
 */
export function parseFileFacts(text: string): FileFactsMap {
  const facts = new Map<string, FileFacts>();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return facts;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return facts;
  }
  for (const [path, raw] of Object.entries(data)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { pages, sheets, entries } = raw as Record<string, unknown>;
    const entry: FileFacts = {};
    if (isCount(pages)) entry.pages = pages;
    if (isCount(sheets)) entry.sheets = sheets;
    if (isCount(entries)) entry.entries = entries;
    if (Object.keys(entry).length > 0) facts.set(path, entry);
  }
  return facts;
}

const cache = new Map<string, Promise<FileFactsMap>>();

/**
 * The facts of the Bower folder `folderId`, read once and kept until
 * `clearFileFacts` (the caller clears it when the index reloads). An
 * absent file (an older runner) or a Drive failure reads as no facts: the
 * meta lines then simply omit the counts. A failure is logged, and not
 * kept, so the next call tries again.
 */
export function readFileFacts(folderId: string): Promise<FileFactsMap> {
  const kept = cache.get(folderId);
  if (kept !== undefined) return kept;
  const read = load(folderId);
  cache.set(folderId, read);
  return read;
}

/** Forgets what `readFileFacts` kept (after an index reload). */
export function clearFileFacts(): void {
  cache.clear();
}

async function load(folderId: string): Promise<FileFactsMap> {
  try {
    const root = await listFolder(folderId);
    const dot = root.find(
      (file) => file.name === FACTS_FOLDER && file.mimeType === FOLDER_MIME,
    );
    if (dot === undefined) return new Map();
    const children = await listFolder(dot.id);
    const file = children.find((child) => child.name === FACTS_FILE);
    if (file === undefined) return new Map();
    return parseFileFacts(await getText(file.id));
  } catch (err) {
    console.error(err);
    cache.delete(folderId);
    return new Map();
  }
}
