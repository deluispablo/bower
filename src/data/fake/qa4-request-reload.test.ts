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

  it.each([
    ['createFolder', (d: FakeDrive, root: string) => d.createFolder(root, 'Kept folder')],
    ['createText', (d: FakeDrive, root: string) => d.createText(root, 'kept.md', 'Kept')],
    ['upload', (d: FakeDrive, root: string) => d.upload(root, 'kept.pdf', new Blob(['%PDF kept']))],
    ['writeText', async (d: FakeDrive, root: string) => {
      const f = await d.createText(root, 'edited.md', 'Before');
      return d.writeText(f.id, 'After', f.modifiedTime);
    }],
    ['update', async (d: FakeDrive, root: string) => d.update((await d.createText(root, 'renamed.md', 'x')).id, { name: 'renamed again.md' })],
    ['trash', async (d: FakeDrive, root: string) => d.trash((await d.createText(root, 'binned.md', 'x')).id)],
    ['untrash', async (d: FakeDrive, root: string) => {
      const f = await d.createText(root, 'back.md', 'x');
      await d.trash(f.id);
      return d.untrash(f.id);
    }],
  ])('AC2 answered-once-kept: %s is answered only once the pretend Drive keeps it', async (_name, write) => {
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    let keeping = 0;
    let kept = 0;
    drive.persist = async () => {
      keeping++;
      await new Promise((done) => setTimeout(done, 5));
      kept++;
    };
    keeping = 0;
    kept = 0;
    await write(drive, root);
    expect(keeping).toBeGreaterThan(0);
    expect(kept).toBe(keeping);
  });
});
