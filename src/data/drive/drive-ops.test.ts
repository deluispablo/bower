import { describe, expect, it } from 'vitest';
import { DRIVE_OPS, type BinLookup, type DriveApi, type ResumableDrive } from './drive-api';
import type { StoredDigests } from '../pile-readiness';
import { drivePolicy, type PlaceGuard } from '../session';

type Method = keyof (DriveApi & ResumableDrive & BinLookup & StoredDigests);

/** What each Drive method is. `satisfies` fails the type check when a method is left out. */
const EXPECTED = {
  listAll: 'read',
  get: 'read',
  readText: 'read',
  readBytes: 'read',
  fullText: 'read',
  binnedByItem: 'read',
  storedDigest: 'read',
  generateIds: 'read',
  sessionStatus: 'read',
  getUploaded: 'read',
  createFolder: 'write',
  createText: 'write',
  upload: 'write',
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
