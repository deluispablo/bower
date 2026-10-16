/**
 * qa4-request-reload (qa-4 Codex F2): Google Drive answers a write once it has stored it, so a reload right after the
 * answer finds it. The pretend Drive answered its writes first and kept them 250 ms later, so a request shown as
 * waiting was lost by a reload in between. Every pretend write is now answered only once the tab keeps it, as a
 * reserved id and a partial upload already were (`FakeDrive.persist`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';
import { pretendDrive } from './pretend';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A Bower page over the pretend Drive this tab keeps, with its own memory (a reload starts a new one). */
const page = (drive: FakeDrive, rootId: string): DriveVault =>
  new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set() }, () => true, async () => rootId, {} as FakeDrive);

describe('qa4-request-reload: what the pretend Drive answered survives a reload', () => {
  it('AC1 request-kept-on-reload: a request whose save ended is there after a reload right away', async () => {
    // The tab's delayed save never comes on its own: only what was kept when the answer came counts.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const first = await pretendDrive('default');
    const rootId = first.rootId ?? '';
    // Positive control: the seeded folder is kept by the tab before anything is asked.
    await first.drive.persist?.();
    const words = 'Put the lease papers for Alex together';
    await page(first.drive, rootId).addRequest(words);
    // The reload: a new page reads only what the tab kept, at once, before any delayed save.
    const again = await pretendDrive('default');
    expect(again.fresh).toBe(false);
    const requests = await page(again.drive, again.rootId ?? '').requests();
    expect(requests.map((r) => r.text)).toContain(words);
  });

  /** A write set up before the persistence spy exists; `check` reads the Drive as restored from what the spy kept. */
  type Case = { write: () => Promise<unknown>; check: (kept: FakeDrive) => Promise<void> };
  type Setup = (d: FakeDrive, root: string) => Promise<Case>;
  const cases: [string, Setup][] = [
    ['createFolder', async (d, root) => {
      let id = '';
      return {
        write: async () => { id = (await d.createFolder(root, 'Kept folder')).id; },
        check: async (k) => { expect((await k.get(id)).folder).toBe(true); },
      };
    }],
    ['createText', async (d, root) => {
      let id = '';
      return {
        write: async () => { id = (await d.createText(root, 'kept.md', 'Kept')).id; },
        check: async (k) => { expect(await k.readText(id)).toBe('Kept'); },
      };
    }],
    ['upload', async (d, root) => {
      let id = '';
      return {
        write: async () => { id = (await d.upload(root, 'kept.pdf', new Blob(['%PDF kept']))).id; },
        check: async (k) => { expect(new TextDecoder().decode(await k.readBytes(id))).toBe('%PDF kept'); },
      };
    }],
    ['writeText', async (d, root) => {
      const f = await d.createText(root, 'edited.md', 'Before');
      return {
        write: () => d.writeText(f.id, 'After', f.modifiedTime),
        check: async (k) => { expect(await k.readText(f.id)).toBe('After'); },
      };
    }],
    ['update', async (d, root) => {
      const f = await d.createText(root, 'renamed.md', 'x');
      return {
        write: () => d.update(f.id, { name: 'renamed again.md' }),
        check: async (k) => { expect((await k.get(f.id)).name).toBe('renamed again.md'); },
      };
    }],
    ['trash', async (d, root) => {
      const f = await d.createText(root, 'binned.md', 'x');
      return {
        write: () => d.trash(f.id),
        check: async (k) => { expect((await k.get(f.id, { binned: true })).trashed).toBe(true); },
      };
    }],
    ['untrash', async (d, root) => {
      const f = await d.createText(root, 'back.md', 'x');
      await d.trash(f.id);
      return {
        write: () => d.untrash(f.id),
        check: async (k) => { expect((await k.get(f.id, { binned: true })).trashed).toBeUndefined(); },
      };
    }],
  ];

  /** Runs the write under a persistence that takes a moment and keeps what the Drive held when it began. */
  const underPersist = async (drive: FakeDrive, write: () => Promise<unknown>): Promise<{ keeping: number; kept: number; snapshot: string }> => {
    const seen = { keeping: 0, kept: 0, snapshot: '' };
    drive.persist = async () => {
      seen.keeping++;
      seen.snapshot = await drive.snapshot();
      await new Promise((done) => setTimeout(done, 5));
      seen.kept++;
    };
    await write();
    return seen;
  };

  it.each(cases)('AC2 answered-once-kept: %s is answered only once the pretend Drive keeps it', async (_name, setup) => {
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const prepared = await setup(drive, root); // all setup is done before the spy exists: only the target call counts
    const seen = await underPersist(drive, prepared.write);
    expect(seen.keeping).toBeGreaterThan(0);
    expect(seen.kept).toBe(seen.keeping);
    // What was kept holds the effect (kept after the write, not before it).
    await prepared.check(FakeDrive.restore(seen.snapshot));
  });

  it('AC2 answered-once-kept: a finished resumable upload is answered only once its bytes are kept', async () => {
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const [id = ''] = await drive.generateIds(1);
    const body = new Blob(['%PDF resumed']);
    const session = await drive.openResumable({ id, parentId: root, name: 'resumed.pdf', type: 'application/pdf', size: body.size });
    const seen = await underPersist(drive, () => drive.putChunk(session, 0, body, body.size));
    expect(seen.keeping).toBeGreaterThan(0);
    expect(seen.kept).toBe(seen.keeping);
    const restored = FakeDrive.restore(seen.snapshot);
    expect(new TextDecoder().decode(await restored.readBytes(id))).toBe('%PDF resumed');
  });
});
