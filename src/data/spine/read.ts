/**
 * The adapters of the plan's read interface (`SpineRead`): Google Drive through `DriveHttp` (the Worker and the
 * runner), the Worker's admission reader over it (`admissionRead`), and the pretend Drive (the fake and demo sources). Both give digests from what Drive keeps, never by
 * reading a file's content.
 */
import type { OwnershipContext } from '../contracts/ownership-format';
import type { IndexedFront } from '../contracts/note-format';
import { BIN_KEYS, SEARCH_MAX_PAGES, type DriveApi, type DriveFile, type ResumableDrive } from '../drive/drive-api';
import { declarationCopies, pileRecords } from '../pile-readiness';
import { PILE_NOTE } from '../piles';
import type { Pile } from '../types';
import { PROP } from '../vault/layout';
import { VaultIndex } from '../vault/vault-index';
import type { AdmissionScope } from './admission';
import { NotReadHere } from './budget';
import type { SpineRead } from './plan';

/**
 * What the scripted provider reads (`scripted.ts`): the plan's reads, the inbox's piles as the Inbox reads them, and
 * what the stored digests it records are (`fake-stored` from the pretend Drive, `adapter-read` from Drive v3). Its
 * adapters build the piles over their own Drive (`DriveVault.piles`), outside the spine.
 */
export interface ScriptedRead extends SpineRead {
  piles(rootId: string, context?: OwnershipContext): Promise<Pile[]>;
  provenance: 'fake-stored' | 'adapter-read';
  /** Metadata from a prefix already read for the canonical index, without fetching media. */
  indexedFront?(file: DriveFile): Promise<IndexedFront | undefined>;
}

type DriveReads = Pick<DriveApi, 'listAll' | 'readBytes' | 'readText' | 'binnedByItem' | 'get'> & Pick<ResumableDrive, 'getUploaded'>;

/** Drive v3: the listing, Bower's own files, and `sha256Checksum` with `size` from `files.get`. */
export function driveRead(drive: DriveReads): SpineRead {
  return {
    listAll: (rootId) => drive.listAll(rootId),
    readBytes: (id) => drive.readBytes(id),
    readText: (id) => drive.readText(id),
    digest: async (file) => {
      const now = await drive.getUploaded(file.id);
      return now.sha256 !== undefined && now.size !== undefined ? { size: now.size, sha256: now.sha256 } : null;
    },
    binnedByItem: (rootId, keys) => drive.binnedByItem(rootId, keys),
    binned: (id) => drive.get(id, { binned: true }),
  };
}

/** The pretend Drive: what it stored (`fake-stored`), and its Bin lookup by item key. */
export function fakeRead(drive: Pick<DriveApi, 'listAll' | 'readBytes' | 'readText' | 'storedDigest' | 'binnedByItem' | 'get'>): SpineRead {
  return {
    listAll: (rootId) => drive.listAll(rootId),
    readBytes: (id) => drive.readBytes(id),
    readText: (id) => drive.readText(id),
    digest: (file) => drive.storedDigest(file.id),
    binnedByItem: (rootId, keys) => drive.binnedByItem(rootId, keys),
    binned: (id) => drive.get(id, { binned: true }),
  };
}

/**
 * How many reads run at once: enough that a folder like staging's is read in two rounds, few enough to stay well
 * inside Drive's per-user rate (Drive v3, "Usage limits"; a 403 or 429 is retried with backoff by `DriveHttp`).
 */
export const READ_AHEAD = 8;

/** The Drive admission reads: `DriveHttp`, whose listing can carry each file's checksum. */
type AdmissionDrive = Pick<DriveApi, 'readBytes' | 'readText' | 'binnedByItem' | 'get'> &
  Pick<ResumableDrive, 'getUploaded'> & { listAll(rootId: string, opts: { checksums: boolean }): Promise<DriveFile[]> };

/** A shared metadata listing may defer read-ahead until the provider has selected its scope. */
export type AdmissionRead = Omit<SpineRead, 'listAll'> & {
  listAll(rootId: string, opts?: { readAhead: boolean }): Promise<DriveFile[]>;
  warmListing(rootId: string, listing: readonly DriveFile[]): void;
};

