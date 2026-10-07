/** What the run saw of each file, checked before each write (stub). */
import type { DriveFile } from '../../src/data/drive/drive-api';
import type { FencedCall, FencedDrive } from '../../src/data/drive/fake-drive';

export interface StoredNow {
  file: DriveFile;
  trashed: boolean;
}

export interface FenceTarget {
  id: string;
  part: 'target' | 'parent';
}

export const targetOf = (call: FencedCall): FenceTarget => ('id' in call ? { id: call.id, part: 'target' } : { id: call.parentId, part: 'parent' });

export class SeenFiles {
  note(file: DriveFile): DriveFile {
    return file;
  }

  forget(_id: string): void {}

  assert(_target: FenceTarget, _now: StoredNow | null): void {}

  wrap(writes: FencedDrive): FencedDrive {
    return writes;
  }
}
