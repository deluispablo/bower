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

  it.each([
    { media: 'legacy text', content: { text: 'é🙂' }, size: 3, expected: 6 },
    { media: 'legacy blob', content: { b64: 'w6nwn5mC', type: 'text/plain' }, size: 3, expected: 6 },
    { media: 'empty text', content: { text: '' }, size: 3, expected: 0 },
    { media: 'text without a recorded size', content: { text: 'é🙂' }, size: undefined, expected: undefined },
    { media: 'absent', content: null, size: 3, expected: 3 },
    { media: 'big placeholder', content: { big: true, type: 'text/plain' }, size: 262145, expected: 262145 },
    { media: 'old placeholder without big marker', content: { b64: 'QSBiaWcgZmlsZSwga2VwdCBieSBuYW1lIG9ubHkgb24gdGhlIHByZXRlbmQgRHJpdmUu', type: 'text/plain' }, size: 262145, expected: 262145 },
  ])('restores size from $media and preserves it through rename and listChanges', async ({ content, size, expected }) => {
    const drive = FakeDrive.restore(JSON.stringify({ v: 1, seq: 1, last: 0, files: [
      { meta: { id: 'root', name: 'My Drive', folder: true, parents: [], modifiedTime: new Date(0).toISOString() }, trashed: false, content: null },
      { meta: { id: 'f1', name: 'a.md', folder: false, parents: ['root'], modifiedTime: new Date(0).toISOString(), size }, trashed: false, content },
    ] }));
    expect((await drive.get('root')).size).toBeUndefined();
    expect((await drive.get('f1')).size).toBe(expected);
    const token = await drive.getStartPageToken();
    const renamed = await drive.update('f1', { name: 'b.md' });
    expect(renamed.name).toBe('b.md');
    expect(renamed.size).toBe(expected);
    const feed = await drive.listChanges(token);
    expect(feed.changes).toEqual([
      { fileId: 'f1', removed: false, file: expect.objectContaining({ name: 'b.md' }) },
    ]);
    expect(feed.changes[0]?.file?.size).toBe(expected);
    expect((await FakeDrive.restore(await drive.snapshot()).get('f1')).size).toBe(expected);
  });

  it('preserves contemporary byte sizes and media across reloads', async () => {
    const drive = new FakeDrive();
    const text = await drive.createText('root', 'a.md', 'é🙂');
    const blob = await drive.upload('root', 'b.txt', new Blob(['é🙂'], { type: 'text/plain' }));
    expect(text.size).toBe(6);
    expect(blob.size).toBe(6);
    const snapshot = await drive.snapshot();
    const restored = FakeDrive.restore(snapshot);
    expect(await restored.snapshot()).toBe(snapshot);
    expect(await restored.readText(text.id)).toBe('é🙂');
    expect(Array.from(await restored.readBytes(blob.id))).toEqual([195, 169, 240, 159, 153, 130]);
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