/** Runs each task with at most `limit` running at once, in the order given. */
export function limiter(limit: number, stopOnError?: (error: unknown) => boolean): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0;
  let stopped: { error: unknown } | undefined;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
    try {
      if (stopped) throw stopped.error;
      return await task();
    } catch (error) {
      if (stopOnError?.(error)) stopped = { error };
      throw error;
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  };
}

/**
 * What admission has spent of a Worker invocation's subrequests (`SUBREQUEST_BUDGET`): `used()` counts every fetch the
 * request has made so far (the token, each listing page, each read and its retries), and `reserve` is kept for what
 * comes after admission (the dispatch and its two retries). Every read admission makes is granted against it.
 */
export interface SubrequestBudget {
  limit: number;
  reserve: number;
  used(): number;
}

/** What the plan will read of this listing, by kind: your changes, each inbox pile's first note, its declarations and dispositions. */
function readsOf(rootId: string, listing: readonly DriveFile[], scope: AdmissionScope): { texts: string[]; notes: string[]; bytes: string[] } {
  const ix = VaultIndex.build(rootId, listing);
  const texts = ix.journalFiles().filter((f) => !f.folder && f.name.endsWith('.json')).map((f) => f.id);
  const notes: string[] = [];
  const bytes: string[] = [];
  if (scope !== 'all') return { texts, notes, bytes };
  const declared = new Set<string>();
  const pileIds = new Set<string>();
  for (const f of ix.filesIn('Inbox')) {
    const declarationId = f.appProperties?.[PROP.declaration];
    if (declarationId) declared.add(declarationId);
    pileIds.add(f.appProperties?.[PROP.pile] ?? f.id);
    const path = f.folder ? ix.pathOf(f.id) : undefined;
    if (!path) continue;
    const note = ix.filesIn(path).find((k) => !k.folder && k.name === PILE_NOTE);
    if (note) notes.push(note.id);
  }
  for (const id of declared) bytes.push(...declarationCopies(listing, rootId, id).map((f) => f.id));
  // The dispositions the plan reads are those of the inbox's piles (`pileRecords`), not the whole history.
  if (declared.size) bytes.push(...pileRecords(listing, rootId, 'disposition', pileIds).map((f) => f.id));
  return { texts, notes, bytes };
}

/**
 * Google Drive for the Worker's admission (TL-P4-04): the plan's reads over `DriveHttp`, built for the cost of one
 * press. The plan and its rules are the shared ones (`planAdmission`); only how the bytes arrive
 * changes, so the manifest is the same as over the plain adapter (`driveRead`).
 *
 * - **The listing** is one `files.list` per level of folders, paged, with `sha256Checksum` among the fields, so a
 *   declared member's stored size and hash come from it rather than one `files.get` each (Drive v3, "Improve
 *   performance": partial responses, https://developers.google.com/workspace/drive/api/guides/performance). A file
 *   listed with no checksum is asked for with `files.get`, as before.
 * - **Reads ahead.** Once the folder is listed, the files the plan reads are started together, at most
 *   `READ_AHEAD` at a time: your changes, each pile's first note (the one the Inbox reads), the declarations the
 *   inbox's piles name and, when any pile is declared, the dispositions beside them. The plan then reads each one
 *   from here: every file is read at most once per press, and its text lives only for that press.
 * - **A budget** (TL-P4-11). With one, every read (a file's text or bytes, a digest asked of `files.get`) is granted
 *   only while the invocation has subrequests to spare: what it has fetched so far, plus the reads granted and the
 *   dispatch still to come, under `limit`. Once listed, the reads ahead are granted first, in the order that keeps
 *   most of the plan decided here: pile notes, then declarations and dispositions, then your changes; any later read
 *   takes what is left. A read not granted raises `NotReadHere`: the plan hands what it would have decided to the
 *   runner (the whole pile, or the change file), which reads every file and holds a pile by the same rules before
 *   any write (`scripted.ts`, `capturePiles` with notes). So no folder makes admission fetch past the budget, and
 *   the run's outcome is the unbudgeted one; only a press's speed changes.
 * - A read ahead that fails is kept as it failed, so the plan meets the very error a read of its own would have
 *   met; it is logged (no file text is ever in an error).
 */
