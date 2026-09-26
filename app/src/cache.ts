/**
 * IndexedDB cache for the vault, via `idb-keyval` (a single object store,
 * no schema to hand-write). Three kinds of entry share one store:
 *
 * - `index`: the last `listVault` result.
 * - `note:<id>`: one note's text, keyed by the file id.
 * - `blob:<id>`: one file's bytes, keyed by the file id.
 * - `blob-lru`: the recency order of every cached blob, for eviction.
 *
 * Blobs are capped at `BLOB_CACHE_CAP_BYTES` total; `saveBlob` evicts the
 * least recently used entries first. `evictPlan` is the pure decision so it
 * can be unit-tested without IndexedDB.
 */

import { clear, del, get, set } from 'idb-keyval';

import type { DriveFile } from './drive.js';

export const BLOB_CACHE_CAP_BYTES = 50 * 1024 * 1024;

const INDEX_KEY = 'index';
const BLOB_LRU_KEY = 'blob-lru';

function noteKey(id: string): string {
  return `note:${id}`;
}

function blobKey(id: string): string {
  return `blob:${id}`;
}

export interface IndexCacheEntry {
  files: DriveFile[];
  /** ISO timestamp of when this listing was fetched. */
  fetchedAt: string;
}

export interface NoteCacheEntry {
  text: string;
  /** The Drive file's `modifiedTime` this text was fetched at, `''` if unknown. */
  modifiedTime: string;
  /** ISO timestamp of when this text was fetched. */
  fetchedAt: string;
}

export interface BlobCacheEntry {
  blob: Blob;
  size: number;
  /** Epoch ms, bumped on every read and write. */
  lastUsed: number;
}

export interface BlobLruEntry {
  id: string;
  size: number;
  lastUsed: number;
}

// --- Index -------------------------------------------------------------

export async function loadIndex(): Promise<IndexCacheEntry | undefined> {
  return get(INDEX_KEY);
}

export async function saveIndex(
  files: DriveFile[],
  fetchedAt: string,
): Promise<void> {
  const entry: IndexCacheEntry = { files, fetchedAt };
  await set(INDEX_KEY, entry);
}

/** Drops the cached index so the next load re-fetches from Drive. */
export async function invalidateIndex(): Promise<void> {
  await del(INDEX_KEY);
}

// --- Notes ---------------------------------------------------------------

export async function loadNote(
  id: string,
): Promise<NoteCacheEntry | undefined> {
  return get(noteKey(id));
}

export async function saveNote(
  id: string,
  text: string,
  modifiedTime: string,
  fetchedAt: string,
): Promise<void> {
  const entry: NoteCacheEntry = { text, modifiedTime, fetchedAt };
  await set(noteKey(id), entry);
}

// --- Blobs (LRU) -----------------------------------------------------------

async function loadLru(): Promise<BlobLruEntry[]> {
  return (await get<BlobLruEntry[]>(BLOB_LRU_KEY)) ?? [];
}

async function saveLru(entries: BlobLruEntry[]): Promise<void> {
  await set(BLOB_LRU_KEY, entries);
}

/**
 * Which ids to drop, oldest `lastUsed` first, so the rest fit under `cap`
 * bytes. Pure: takes the full LRU list (including whatever was just added)
 * and returns eviction candidates without touching IndexedDB.
 */
export function evictPlan(entries: BlobLruEntry[], cap: number): string[] {
  const ordered = [...entries].sort((a, b) => a.lastUsed - b.lastUsed);
  let total = ordered.reduce((sum, entry) => sum + entry.size, 0);
  const evict: string[] = [];
  for (const entry of ordered) {
    if (total <= cap) break;
    evict.push(entry.id);
    total -= entry.size;
  }
  return evict;
}

export async function loadBlob(id: string): Promise<Blob | undefined> {
  const entry = await get<BlobCacheEntry>(blobKey(id));
  if (entry === undefined) return undefined;

  const lru = (await loadLru()).filter((e) => e.id !== id);
  lru.push({ id, size: entry.size, lastUsed: Date.now() });
  await saveLru(lru);

  return entry.blob;
}

export async function saveBlob(id: string, blob: Blob): Promise<void> {
  const size = blob.size;
  const lastUsed = Date.now();
  const entry: BlobCacheEntry = { blob, size, lastUsed };
  await set(blobKey(id), entry);

  const lru = (await loadLru()).filter((e) => e.id !== id);
  lru.push({ id, size, lastUsed });

  const toEvict = evictPlan(lru, BLOB_CACHE_CAP_BYTES);
  if (toEvict.length > 0) {
    const dropped = new Set(toEvict);
    await Promise.all(toEvict.map((evictId) => del(blobKey(evictId))));
    await saveLru(lru.filter((e) => !dropped.has(e.id)));
  } else {
    await saveLru(lru);
  }
}

/** Drops every cached index, note and blob. */
export async function clearAll(): Promise<void> {
  await clear();
}
