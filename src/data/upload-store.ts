/**
 * Inert stub of the upload store, so tests load and fail by their
 * assertions before the IndexedDB store lands (upload-queue-persistent).
 * It keeps nothing.
 */

/** Account, folder, declaration, member key, content hash. */
export type UploadKey = [account: string, folder: string, declarationId: string, memberKey: string, sha256: string];

/** One thing on its way to Drive, without its bytes. */
export interface PendingUpload {
  account: string;
  folder: string;
  declarationId: string;
  memberKey: string;
  sha256: string;
  pileId: string;
  parentId: string;
  name: string;
  type: string;
  size: number;
  appProperties: Record<string, string>;
  fileId: string | null;
  session: string | null;
  confirmed: number;
  addedAt: string;
}

export interface UploadStore {
  list: (account: string, folder: string) => Promise<PendingUpload[]>;
  add: (record: PendingUpload, body: Blob) => Promise<void>;
  save: (record: PendingUpload) => Promise<void>;
  body: (record: PendingUpload) => Promise<Blob | null>;
  remove: (record: PendingUpload) => Promise<void>;
  clear: (account: string, folder?: string) => Promise<void>;
}

export function uploadKey(r: Pick<PendingUpload, 'account' | 'folder' | 'declarationId' | 'memberKey' | 'sha256'>): UploadKey {
  return [r.account, r.folder, r.declarationId, r.memberKey, r.sha256];
}

export function uploadId(r: Pick<PendingUpload, 'account' | 'folder' | 'declarationId' | 'memberKey' | 'sha256'>): string {
  return JSON.stringify(uploadKey(r));
}

/** A store that keeps nothing (stub). */
export function indexedDbUploadStore(_factory: IDBFactory | null = null, _name = 'bower-uploads'): UploadStore {
  return {
    list: async () => [],
    add: async () => undefined,
    save: async () => undefined,
    body: async () => null,
    remove: async () => undefined,
    clear: async () => undefined,
  };
}
