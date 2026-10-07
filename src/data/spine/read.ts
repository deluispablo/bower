/**
 * The two adapters of the plan's read interface (`SpineRead`): Google Drive through `DriveHttp` (the Worker and the
 * runner), and the pretend Drive (the fake and demo sources). Both give digests from what Drive keeps, never by
 * reading a file's content.
 */
import type { DriveApi, ResumableDrive } from '../drive/drive-api';
import type { FakeDrive } from '../drive/fake-drive';
import type { Pile } from '../types';
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
