/**
 * IndexedDB cache for the vault, via `idb-keyval` over one database
 * (`keyval-store`, version 2) with several object stores (#582). The
 * original `keyval` store holds these kinds of entry:
 *
 * - `index`: the last `listVault` result.
 * - `note:<id>`: one note's text, keyed by the file id.
 * - `blob:<id>`: one file's bytes, keyed by the file id.
 * - `blob-lru`: the recency order of every cached blob, for eviction.
 *
 * Blobs are capped at `BLOB_CACHE_CAP_BYTES` total; `saveBlob` evicts the
 * least recently used entries first. `evictPlan` is the pure decision so it
 * can be unit-tested without IndexedDB. Every read-modify-write of
 * `blob-lru` runs through one queue (`withLru`): a note loads its images
 * concurrently, and unserialised updates would overwrite each other (#133).
 *
 * The other stores are per device and small: `seen` (ids the person has
 * seen), `viewSettings` (per folder path), `treeState` (expanded paths and
 * scroll), `searchIndex` (a serialised MiniSearch, filled by #592) and
 * `noteMeta` (lazy frontmatter, see `note-meta.ts`). A blocked or missing
 * database (private windows) degrades to memory for the session.
 */

import { clear, del, get, set } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';

import { thumbnailLinkOf } from './drive.js';
import type { DriveFile } from './drive.js';
import { thumbnailUrl } from './file-preview.js';
import type { ExplorerSortPref } from './prefs.js';

export const BLOB_CACHE_CAP_BYTES = 50 * 1024 * 1024;

const INDEX_KEY = 'index';
const BLOB_LRU_KEY = 'blob-lru';

// --- Database and stores ---------------------------------------------------

const DB_NAME = 'keyval-store';
/** 1 was the single `keyval` store `idb-keyval` made on its own. */
export const DB_VERSION = 2;

/** `keyval` is the original store; the rest arrived with version 2. */
export const STORE_NAMES = [
  'keyval',
  'seen',
  'viewSettings',
  'treeState',
  'searchIndex',
  'noteMeta',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

/** The slice of `IDBDatabase` the upgrade touches, so a test can fake it. */
export interface UpgradeTarget {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
}

/**
 * Creates every store that does not exist yet and returns the names it
 * created. Never deletes or clears one, so an upgrade from version 1 (or a
 * fresh database) keeps whatever `keyval` already holds.
 */
export function upgradeDb(db: UpgradeTarget): string[] {
  const created: string[] = [];
  for (const name of STORE_NAMES) {
    if (db.objectStoreNames.contains(name)) continue;
    db.createObjectStore(name);
    created.push(name);
  }
  return created;
}

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise !== undefined) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      upgradeDb(request.result);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let a newer version of the app in another tab upgrade the database.
      db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('open failed'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked.'));
  });
  dbPromise = opening;
  opening.catch(() => {
    if (dbPromise === opening) dbPromise = undefined;
  });
  return opening;
}

function useStore(name: StoreName): UseStore {
  return (mode, callback) =>
    openDb().then((db) =>
      callback(db.transaction(name, mode).objectStore(name)),
    );
}

const memory = new Map<StoreName, Map<string, unknown>>();
let warned = false;

function memoryStore(name: StoreName): Map<string, unknown> {
  let map = memory.get(name);
  if (map === undefined) {
    map = new Map();
    memory.set(name, map);
  }
  return map;
}

function degraded(error: unknown): void {
  if (warned) return;
  warned = true;
  console.warn('Bower cache: IndexedDB unavailable, using memory.', error);
}

async function kvGet<T>(name: StoreName, key: string): Promise<T | undefined> {
  try {
    return await get<T>(key, useStore(name));
  } catch (error) {
    degraded(error);
    return memoryStore(name).get(key) as T | undefined;
  }
}

