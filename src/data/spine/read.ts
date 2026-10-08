/**
 * The adapters of the plan's read interface (`SpineRead`): Google Drive through `DriveHttp` (the Worker and the
 * runner), the Worker's admission reader over it (`admissionRead`), and the pretend Drive (the fake and demo sources). Both give digests from what Drive keeps, never by
 * reading a file's content.
 */
import type { DriveApi, DriveFile, ResumableDrive } from '../drive/drive-api';
import type { FakeDrive } from '../drive/fake-drive';
import { declarationCopies } from '../pile-readiness';
import { PILE_NOTE } from '../piles';
import type { Pile } from '../types';
import { PROP, SYSTEM } from '../vault/layout';
import { VaultIndex } from '../vault/vault-index';
import type { AdmissionScope } from './admission';
import type { SpineRead } from './plan';

/**
 * What the scripted provider reads (`scripted.ts`): the plan's reads, the inbox's piles as the Inbox reads them, and
 * what the stored digests it records are (`fake-stored` from the pretend Drive, `adapter-read` from Drive v3). Its
 * adapters build the piles over their own Drive (`DriveVault.piles`), outside the spine.
 */
export interface ScriptedRead extends SpineRead {
  piles(rootId: string): Promise<Pile[]>;
  provenance: 'fake-stored' | 'adapter-read';
}

type DriveReads = Pick<DriveApi, 'listAll' | 'readBytes' | 'readText'> & Pick<ResumableDrive, 'getUploaded'>;

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
  };
}

/** The pretend Drive: what it stored (`fake-stored`), and its Bin lookup by item key. */
export function fakeRead(drive: Pick<FakeDrive, 'listAll' | 'readBytes' | 'readText' | 'storedDigest' | 'binnedByItem'>): SpineRead {
  return {
    listAll: (rootId) => drive.listAll(rootId),
    readBytes: (id) => drive.readBytes(id),
    readText: (id) => drive.readText(id),
    digest: (file) => drive.storedDigest(file.id),
    binnedByItem: (rootId, keys) => drive.binnedByItem(rootId, keys),
  };
}

/**
 * How many reads run at once: enough that a folder like staging's is read in two rounds, few enough to stay well
 * inside Drive's per-user rate (Drive v3, "Usage limits"; a 403 or 429 is retried with backoff by `DriveHttp`).
 */
export const READ_AHEAD = 8;

/** The Drive admission reads: `DriveHttp`, whose listing can carry each file's checksum. */
type AdmissionDrive = Pick<DriveApi, 'readBytes' | 'readText'> &
  Pick<ResumableDrive, 'getUploaded'> & { listAll(rootId: string, opts: { checksums: boolean }): Promise<DriveFile[]> };

/** Runs each task with at most `limit` running at once, in the order given. */
export function limiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
    try {
      return await task();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  };
}

/** What the plan will read of this listing, by kind, in the order it reads them. */
function readsOf(rootId: string, listing: readonly DriveFile[], scope: AdmissionScope): { texts: string[]; bytes: string[] } {
  const ix = VaultIndex.build(rootId, listing);
  const texts = ix.journalFiles().filter((f) => !f.folder && f.name.endsWith('.json')).map((f) => f.id);
  const bytes: string[] = [];
  if (scope !== 'all') return { texts, bytes };
  const declared = new Set<string>();
  for (const f of ix.filesIn('Inbox')) {
    const declarationId = f.appProperties?.[PROP.declaration];
    if (declarationId) declared.add(declarationId);
    const path = f.folder ? ix.pathOf(f.id) : undefined;
    if (!path) continue;
    const note = ix.filesIn(path).find((k) => !k.folder && k.name === PILE_NOTE);
    if (note) texts.push(note.id);
  }
  for (const id of declared) bytes.push(...declarationCopies(listing, rootId, id).map((f) => f.id));
  if (declared.size) {
    const piles = ix.file(SYSTEM.piles);
    bytes.push(...listing.filter((f) => !f.folder && piles !== undefined && f.parents.includes(piles.id) && f.name.startsWith('disposition-')).map((f) => f.id));
  }
  return { texts, bytes };
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
 * - A read ahead that fails is kept as it failed, so the plan meets the very error a read of its own would have
 *   met; it is logged (no file text is ever in an error).
 */
export function admissionRead(drive: AdmissionDrive, scope: AdmissionScope): SpineRead {
  const limit = limiter(READ_AHEAD);
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
  const text = (id: string): Promise<string> => once(texts, id, () => drive.readText(id));
  const raw = (id: string): Promise<Uint8Array> => once(bytes, id, () => drive.readBytes(id));
  const ahead = <T>(pending: Promise<T>): void => {
    pending.catch((e: unknown) => console.error('An admission read ahead failed', e));
  };
  return {
    listAll: async (rootId) => {
      const listing = await drive.listAll(rootId, { checksums: true });
      const reads = readsOf(rootId, listing, scope);
      for (const id of reads.texts) ahead(text(id));
      for (const id of reads.bytes) ahead(raw(id));
      return listing;
    },
    readText: text,
    // Each caller gets its own copy, as `DriveHttp.readBytes` gives.
    readBytes: async (id) => new Uint8Array(await raw(id)),
    digest: async (file) => {
      const known = file.sha256 !== undefined && file.size !== undefined ? file : await drive.getUploaded(file.id);
      return known.sha256 !== undefined && known.size !== undefined ? { size: known.size, sha256: known.sha256 } : null;
    },
  };
}
