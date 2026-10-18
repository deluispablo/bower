// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { RunRecords } from './records';

async function seeded() {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const sys = await drive.createFolder(root, '.bower');
  await drive.createFolder(sys.id, 'piles');
  return { drive, root, records: new RunRecords(drive, root), w: drive.fenced(() => {}) };
}

describe('F10 putAll', () => {
  it('reads every item before overlapping missing records, with one listing', async () => {
    const { drive, root, records, w } = await seeded();
    await records.put(w, 'piles', 'present', 'same');
    const list = vi.spyOn(drive, 'listAll');
    const read = vi.spyOn(drive, 'readBytes');
    const pending: Array<() => void> = [];
    const started: string[] = [];
    const createText: typeof w.createText = async (...args) => {
      started.push(args[1]);
      expect(list).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledTimes(1);
      await new Promise<void>((resolve) => pending.push(resolve));
      return w.createText(...args);
    };
    const saving = records.putAll({ ...w, createText }, 'piles', [
      { name: 'present', text: 'same' }, { name: 'one', text: '1' }, { name: 'two', text: '2' },
    ]);
    try { await vi.waitFor(() => expect(started).toEqual(['one', 'two'])); }
    finally { pending.forEach((done) => done()); }
    await saving;
    expect((await drive.listAll(root)).filter((f) => !f.folder).map((f) => f.name)).toEqual(['present', 'one', 'two']);
  });

  it('put delegates to putAll with one item', async () => {
    const { records, w } = await seeded();
    const putAll = vi.spyOn(records, 'putAll').mockResolvedValue();
    const stamp = { bowerPile: 'pile-1' };
    await records.put(w, 'piles', 'one', '1', stamp);
    expect(putAll).toHaveBeenCalledExactlyOnceWith(w, 'piles', [{ name: 'one', text: '1', stamp }]);
  });

  it('refuses conflicting bytes before any missing record is written', async () => {
    const { records, w } = await seeded();
    await records.put(w, 'piles', 'present', 'same');
    const createText = vi.fn(w.createText);
    await expect(records.putAll({ ...w, createText }, 'piles', [{ name: 'missing', text: '1' }, { name: 'present', text: 'other' }])).rejects.toMatchObject({ code: 'conflict' });
    expect(createText).not.toHaveBeenCalled();
  });

  it.each(['same', 'different'])('refuses duplicate names with %s bytes before any write', async (text) => {
    const { records, w } = await seeded();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const createText = vi.fn(w.createText);
    const createFolder = vi.fn(w.createFolder);
    try {
      await expect(records.putAll({ ...w, createText, createFolder }, { runId: 'new-run' }, [
        { name: 'duplicate', text: 'same' }, { name: 'duplicate', text },
      ])).rejects.toMatchObject({ name: 'BowerError', code: 'conflict' });
      expect(createText).not.toHaveBeenCalled();
      expect(createFolder).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('duplicate'));
    } finally { error.mockRestore(); }
  });

  it('waits for all siblings and rejects in start order', async () => {
    const { records, w } = await seeded();
    const releases: Array<() => void> = [];
    const first = new Error('first');
    const second = new Error('second');
    const createText: typeof w.createText = async (...args) => {
      if (args[1] === 'one') { await new Promise<void>((done) => releases.push(done)); throw first; }
      throw second;
    };
    let ended = false;
    const saving = records.putAll({ ...w, createText }, 'piles', [{ name: 'one', text: '1' }, { name: 'two', text: '2' }]);
    const checked = expect(saving).rejects.toBe(first);
    void saving.then(() => { ended = true; }, () => { ended = true; });
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    expect(ended).toBe(false);
    releases.forEach((done) => done());
    await checked;
  });
});