async function kvSet(
  name: StoreName,
  key: string,
  value: unknown,
): Promise<void> {
  try {
    await set(key, value, useStore(name));
  } catch (error) {
    degraded(error);
    memoryStore(name).set(key, value);
  }
}

async function kvDel(name: StoreName, key: string): Promise<void> {
  try {
    await del(key, useStore(name));
  } catch (error) {
    degraded(error);
    memoryStore(name).delete(key);
  }
}

async function kvClear(name: StoreName): Promise<void> {
  memory.delete(name);
  try {
    await clear(useStore(name));
  } catch (error) {
    degraded(error);
  }
}

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
  return kvGet('keyval', INDEX_KEY);
}

export async function saveIndex(
  files: DriveFile[],
  fetchedAt: string,
): Promise<void> {
  const entry: IndexCacheEntry = { files, fetchedAt };
  await kvSet('keyval', INDEX_KEY, entry);
}

/** Drops the cached index so the next load re-fetches from Drive. */
export async function invalidateIndex(): Promise<void> {
  await kvDel('keyval', INDEX_KEY);
}

// --- Notes ---------------------------------------------------------------

export async function loadNote(
  id: string,
): Promise<NoteCacheEntry | undefined> {
  return kvGet('keyval', noteKey(id));
}

export async function saveNote(
  id: string,
  text: string,
  modifiedTime: string,
  fetchedAt: string,
): Promise<void> {
  const entry: NoteCacheEntry = { text, modifiedTime, fetchedAt };
  await kvSet('keyval', noteKey(id), entry);
}

// --- Blobs (LRU) -----------------------------------------------------------

async function loadLru(): Promise<BlobLruEntry[]> {
  return (await kvGet<BlobLruEntry[]>('keyval', BLOB_LRU_KEY)) ?? [];
}

