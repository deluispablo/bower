import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { FakeDrive } from './fake-drive';
import { createUploadQueue } from '../upload-queue';
import { indexedDbUploadStore } from '../upload-store';
import { sha256 } from '../vault/hashes';
import { DRIVE_OPS, type DriveApi } from './drive-api';
import { drivePolicy, fenceDrive, openElsewhere, type PlaceGuard } from '../session';

type Method = keyof DriveApi;

/** What each Drive method is. `satisfies` fails the type check when a method is left out. */
const EXPECTED = {
  listAll: 'read',
  get: 'read',
  readText: 'read',
  readBytes: 'read',
  fullText: 'read',
  binnedByItem: 'read',
  stamped: 'read',
  storedDigest: 'read',
  generateIds: 'write',
  sessionStatus: 'read',
  getUploaded: 'read',
  createFolder: 'write',
  createText: 'write',
  writeText: 'write',
  update: 'write',
  trash: 'write',
  untrash: 'write',
  openResumable: 'write',
  putChunk: 'write',
} as const satisfies Record<Method, 'read' | 'write'>;

describe('every Drive method is classed read or write', () => {
  it('the table classes each method as expected', () => {
    expect(DRIVE_OPS).toEqual(EXPECTED);
  });

  it('the lease guard lets every read through and guards every write', async () => {
    let asked = 0;
    const guard = {
      epoch: () => 1,
      verify: () => {
        asked += 1;
        return Promise.resolve();
      },
    } as unknown as PlaceGuard;
    const wrong: string[] = [];
    for (const [method, kind] of Object.entries(EXPECTED)) {
      const policy = drivePolicy(guard);
      asked = 0;
      await policy.before(method, ['s', 0]);
      const guarded = asked > 0;
      if (guarded !== (kind === 'write')) wrong.push(`${method} is a ${kind} but ${guarded ? 'was guarded' : 'was let through'}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe('no id is reserved on a lost lease', () => {
  it('the upload queue asks for no id while another place is active', async () => {
    const drive = new FakeDrive({ chunkMultiple: 4 });
    const inbox = (await drive.createFolder('root', 'Inbox')).id;
    const lost = { epoch: () => 1, verify: () => Promise.reject(openElsewhere()) } as unknown as PlaceGuard;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const queue = createUploadQueue({ drive: fenceDrive(drive, lost), store: indexedDbUploadStore(new IDBFactory()), chunkSize: 4 });
    await queue.start('account-a', 'FOLDER_ID');
    const body = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6])], { type: 'application/pdf' });
    await queue.add({ declarationId: 'decl-1', memberKey: 'member-1', sha256: await sha256(body), pileId: 'pile-1', parentId: inbox, name: 'scan-1.pdf', body, appProperties: { item: 'member-1' } });
    await queue.idle();
    expect(drive.resumableCalls.filter((c) => c.op === 'generateIds')).toEqual([]);
    queue.stop();
  });
});
