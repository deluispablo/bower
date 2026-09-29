/**
 * Lazy note metadata for folder rows and grid tiles (#582, spec R-DATA-2):
 * the frontmatter facts a row shows (kind, key facts, status, origins)
 * without fetching every note on every render. `loadNoteMeta` reads one
 * note's text once, keeps only its frontmatter, and caches that in IndexedDB
 * (`noteMeta` store) keyed by the note id and invalidated by `modifiedTime`.
 * Note bodies are never stored here.
 */

import { loadNoteMetaEntry, saveNoteMetaEntry } from './cache.js';
import { getText } from './drive.js';
import type { DriveFile } from './drive.js';
import { parseFrontmatter } from './markdown/frontmatter.js';

export type NoteOrigin = 'file' | 'notes' | 'web' | 'you';

const ORIGINS: readonly string[] = ['file', 'notes', 'web', 'you'];

/** The `{ field: origin }` map out of `bower_origins`; unknown origins and
 * anything that is not a map are dropped. */
function originMap(value: unknown): Record<string, NoteOrigin> {
  const out: Record<string, NoteOrigin> = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return out;
  }
  for (const [field, origin] of Object.entries(value)) {
    if (typeof origin === 'string' && ORIGINS.includes(origin)) {
      out[field] = origin as NoteOrigin;
    }
  }
  return out;
}

export interface NoteMeta {
  /** The note's kind id (`kinds.ts`), when the frontmatter names one. */
  kind?: string;
  /** Every frontmatter field, raw, for `keyFactsFor`. */
  fields: Record<string, unknown>;
  status?: string;
  /** Where each field came from: `bower_origins`, a field-to-origin map
   * (spec R-AG-2). A field with no entry came from the document (`file`). */
  bowerOrigins: Readonly<Record<string, NoteOrigin>>;
  /** Fields Bower could not find in the source: `not_stated`. */
  not_stated: string[];
  /** The original file this note was made from (`original`). */
  original?: string;
  /** An answer's type (`type`). */
  type?: string;
  /** A document's page count (`pages`). */
  pages?: number;
}

interface NoteMetaEntry {
  /** The Drive `modifiedTime` the frontmatter was read at, `''` if unknown. */
  modifiedTime: string;
  meta: NoteMeta;
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function list(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const item of items) {
    const entry = text(item);
    if (entry !== undefined && !out.includes(entry)) out.push(entry);
  }
  return out;
}

/** The metadata `NoteMeta` names, out of a note's frontmatter data. Pure. */
export function noteMetaFrom(data: Record<string, unknown>): NoteMeta {
  const meta: NoteMeta = {
    fields: data,
    bowerOrigins: originMap(data.bower_origins),
    not_stated: list(data.not_stated),
  };
  const kind = text(data.kind);
  if (kind !== undefined) meta.kind = kind;
  const status = text(data.status);
  if (status !== undefined) meta.status = status;
  const original = text(data.original);
  if (original !== undefined) meta.original = original;
  const type = text(data.type);
  if (type !== undefined) meta.type = type;
  const pages = Number(data.pages);
  if (data.pages !== undefined && data.pages !== '' && Number.isFinite(pages)) {
    meta.pages = pages;
  }
  return meta;
}

/**
 * The note's frontmatter facts. Served from IndexedDB when the cached copy
 * was read at the file's current `modifiedTime`; otherwise the note is read
 * once from Drive and the result cached. A file with no `modifiedTime` is
 * always re-read, since nothing can say the cached copy is still current.
 */
export async function loadNoteMeta(
  file: Pick<DriveFile, 'id' | 'modifiedTime'>,
): Promise<NoteMeta> {
  const modifiedTime = file.modifiedTime ?? '';
  const cached = await loadNoteMetaEntry<NoteMetaEntry>(file.id);
  if (
    cached !== undefined &&
    modifiedTime !== '' &&
    cached.modifiedTime === modifiedTime
  ) {
    return cached.meta;
  }

  const meta = noteMetaFrom(parseFrontmatter(await getText(file.id)).data);
  await saveNoteMetaEntry(file.id, {
    modifiedTime,
    meta,
  } satisfies NoteMetaEntry);
  return meta;
}

/**
 * Writes a note's new frontmatter through to the cache after Bower saved it
 * (`text` is the text just written, `modifiedTime` the one Drive returned),
 * so the next `loadNoteMeta` at that `modifiedTime` needs no Drive read.
 * With no `modifiedTime` the entry is stored as unknown (`''`), which
 * `loadNoteMeta` never trusts, so the next read goes to Drive.
 */
export async function recordNoteMeta(
  id: string,
  modifiedTime: string | undefined,
  text: string,
): Promise<void> {
  await saveNoteMetaEntry(id, {
    modifiedTime: modifiedTime ?? '',
    meta: noteMetaFrom(parseFrontmatter(text).data),
  } satisfies NoteMetaEntry);
}
