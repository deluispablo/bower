/**
 * What any `DriveApi` must do, the fake and the HTTP client alike, so the
 * fake can stand in for Google Drive in every other test.
 */
import { describe, expect, it } from 'vitest';
import type { DriveApi } from './drive-api';

export interface DriveUnderTest {
  drive: DriveApi;
  /** A folder to work in. */
  root: string;
  /** Makes the next call fail with this code. */
  failNext(code: 'offline' | 'auth' | 'not-found'): void;
  /** Changes a file as another device would. */
  touch(id: string): Promise<void>;
}

export function describeDriveContract(name: string, make: () => Promise<DriveUnderTest>): void {
  describe(`drive contract: ${name}`, () => {
    it('create then listAll sees it', async () => {
      const { drive, root } = await make();
      const f = await drive.createFolder(root, 'Projects');
      const n = await drive.createText(f.id, 'Plan.md', 'hello', { by: 'bower' });
      const all = await drive.listAll(root);
      expect(all.map((x) => x.name).sort()).toEqual(['Plan.md', 'Projects']);
      expect(all.find((x) => x.id === n.id)).toMatchObject({ folder: false, parents: [f.id], appProperties: { by: 'bower' } });
      expect(all.find((x) => x.id === f.id)?.folder).toBe(true);
      expect(await drive.readText(n.id)).toBe('hello');
    });

    it('writeText with the right modifiedTime writes', async () => {
      const { drive, root } = await make();
      const n = await drive.createText(root, 'a.md', 'one');
      const after = await drive.writeText(n.id, 'two', n.modifiedTime);
      expect(await drive.readText(n.id)).toBe('two');
      expect(after.modifiedTime >= n.modifiedTime).toBe(true);
    });

    it('writeText with a stale modifiedTime rejects conflict', async () => {
      const u = await make();
      const n = await u.drive.createText(u.root, 'a.md', 'one');
      await u.touch(n.id);
      await expect(u.drive.writeText(n.id, 'two', n.modifiedTime)).rejects.toMatchObject({ code: 'conflict' });
      expect(await u.drive.readText(n.id)).not.toBe('two');
    });

    it('update renames and moves between parents', async () => {
      const { drive, root } = await make();
      const a = await drive.createFolder(root, 'A');
      const b = await drive.createFolder(root, 'B');
      const n = await drive.createText(a.id, 'x.md', 'x');
      const moved = await drive.update(n.id, { name: 'y.md', addParent: b.id, removeParent: a.id });
      expect(moved).toMatchObject({ name: 'y.md', parents: [b.id] });
      expect((await drive.get(n.id)).parents).toEqual([b.id]);
    });

    it('update sets and removes appProperties', async () => {
      const { drive, root } = await make();
      const n = await drive.createText(root, 'x.md', 'x', { by: 'bower', bowerNew: '1' });
      const after = await drive.update(n.id, { appProperties: { bowerNew: null, kind: 'note' } });
      expect(after.appProperties).toEqual({ by: 'bower', kind: 'note' });
    });

    it('trash hides from listAll and untrash brings back', async () => {
      const { drive, root } = await make();
      const f = await drive.createFolder(root, 'Old');
      await drive.createText(f.id, 'in.md', 'x');
      await drive.trash(f.id);
      expect(await drive.listAll(root)).toEqual([]);
      await drive.untrash(f.id);
      expect((await drive.listAll(root)).map((x) => x.name).sort()).toEqual(['Old', 'in.md']);
    });

    it('same names may coexist in one folder', async () => {
      const { drive, root } = await make();
      await drive.createText(root, 'Lease.pdf', 'a');
      await drive.createText(root, 'Lease.pdf', 'b');
      expect((await drive.listAll(root)).filter((x) => x.name === 'Lease.pdf')).toHaveLength(2);
    });

    it('upload stores a blob and reports progress', async () => {
      const { drive, root } = await make();
      const seen: number[] = [];
      const f = await drive.upload(root, 'photo.jpg', new Blob(['jpeg bytes']), (p) => seen.push(p));
      expect(f).toMatchObject({ name: 'photo.jpg', folder: false, size: 10 });
      expect(seen.at(-1)).toBe(1);
    });

    it('fullText finds text inside files only under root', async () => {
      const { drive, root } = await make();
      const outside = await drive.createFolder(root, 'Outside');
      const inside = await drive.createFolder(root, 'Inside');
      await drive.createText(inside.id, 'a.md', 'The rent is £1,450 a month');
      await drive.createText(outside.id, 'b.md', 'The rent is £1,450 too');
      const hits = await drive.fullText(inside.id, '£1,450');
      expect(hits.map((h) => h.name)).toEqual(['a.md']);
    });

    it('get of a missing id rejects not-found', async () => {
      const { drive } = await make();
      await expect(drive.get('nope')).rejects.toMatchObject({ code: 'not-found' });
    });

    it('failNext makes the next call reject with that code', async () => {
      const u = await make();
      u.failNext('offline');
      await expect(u.drive.listAll(u.root)).rejects.toMatchObject({ code: 'offline' });
      await expect(u.drive.listAll(u.root)).resolves.toEqual([]);
    });
  });
}