async function saveLru(entries: BlobLruEntry[]): Promise<void> {
  await kvSet('keyval', BLOB_LRU_KEY, entries);
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

/**
 * Tail of the queue that serialises every `blob-lru` update in this tab.
 * Never rejects, so one failed update does not block the next.
 */
let lruQueue: Promise<void> = Promise.resolve();

/** Runs `task` once every earlier LRU update has settled. */
function withLru<T>(task: () => Promise<T>): Promise<T> {
  const run = lruQueue.then(task);
  lruQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function loadBlob(id: string): Promise<Blob | undefined> {
  const entry = await kvGet<BlobCacheEntry>('keyval', blobKey(id));
  if (entry === undefined) return undefined;

  await withLru(async () => {
    const lru = (await loadLru()).filter((e) => e.id !== id);
    lru.push({ id, size: entry.size, lastUsed: Date.now() });
    await saveLru(lru);
  });

  return entry.blob;
}

export async function saveBlob(id: string, blob: Blob): Promise<void> {
  const size = blob.size;
  // The blob is written inside the queue too, so an eviction running for
  // another save can never delete it between its write and its LRU entry.
  await withLru(async () => {
    const lastUsed = Date.now();
    const entry: BlobCacheEntry = { blob, size, lastUsed };
    await kvSet('keyval', blobKey(id), entry);

    const lru = (await loadLru()).filter((e) => e.id !== id);
    lru.push({ id, size, lastUsed });

    const toEvict = evictPlan(lru, BLOB_CACHE_CAP_BYTES);
    if (toEvict.length > 0) {
      const dropped = new Set(toEvict);
      await Promise.all(
        toEvict.map((evictId) => kvDel('keyval', blobKey(evictId))),
      );
      await saveLru(lru.filter((e) => !dropped.has(e.id)));
    } else {
      await saveLru(lru);
    }
  });
}

// --- Per-device stores -------------------------------------------------------

/** How a folder screen orders and filters its files, remembered per folder path. */
export interface ViewSettings {
  sort: ExplorerSortPref;
  /** A kind id, or `null` for every kind. */
  kindFilter: string | null;
  /** An origin (`file-origin.ts`), or `null` for every origin. */
  originFilter: string | null;
  layout: 'list' | 'grid';
  /** `layout` was picked by the person; without it the folder chooses (#613). */
  layoutChosen?: boolean;
  /** Compare's column order for the folder (#612). */
  compareColumns?: string[];
}

export interface TreeState {
  /** Folder paths currently expanded. */
  expanded: string[];
  /** The tree's scroll offset in pixels. */
  scroll: number;
}

const SEEN_KEY = 'ids';
const TREE_KEY = 'tree';
const SEARCH_INDEX_KEY = 'index';

/** Ids of the files this device has seen (the "New" markers, #587). */
export async function loadSeen(): Promise<string[]> {
  return (await kvGet<string[]>('seen', SEEN_KEY)) ?? [];
}

export async function saveSeen(ids: string[]): Promise<void> {
  await kvSet('seen', SEEN_KEY, ids);
}

export async function loadViewSettings(
  folderPath: string,
): Promise<ViewSettings | undefined> {
  return kvGet('viewSettings', folderPath);
}

export async function saveViewSettings(
  folderPath: string,
  settings: ViewSettings,
): Promise<void> {
  await kvSet('viewSettings', folderPath, settings);
}

export async function loadTreeState(): Promise<TreeState | undefined> {
  return kvGet('treeState', TREE_KEY);
}

export async function saveTreeState(state: TreeState): Promise<void> {
  await kvSet('treeState', TREE_KEY, state);
}

/** The serialised search index: MiniSearch's JSON, opaque here (#592). */
export interface SearchIndexEntry {
  json: string;
  /** ISO timestamp of when it was built. */
  builtAt: string;
}

export async function loadSearchIndex(): Promise<SearchIndexEntry | undefined> {
  return kvGet('searchIndex', SEARCH_INDEX_KEY);
}

export async function saveSearchIndex(entry: SearchIndexEntry): Promise<void> {
  await kvSet('searchIndex', SEARCH_INDEX_KEY, entry);
}

/** One note's cached metadata; the shape belongs to `note-meta.ts`. */
export async function loadNoteMetaEntry<T>(id: string): Promise<T | undefined> {
  return kvGet<T>('noteMeta', id);
}

export async function saveNoteMetaEntry(
  id: string,
  entry: unknown,
): Promise<void> {
  await kvSet('noteMeta', id, entry);
}

/** Drops everything cached on this device, in every store. */
export async function clearAll(): Promise<void> {
  await Promise.all(STORE_NAMES.map((name) => kvClear(name)));
}

// --- Thumbnails ------------------------------------------------------------

/** Blob-cache id of a file's thumbnail, apart from the file's own bytes. */
function thumbId(id: string): string {
  return `thumb:${id}`;
}

async function fetchThumbnail(link: string | null): Promise<Blob | undefined> {
  const url = thumbnailUrl(link);
  if (url === null) return undefined;
  try {
    const response = await fetch(url);
    return response.ok ? await response.blob() : undefined;
  } catch {
    // Offline or blocked: the caller falls back to the refetched link.
    return undefined;
  }
}

/**
 * A file's thumbnail picture, from the blob cache when it is there. Else the
 * listing's `thumbnailLink` is tried; if that has expired (or the listing
 * had none) the link is refetched with one `files.get` and tried once more.
 * A picture found is saved in the blob LRU, so it is fetched once per file.
 * `undefined` when Drive has no thumbnail for the file.
 */
export async function loadThumbnail(
  file: Pick<DriveFile, 'id' | 'thumbnailLink'>,
): Promise<Blob | undefined> {
  const cached = await loadBlob(thumbId(file.id));
  if (cached !== undefined) return cached;

  let blob = await fetchThumbnail(file.thumbnailLink ?? null);
  if (blob === undefined) {
    blob = await fetchThumbnail(await thumbnailLinkOf(file.id));
  }
  if (blob !== undefined) await saveBlob(thumbId(file.id), blob);
  return blob;
}
