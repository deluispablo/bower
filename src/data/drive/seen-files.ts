/**
 * What the run saw of each file, and the check before each write that it is
 * still so: the target's name, parents and Bin state, and (for a content
 * write) its modifiedTime. A file the run never read is never written.
 *
 * A create's folder, and the folder a move goes into, are checked only for
 * being there, a folder, and out of the Bin: where it is and what it is called
 * are no version of what is in it. Both are read right before the send, as the
 * target is, never kept from an earlier read.
 *
 * The fence of both apply engine adapters (`RunnerDrive` on Google Drive,
 * `FakeRunDrive` on the pretend one), so both refuse the same writes.
 */
import { checkStillAsSeen, notAsSeenError, readForFence } from '../contracts/still-as-seen';
import type { DriveFile, FencedCall, FencedDrive } from './drive-api';
import { isNoAnswer } from './transport';

/** A file as stored at the moment of the check; null when it is gone. */
export interface StoredNow {
  file: DriveFile;
  trashed: boolean;
}

/** The file a write's check reads: the file itself, the folder a create goes into, or the folder a move goes into. */
export interface FenceTarget {
  id: string;
  part: 'target' | 'parent' | 'destination';
}

export const targetOf = (call: FencedCall): FenceTarget => ('id' in call ? { id: call.id, part: 'target' } : { id: call.parentId, part: 'parent' });

/** The folder a move puts its target into, read by the same fence right before the send; null for any other write. */
export const destinationOf = (call: FencedCall): FenceTarget | null =>
  call.op === 'update' && call.patch.addParent !== undefined ? { id: call.patch.addParent, part: 'destination' } : null;

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
    // A create or a move needs its folder there and out of the Bin; where that folder is, or what it is called, is no
    // version of what it holds, so it need not have been read before. A move's folder gone is told by its code.
    if (target.part !== 'target') {
      if (now && !now.trashed && now.file.folder) return;
      console.error(`Refused a write into folder ${target.id}: gone`);
      throw notAsSeenError('gone', NOT_AS_SEEN, target.part === 'destination' ? 'not-found' : 'conflict');
    }
    const seen = this.seen.get(target.id);
    if (!seen) {
      console.error(`Refused a write to ${target.part} ${target.id}: never-read`);
      throw notAsSeenError('never-read', NOT_AS_SEEN);
    }
    // A folder's own modifiedTime is no version of what is in it; a move or a Bin keeps it '' (`expectPlace`).
    const withTime = seen.modifiedTime !== '';
    const stored = now && { ...now.file, trashed: now.trashed };
    checkStillAsSeen({ id: seen.id, name: seen.name, parents: seen.parents, ...(withTime ? { modifiedTime: seen.modifiedTime } : {}) }, () => stored, NOT_AS_SEEN, { what: `${target.part} ${target.id}` });
  }

  /**
   * A read the check needs, right before the send: one that got no answer is no change found, so it is thrown as not
   * read (`notReadError`), never as a refusal nor as a lost write's answer to read back; the attempt stops for recovery.
   * Any other error (a revoked token, a newer attempt) is thrown as it is.
   */
  read<T>(reading: Promise<T>): Promise<T> {
    return readForFence(reading, isNoAnswer);
  }

  /** The same writes, keeping what each answer says, and forgetting a file put in the Bin. */
  wrap(writes: FencedDrive): FencedDrive {
    return {
      generateIds: (count) => writes.generateIds(count),
      createFolder: async (parentId, name, appProperties, id) => this.note(await writes.createFolder(parentId, name, appProperties, id)),
      createText: async (parentId, name, text, appProperties, id) => this.note(await writes.createText(parentId, name, text, appProperties, id)),
      update: async (id, patch) => this.note(await writes.update(id, patch)),
      trash: async (id, appProperties) => {
        const binned = await writes.trash(id, appProperties);
        this.forget(id);
        return binned;
      },
      writeText: async (id, text, ifModified, appProperties) => this.note(await writes.writeText(id, text, ifModified, appProperties)),
    };
  }
}
