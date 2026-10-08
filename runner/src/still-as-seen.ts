/**
 * What the run saw of each file, and the check before each write that it is
 * still so: the target's (or, for a create, its folder's) name, parents and
 * Bin state, and the target's modifiedTime. A file the run never read is
 * never written.
 *
 * A folder's own modifiedTime is not compared for a create: it is not a
 * version of what is inside it, and a create only needs the folder to be
 * where the run saw it and out of the Bin.
 *
 * Shared by the runner's Drive adapter and by the fake's `fenced()` check in
 * tests, so both refuse the same writes.
 */
import { BowerError } from '../../src/data/types';
import type { DriveFile } from '../../src/data/drive/drive-api';
import type { FencedCall, FencedDrive } from '../../src/data/drive/fake-drive';

/** A file as stored at the moment of the check; null when it is gone. */
export interface StoredNow {
  file: DriveFile;
  trashed: boolean;
}

/** The file a write's check reads: the file itself, or the folder a create goes into. */
export interface FenceTarget {
  id: string;
  part: 'target' | 'parent';
}

export const targetOf = (call: FencedCall): FenceTarget => ('id' in call ? { id: call.id, part: 'target' } : { id: call.parentId, part: 'parent' });

export const notAsSeen = (): BowerError => new BowerError('conflict', 'This changed somewhere else while Bower was tidying.');

const sameParents = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((p) => b.includes(p));

export class SeenFiles {
  private seen = new Map<string, DriveFile>();

  /** Keeps what the run read or wrote, and gives it back. */
  note(file: DriveFile): DriveFile {
    this.seen.set(file.id, { ...file, parents: [...file.parents] });
    return file;
  }

  /**
   * What the plan saw of a file, as the run's own view of it: the name and place it must still have. Its modifiedTime
   * is not compared unless `withTime` (a text change elsewhere does not clash with a move or a Bin).
   */
  expectPlace(file: DriveFile, withTime = false): void {
    this.seen.set(file.id, { ...file, parents: [...file.parents], ...(withTime ? {} : { modifiedTime: '' }) });
  }

  forget(id: string): void {
    this.seen.delete(id);
  }

  /** Throws a `conflict` unless the stored file is still as the run saw it. */
  assert(target: FenceTarget, now: StoredNow | null): void {
    const seen = this.seen.get(target.id);
    const moved: string[] = [];
    if (!seen) moved.push('never read');
    else if (!now || now.trashed) moved.push('gone');
    else {
      if (now.file.name !== seen.name) moved.push('name');
      if (!sameParents(now.file.parents, seen.parents)) moved.push('parents');
      if (target.part === 'target' && seen.modifiedTime !== '' && now.file.modifiedTime !== seen.modifiedTime) moved.push('modifiedTime');
    }
    if (!moved.length) return;
    console.error(`Refused a write to ${target.part} ${target.id}: ${moved.join(', ')}`);
    throw notAsSeen();
  }

  /** The same writes, keeping what each answer says, and forgetting a file put in the Bin. */
  wrap(writes: FencedDrive): FencedDrive {
    return {
      createFolder: async (parentId, name, appProperties) => this.note(await writes.createFolder(parentId, name, appProperties)),
      createText: async (parentId, name, text, appProperties) => this.note(await writes.createText(parentId, name, text, appProperties)),
      update: async (id, patch) => this.note(await writes.update(id, patch)),
      trash: async (id, appProperties) => {
        await writes.trash(id, appProperties);
        this.forget(id);
      },
      writeText: async (id, text, ifModified, appProperties) => this.note(await writes.writeText(id, text, ifModified, appProperties)),
    };
  }
}
