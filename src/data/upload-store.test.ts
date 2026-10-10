import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { indexedDbUploadStore, uploadId, type PendingUpload } from './upload-store';

const pending = (over: Partial<PendingUpload> = {}): PendingUpload => ({
  account: 'account-a',
  folder: 'FOLDER_ID',
  declarationId: 'decl-1',
  memberKey: 'member-1',
  sha256: 'a'.repeat(64),
  pileId: 'pile-1',
  parentId: 'INBOX_ID',
  name: 'scan.pdf',
  type: 'application/pdf',
  size: 3,
  appProperties: {},
  fileId: null,
  session: null,
  confirmed: 0,
  addedAt: '2026-10-06T10:00:00.000Z',
  ...over,
});

const body = (): Blob => new Blob([new Uint8Array([7, 8, 9])], { type: 'application/pdf' });

describe('the upload store', () => {
  it('keeps the bytes and the progress apart, per account and folder, oldest first', async () => {
    const store = indexedDbUploadStore(new IDBFactory());
    const later = pending({ memberKey: 'member-2', addedAt: '2026-10-06T11:00:00.000Z' });
    const first = pending();
    const otherAccount = pending({ account: 'account-b' });
    const otherFolder = pending({ folder: 'OTHER_FOLDER_ID' });
    const laterVersion = await store.captureForgetVersion(later);
    const firstVersion = await store.captureForgetVersion(first);
    const otherAccountVersion = await store.captureForgetVersion(otherAccount);
    const otherFolderVersion = await store.captureForgetVersion(otherFolder);
    await store.add(later, body(), laterVersion);
    await store.add(first, body(), firstVersion);
    await store.add(otherAccount, body(), otherAccountVersion);
    await store.add(otherFolder, body(), otherFolderVersion);
    expect((await store.list('account-a', 'FOLDER_ID')).map((r) => r.memberKey)).toEqual(['member-1', 'member-2']);

    await store.save({ ...later, session: 'SESSION', confirmed: 2, fileId: 'RESERVED_ID' }, laterVersion);
    const again = await store.list('account-a', 'FOLDER_ID');
    expect(again.find((record) => record.memberKey === later.memberKey)).toMatchObject({ session: 'SESSION', confirmed: 2, fileId: 'RESERVED_ID' });
    const bytes = await store.body(later);
    expect(bytes?.type).toBe('application/pdf');
    expect(bytes && [...new Uint8Array(await bytes.arrayBuffer())]).toEqual([7, 8, 9]);
  });

  it('a removed one stays removed, even if a late save arrives', async () => {
    const store = indexedDbUploadStore(new IDBFactory());
    const r = pending();
    const version = await store.captureForgetVersion(r);
    await store.add(r, body(), version);
    await store.remove(r);
    await store.save({ ...r, confirmed: 2 }, version);
    expect(await store.list('account-a', 'FOLDER_ID')).toEqual([]);
    expect(await store.body(r)).toBeNull();
  });

  it('clears one folder, or every folder of one account', async () => {
    const store = indexedDbUploadStore(new IDBFactory());
    const r = pending();
    const otherFolder = pending({ folder: 'OTHER_FOLDER_ID' });
    const otherAccount = pending({ account: 'account-b' });
    const version = await store.captureForgetVersion(r);
    const otherFolderVersion = await store.captureForgetVersion(otherFolder);
    const otherAccountVersion = await store.captureForgetVersion(otherAccount);
    await store.add(r, body(), version);
    await store.add(otherFolder, body(), otherFolderVersion);
    await store.add(otherAccount, body(), otherAccountVersion);
    await store.clear('account-a', 'OTHER_FOLDER_ID');
    expect(await store.list('account-a', 'FOLDER_ID')).toHaveLength(1);
    expect(await store.list('account-a', 'OTHER_FOLDER_ID')).toEqual([]);
    await store.clear('account-a');
    expect(await store.list('account-a', 'FOLDER_ID')).toEqual([]);
    expect(await store.list('account-b', 'FOLDER_ID')).toHaveLength(1);
  });

  it('names each one by account, folder, declaration, member and content hash', () => {
    expect(uploadId(pending())).not.toBe(uploadId(pending({ sha256: 'b'.repeat(64) })));
    expect(uploadId(pending())).not.toBe(uploadId(pending({ declarationId: 'decl-2' })));
  });

  it('without IndexedDB every call rejects, so the queue can say so', async () => {
    const store = indexedDbUploadStore(null);
    await expect(store.list('account-a', 'FOLDER_ID')).rejects.toBeInstanceOf(Error);
    const r = pending();
    const adding = (async () => {
      const version = await store.captureForgetVersion(r);
      await store.add(r, body(), version);
    })();
    await expect(adding).rejects.toBeInstanceOf(Error);
  });

  it('lets another tab replace the database, then opens it again', async () => {
    const idb = new IDBFactory();
    const store = indexedDbUploadStore(idb);
    const r = pending();
    const next = pending({ memberKey: 'member-2' });
    const version = await store.captureForgetVersion(r);
    const nextVersion = await store.captureForgetVersion(next);
    await store.add(r, body(), version);
    const deleting = new Promise<string>((resolve) => {
      const r = idb.deleteDatabase('bower-uploads');
      r.onsuccess = () => resolve('deleted');
    });
    expect(await Promise.race([deleting, new Promise<string>((r) => setTimeout(() => r('blocked'), 200))])).toBe('deleted');
    await store.add(next, body(), nextVersion);
    expect((await store.list('account-a', 'FOLDER_ID')).map((r) => r.memberKey)).toEqual(['member-2']);
  });

  it('removes a malformed record and its bytes, and says so in the console', async () => {
    const idb = new IDBFactory();
    const store = indexedDbUploadStore(idb);
    const r = pending();
    const version = await store.captureForgetVersion(r);
    await store.add(r, body(), version);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = idb.open('bower-uploads');
      r.onsuccess = () => resolve(r.result);
    });
    const bad = ['account-a', 'FOLDER_ID', 'decl-x', 'member-x', 'b'.repeat(64)];
    await new Promise<void>((resolve) => {
      const t = db.transaction(['pending', 'bytes'], 'readwrite');
      t.objectStore('pending').put({ account: 'account-a', folder: 'FOLDER_ID', declarationId: 'decl-x', memberKey: 'member-x', sha256: 'b'.repeat(64), size: 'big' });
      t.objectStore('bytes').put({ buffer: new ArrayBuffer(1), type: '' }, bad);
      t.oncomplete = () => resolve();
    });
    expect((await store.list('account-a', 'FOLDER_ID')).map((r) => r.memberKey)).toEqual(['member-1']);
    expect(error).toHaveBeenCalled();
    const left = await new Promise<number>((resolve) => {
      const r = db.transaction(['pending', 'bytes']).objectStore('bytes').count();
      r.onsuccess = () => resolve(r.result);
    });
    expect(left).toBe(1);
    db.close();
  });
});