export function admissionRead(drive: AdmissionDrive, scope: AdmissionScope, budget?: SubrequestBudget,
  stopOnError?: (error: unknown) => boolean): AdmissionRead {
  const limit = limiter(READ_AHEAD, stopOnError);
  const texts = new Map<string, Promise<string>>();
  const bytes = new Map<string, Promise<Uint8Array>>();
  const once = <T>(kept: Map<string, Promise<T>>, id: string, read: () => Promise<T>): Promise<T> => {
    let pending = kept.get(id);
    if (pending === undefined) {
      pending = limit(read);
      kept.set(id, pending);
    }
    return pending;
  };
  // Each read granted against the budget, by kind and id (`t:` text, `b:` bytes, `d:` digest, `g:` a Bin get), and those refused.
  const granted = new Set<string>();
  const refused = new Set<string>();
  // What the invocation had fetched when the listing was in: the token and the listing's pages.
  let base = 0;
  const afford = (key: string): boolean => {
    if (!budget || granted.has(key)) return true;
    if (refused.has(key)) return false;
    // Retries already made count through `used()`; the reads granted and not yet made count through `granted`.
    if (Math.max(budget.used(), base + granted.size) < budget.limit - budget.reserve) {
      granted.add(key);
      return true;
    }
    refused.add(key);
    return false;
  };
  const text = (id: string): Promise<string> => (afford(`t:${id}`) ? once(texts, id, () => drive.readText(id)) : Promise.reject(new NotReadHere()));
  const raw = (id: string): Promise<Uint8Array> => (afford(`b:${id}`) ? once(bytes, id, () => drive.readBytes(id)) : Promise.reject(new NotReadHere()));
  const ahead = <T>(pending: Promise<T>): void => {
    pending.catch((e: unknown) => {
      if (!(e instanceof NotReadHere)) console.error('An admission read ahead failed', e);
    });
  };
  const warmListing = (rootId: string, listing: readonly DriveFile[]): void => {
    const reads = readsOf(rootId, listing, scope);
    base = budget?.used() ?? 0;
    // Granted in this order while the budget has room; the rest are left to the runner.
    const order = [...reads.notes.map((id) => `t:${id}`), ...reads.bytes.map((id) => `b:${id}`), ...reads.texts.map((id) => `t:${id}`)];
    for (const key of order) afford(key);
    if (refused.size) console.info(`Admission leaves ${refused.size} reads to the runner: out of subrequests`);
    // Started in the order the plan reads them; a read not granted is left as it is (`NotReadHere`).
    for (const id of [...reads.texts, ...reads.notes]) ahead(text(id));
    for (const id of reads.bytes) ahead(raw(id));
  };
  return {
    listAll: async (rootId, opts) => {
      const listing = await drive.listAll(rootId, { checksums: true });
      if (opts?.readAhead !== false) warmListing(rootId, listing);
      return listing;
    },
    warmListing,
    readText: text,
    // Each caller gets its own copy, as `DriveHttp.readBytes` gives.
    readBytes: async (id) => new Uint8Array(await raw(id)),
    digest: async (file) => {
      if ((file.sha256 === undefined || file.size === undefined) && !afford(`d:${file.id}`)) throw new NotReadHere();
      const known = file.sha256 !== undefined && file.size !== undefined ? file : await drive.getUploaded(file.id);
      return known.sha256 !== undefined && known.size !== undefined ? { size: known.size, sha256: known.sha256 } : null;
    },
    // Asked only for a declared member missing from the listing. `DriveHttp` makes at most 2 queries for each 20 keys
    // (a `files.get` up a binned folder spends from those two), so each batch is granted as that many reads, or left to the runner.
    binnedByItem: async (rootId, keys) => {
      for (let i = 0; i < keys.length; i += BIN_KEYS) {
        const batch = keys.slice(i, i + BIN_KEYS).join('\n');
        for (let page = 1; page <= SEARCH_MAX_PAGES; page += 1) if (!afford(`n:${batch}:${page}`)) throw new NotReadHere();
      }
      // The walk up a binned folder spends from the same grant: no more fetches than the pages granted, else the runner's.
      const start = budget?.used() ?? 0;
      const allowance = Math.ceil(keys.length / BIN_KEYS) * SEARCH_MAX_PAGES;
      return drive.binnedByItem(rootId, keys, () => {
        if (budget && budget.used() - start >= allowance) throw new NotReadHere();
      });
    },
    // One `files.get`, granted as one read (`g:`), or left to the runner.
    binned: (id) => (afford(`g:${id}`) ? drive.get(id, { binned: true }) : Promise.reject(new NotReadHere())),
  };
}
