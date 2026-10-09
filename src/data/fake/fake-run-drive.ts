/**
 * The pretend Drive as the apply engine's adapter (`spine/engine.ts`, `RunDrive`): what `RunnerDrive` is on Google
 * Drive, here on `FakeDrive`, so the fake run service applies a run exactly as the runner does. Only the boundary
 * differs: the fake Drive's fenced check runs in one step with the change (`FakeDrive.fenced`), so the attempt's
 * authority and the still-as-seen check (`SeenFiles`, the runner's own) see what is stored at that instant.
 */
import type { DriveFile, FencedDrive, RunDrive, StoredEvidence } from '../drive/drive-api';
import type { FakeDrive } from '../drive/fake-drive';
import { destinationOf, SeenFiles, targetOf } from '../drive/seen-files';
import type { RecordReads } from '../spine/records';
import { BowerError } from '../types';

export class FakeRunDrive implements RunDrive {
  readonly provenance = 'fake-stored';
  private readonly seen = new SeenFiles();

  /** `authority` throws when this attempt may no longer write (a newer claim, a revoked session). */
  constructor(private readonly drive: FakeDrive, private readonly authority: () => void) {}

  /** This attempt's fenced writes: its authority and the target still as this run saw it, in the step of the change. */
  fenced(): FencedDrive {
    const w = this.drive.fenced((peek, call) => {
      this.authority();
      const target = targetOf(call);
      const into = destinationOf(call);
      if (into) this.seen.assert(into, peek(into.id));
      this.seen.assert(target, peek(target.id));
    });
    return this.seen.wrap({
      ...w,
      generateIds: async (count) => {
        this.authority();
        return w.generateIds(count);
      },
    });
  }

  /** The run records' reads, kept as seen so a record's write into a folder it listed passes the fence. */
  reads(): RecordReads {
    return {
      listAll: async (rootId) => (await this.drive.listAll(rootId)).map((f) => this.seen.note(f)),
      readBytes: (id) => this.drive.readBytes(id),
      get: (id, opts) => this.drive.get(id, opts),
    };
  }

  async recheck(id: string): Promise<DriveFile | null> {
    try {
      return this.seen.note(await this.drive.get(id));
    } catch (e) {
      if (e instanceof BowerError && e.code === 'not-found') return null;
      throw e;
    }
  }

  async evidence(id: string): Promise<StoredEvidence | null> {
    const ev = await this.drive.evidence(id);
    if (ev && !ev.trashed) this.seen.note(ev.file);
    return ev;
  }

  readBytes(id: string): Promise<Uint8Array> {
    return this.drive.readBytes(id);
  }

  async list(parentId: string): Promise<DriveFile[]> {
    return (await this.drive.listAll(parentId)).filter((f) => f.parents.includes(parentId)).map((f) => this.seen.note(f));
  }

  expectSeen(seen: { fileId: string; name: string; parents: string[]; folder: boolean; modifiedTime: string }, withTime = false): void {
    this.seen.expectPlace({ id: seen.fileId, name: seen.name, parents: seen.parents, folder: seen.folder, modifiedTime: seen.modifiedTime, createdTime: '' }, withTime);
  }
}
