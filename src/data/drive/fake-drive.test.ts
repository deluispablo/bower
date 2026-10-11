import { describeB1PortsContract, describeDriveContract, makeB1Drive } from './drive-contract';
import { DriveHttp } from './drive-http';
import { FakeDrive } from './fake-drive';

describeB1PortsContract('fake', (prefix) => makeB1Drive('fake', {
  restore: (snapshot, options) => FakeDrive.restore(snapshot, options),
  http: (options) => new DriveHttp(options),
}, prefix));

describeDriveContract('fake', async () => {
  const drive = new FakeDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  return { drive, root, failNext: (c) => drive.failNext(c), touch: async (id) => drive.touch(id) };
});

import { describe, expect, it } from 'vitest';

describe('keeping the pretend Drive across reloads', () => {
  it('snapshot then restore gives the same Drive, Bin and files included', async () => {
    const d = new FakeDrive();
    const root = await d.createFolder('root', 'Bower');
    const note = await d.createText(root.id, 'a.md', 'hello', { by: 'bower' });
    const bin = await d.createText(root.id, 'old.md', 'gone');
    await d.trash(bin.id);
    await d.upload(root.id, 'photo.jpg', new Blob([new Uint8Array([1, 2, 250])]));
    const back = FakeDrive.restore(await d.snapshot());
    expect(await back.listAll(root.id)).toEqual(await d.listAll(root.id));
    expect(await back.readText(note.id)).toBe('hello');
    const photo = (await back.listAll(root.id)).find((f) => f.name === 'photo.jpg');
    expect(photo?.size).toBe(3);
    await back.untrash(bin.id);
    expect(await back.readText(bin.id)).toBe('gone');
    const next = await back.createText(root.id, 'b.md', 'x');
    expect(next.id).not.toBe(note.id);
  });

  it('snapshot then restore preserves a previously stored changes page token and its feed', async () => {
    const drive = new FakeDrive();
    const root = await drive.createFolder('root', 'Bower');
    const token = await drive.getStartPageToken();
    const note = await drive.createText(root.id, 'a.md', 'hello');
    const expected = await drive.listChanges(token);
    expect(expected.changes.map((change) => change.fileId)).toEqual([note.id]);
    const restored = FakeDrive.restore(await drive.snapshot());
    await expect(restored.listChanges(token)).resolves.toEqual(expected);
  });

  it('tells a listener after each change', async () => {
    const d = new FakeDrive();
    let n = 0;
    d.onChange = () => n++;
    await d.createFolder('root', 'Bower');
    await d.listAll('root');
    expect(n).toBe(1);
  });

  it('big files keep their place across a reload, not their bytes', async () => {
    const d = new FakeDrive();
    const root = await d.createFolder('root', 'Bower');
    await d.upload(root.id, 'photo.jpg', new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'image/jpeg' }));
    const json = await d.snapshot();
    expect(json.length).toBeLessThan(100_000);
    const back = FakeDrive.restore(json);
    const photo = (await back.listAll(root.id)).find((f) => f.name === 'photo.jpg');
    expect(photo?.size).toBe(3 * 1024 * 1024);
  });
});

describe('a lost reply to an update or a text write', () => {
  it('the change lands, the answer is lost once', async () => {
    const d = new FakeDrive();
    const root = await d.createFolder('root', 'Bower');
    const note = await d.createText(root.id, 'A.md', 'one');
    d.loseNextReply();
    await expect(d.update(note.id, { name: 'B.md' })).rejects.toMatchObject({ code: 'offline' });
    const now = await d.get(note.id);
    expect(now.name).toBe('B.md');
    d.loseNextReply();
    await expect(d.writeText(note.id, 'two', now.modifiedTime)).rejects.toMatchObject({ code: 'offline' });
    expect(await d.readText(note.id)).toBe('two');
    await expect(d.update(note.id, { name: 'C.md' })).resolves.toMatchObject({ name: 'C.md' });
  });
});
