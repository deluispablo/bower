/**
 * What the run saw of each file, and the check before each write that it is
 * still so: the target's name, parents and Bin state, and (for a content
 * write) its modifiedTime. A file the run never read is never written.
 *
 * A create's folder is checked only for being there, a folder, and out of
 * the Bin: where it is and what it is called are no version of what is in it.
 *
 * The fence of both apply engine adapters (`RunnerDrive` on Google Drive,
 * `FakeRunDrive` on the pretend one), so both refuse the same writes.
 */
import { notAsSeen, notAsSeenError } from '../contracts/still-as-seen';
import type { DriveFile, FencedCall, FencedDrive } from './drive-api';

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

/** The runner's sentence for a write its fence refused; code tells the refusal by its reason (`notAsSeenReason`). */
const NOT_AS_SEEN = 'This changed somewhere else while Bower was tidying.';

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

  /** The modifiedTime of the latest read or answer of this file; undefined when the run never read it. */
  version(id: string): string | undefined {
    return this.seen.get(id)?.modifiedTime;
  }

  forget(id: string): void {
    this.seen.delete(id);
  }

  /** Throws a `conflict` unless the stored file is still as the run saw it (`notAsSeen`, the one check). */
  assert(target: FenceTarget, now: StoredNow | null): void {
    // A create needs its folder there and out of the Bin; where that folder is, or what it is called, is no version of
    // what it holds, so it need not have been read before.
    if (target.part === 'parent') {
      if (now && !now.trashed && now.file.folder) return;
      console.error(`Refused a write into folder ${target.id}: gone`);
      throw notAsSeenError('gone', NOT_AS_SEEN);
    }
    const seen = this.seen.get(target.id);
    // A folder's own modifiedTime is no version of what is in it; a move or a Bin keeps it '' (`expectPlace`).
    const withTime = target.part === 'target' && seen?.modifiedTime !== '';
    const reason = seen
      ? notAsSeen({ id: seen.id, name: seen.name, parents: seen.parents, ...(withTime ? { modifiedTime: seen.modifiedTime } : {}) }, now && { ...now.file, trashed: now.trashed })
      : 'never-read';
    if (reason === null) return;
    console.error(`Refused a write to ${target.part} ${target.id}: ${reason}`);
    throw notAsSeenError(reason, NOT_AS_SEEN);
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
