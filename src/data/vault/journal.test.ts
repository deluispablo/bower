import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { Journal } from './journal';
import { driveError } from '../drive/drive-api';
import { tidyUp } from '@/testing/tidy-up';

let drive: FakeDrive;
let root: string;
let journal: Journal;
let changes: string;

beforeEach(async () => {
  localStorage.clear();
  let now = Date.parse('2026-10-04T10:00:00Z');
  drive = new FakeDrive({ clock: () => (now += 1000) });
  root = (await drive.createFolder('root', 'Bower')).id;
  const bower = (await drive.createFolder(root, '.bower')).id;
  changes = (await drive.createFolder(bower, 'changes')).id;
  journal = new Journal(drive, { owner: async () => root, folder: async () => changes, files: async () => (await drive.listAll(changes)).filter((f) => !f.folder) }, 'device-a');
});

describe('the change journal', () => {
  it('record writes one file per change', async () => {
    await journal.record('move', 'Moved Lease draft to Areas', { path: 'Areas/Lease draft.pdf' });
    await journal.record('rule', 'New rule: "dentist goes in health"', { path: 'Rules.md', text: 'dentist goes in health' });
    const files = [...drive.dump(root).entries()].filter(([p]) => p.startsWith('.bower/changes/'));
    expect(files).toHaveLength(2);
    expect(files[0]?.[0]).toMatch(/^\.bower\/changes\/\d{4}-\d{2}-\d{2}T\d\d-\d\d-\d\d\.\d{3}Z-[a-z0-9]{6}\.json$/);
    const rec = JSON.parse(files[1]?.[1] ?? '{}') as Record<string, unknown>;
    expect(rec).toMatchObject({ v: 1, kind: 'rule', text: 'dentist goes in health', device: 'device-a', path: 'Rules.md' });
  });

  it('list is oldest first and carries the extras', async () => {
    await journal.record('move', 'one');
    await journal.record('answer', 'two', { questionId: 'q1', text: 'yes' });
    const all = await journal.list();
    expect(all.map((r) => r.what)).toEqual(['one', 'two']);
    expect(all[1]).toMatchObject({ kind: 'answer', questionId: 'q1', text: 'yes' });
  });

  it('remove puts only that file in the Bin', async () => {
    const a = await journal.record('move', 'one');
    await journal.record('move', 'two');
    await journal.remove(a.id);
    expect((await journal.list()).map((r) => r.what)).toEqual(['two']);
  });

  it('a file that is not a journal record is skipped', async () => {
    const changes = await drive.listAll(root).then((all) => all.find((f) => f.name === 'changes'));
    await drive.createText(changes?.id ?? '', 'notes.txt', 'not json');
    await journal.record('move', 'one');
    expect((await journal.list()).map((r) => r.what)).toEqual(['one']);
  });
});

describe('when Drive does not answer', () => {
  it.each(['direct', 'archive'])("a waiting change is acknowledged by its line key, never by a lookalike's name or contents (%s)", async (location) => {
    const archive = (await drive.createFolder(changes, 'archive')).id;
    const files = vi.fn(async (_fresh?: boolean, archived?: boolean) => (await drive.listAll(changes)).filter((f) => !f.folder && (archived || f.parents.includes(changes))));
    journal = new Journal(drive, { owner: async () => root, folder: async () => changes, files }, 'device-a');
    const create = vi.spyOn(drive, 'createText').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const rec = await journal.record('rule', 'Keep receipts together', {
      path: 'Rules.md', from: 'Inbox', text: 'Keep receipts together', questionId: 'QUESTION_ID', fileId: 'FILE_ID', removes: 'Old rule',
    });
    const key = `bower:outbox:${root}`;
    const waiting = localStorage.getItem(key);
    // A file with the line's name and fields but not its key is not the line: it is never taken by its name or contents.
    const lookalike = await drive.createText(location === 'direct' ? changes : archive, `${rec.id}.json`, JSON.stringify(rec));
    create.mockClear();
    const read = vi.spyOn(drive, 'readText');
    await expect(journal.flush()).resolves.toBeUndefined();
    expect(files).toHaveBeenLastCalledWith(true, true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key)).toBeNull();
    const sent = (await drive.listAll(changes)).filter((f) => !f.folder && f.id !== lookalike.id);
    expect(sent.map((f) => f.appProperties?.bowerLine)).toEqual([rec.id]);
    // A copy that carries the line's key, wherever it is, is the line: acknowledged without a read and never sent again.
    localStorage.setItem(key, waiting ?? '');
    await drive.update(sent[0]?.id ?? '', location === 'direct' ? {} : { addParent: archive, removeParent: changes });
    create.mockClear();
    await expect(journal.flush()).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('a rule is not reported saved when Drive and the outbox both fail', async () => {
    const create = drive.createText.bind(drive);
    drive.createText = async () => { throw new TypeError('Failed to fetch'); };
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await expect(journal.record('rule', 'Keep receipts together', { text: 'Keep receipts together' })).rejects.toMatchObject({ code: 'unknown', message: expect.stringMatching(/not safely saved.*keep this page open/i) });
    expect((await journal.list()).map((r) => r.what)).toContain('Keep receipts together');
    set.mockRestore();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    await expect(journal.record('request', 'Find loose notes')).rejects.toMatchObject({ code: 'unknown' });
    await expect(journal.flush()).rejects.toMatchObject({ code: 'unknown' });
    get.mockRestore();
    const key = `bower:outbox:${root}`;
    localStorage.setItem(key, '{broken');
    await expect(journal.record('rule', 'Keep original files')).rejects.toMatchObject({ code: 'unknown' });
    expect(localStorage.getItem(key)).toBe('{broken');
    await expect(journal.flush()).rejects.toMatchObject({ code: 'unknown' });
    const malformed = JSON.stringify([{ v: 1, id: 'BAD_ID', device: 'device-a', at: Date.now(), what: 'Old rule', kind: 'rule', text: {} }]);
    localStorage.setItem(key, malformed);
    await expect(journal.record('rule', 'Keep tasks separate')).rejects.toMatchObject({ code: 'unknown' });
    expect(localStorage.getItem(key)).toBe(malformed);
    localStorage.removeItem(key);
    await expect(journal.record('move', 'Moved a note', { path: 'Areas/Note.md', fileId: 'NOTE_ID' })).resolves.toMatchObject({ kind: 'move' });
    drive.createText = create;
    await journal.flush();
    expect((await journal.list()).map((r) => r.what)).toEqual(['Keep receipts together', 'Find loose notes', 'Keep original files', 'Keep tasks separate', 'Moved a note']);
  });

  it('unreadable journal files keep their bytes and stop a fake tidy-up', async () => {
    for (const text of ['{broken', JSON.stringify({ v: 1, id: 'BAD_ID', device: 'device-a', at: Date.now(), what: 'Old rule', kind: 'rule', text: {} })]) {
      const file = await drive.createText(changes, 'bad.json', text);
      await expect(journal.list()).rejects.toMatchObject({ code: 'unknown', message: 'Bower could not read your changes.' });
      // On the B path an unreadable line stays where it is, uncaptured (TL-P2-23): with nothing else, the run refuses.
      await expect(tidyUp(drive, root, 'instructions')).rejects.toMatchObject({ code: 'conflict', message: 'There is nothing new for Bower to read.' });
      expect(await drive.readText(file.id)).toBe(text);
      expect((await drive.get(file.id)).parents).toEqual([changes]);
      await drive.trash(file.id);
    }
  });

  it('outbox: a line that cannot be written now is kept and sent with the next one', async () => {
    const real = drive.createText.bind(drive);
    let down = true;
    drive.createText = async (parent, name, text, props) => {
      if (down) throw new TypeError('Failed to fetch');
      return real(parent, name, text, props);
    };
    await journal.record('move', 'one');
    expect((await journal.list()).map((r) => r.what)).toEqual(['one']);
    down = false;
    await journal.record('move', 'two');
    const files = [...drive.dump(root).keys()].filter((p) => p.startsWith('.bower/changes/'));
    expect(files).toHaveLength(2);
    expect((await journal.list()).map((r) => r.what)).toEqual(['one', 'two']);
  });

  it('a line written twice (its answer lost) shows once', async () => {
    const real = drive.createText.bind(drive);
    let lose = true;
    drive.createText = async (parent, name, text, props) => {
      const f = await real(parent, name, text, props);
      if (lose) {
        lose = false;
        throw new TypeError('Failed to fetch');
      }
      return f;
    };
    await journal.record('move', 'one');
    expect((await journal.list()).map((r) => r.what)).toEqual(['one']);
  });

  it('an archived journal line is still recovered exactly once', async () => {
    const archive = (await drive.createFolder(changes, 'archive')).id;
    journal = new Journal(drive, { owner: async () => root, folder: async () => changes, files: async () => (await drive.listAll(changes)).filter((f) => !f.folder) }, 'device-a');
    const real = drive.createText.bind(drive);
    let lose = true;
    // The line lands and its answer is lost: it waits in the outbox.
    drive.createText = async (parent, name, text, props) => {
      const f = await real(parent, name, text, props);
      if (lose) {
        lose = false;
        throw new TypeError('Failed to fetch');
      }
      return f;
    };
    const one = await journal.record('move', 'one');
    expect(localStorage.getItem(`bower:outbox:${root}`)).toContain(one.id);
    // A tidy-up archives it, stamping its own operation over the line's bowerOp.
    const landed = (await drive.listAll(changes)).filter((f) => !f.folder);
    expect(landed).toHaveLength(1);
    const line = landed[0];
    if (!line) throw new Error('no line');
    await drive.update(line.id, { addParent: archive, removeParent: changes, appProperties: { bowerOp: 'RUN_STAMP' } });
    const read = vi.spyOn(drive, 'readText');
    await journal.record('move', 'two');
    // Found by its own key, which the archive move kept: never sent again, nor read back by its name and fields.
    const lines = (await drive.listAll(changes)).filter((f) => !f.folder);
    expect((await drive.get(line.id)).appProperties).toMatchObject({ bowerLine: one.id, bowerOp: 'RUN_STAMP' });
    expect(lines.filter((f) => f.appProperties?.bowerLine === one.id)).toHaveLength(1);
    expect(lines).toHaveLength(2);
    expect(read).not.toHaveBeenCalled();
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
  });

  it('outbox: a line whose answer was lost is not sent twice', async () => {
    const real = drive.createText.bind(drive);
    let lose = true;
    drive.createText = async (parent, name, text, props) => {
      const f = await real(parent, name, text, props);
      if (lose) {
        lose = false;
        throw new TypeError('Failed to fetch');
      }
      return f;
    };
    await journal.record('move', 'one');
    await journal.record('move', 'two');
    expect((await drive.listAll(changes)).filter((f) => !f.folder)).toHaveLength(2);
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
  });

  it('outbox: a line kept while another is being sent is not lost, nor sent twice', async () => {
    const real = drive.createText.bind(drive);
    let failOne = true;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    drive.createText = async (parent, name, text, props) => {
      if (text.includes('"one"')) {
        if (failOne) throw new TypeError('Failed to fetch');
        await gate;
      }
      if (text.includes('"two"')) throw new TypeError('Failed to fetch');
      return real(parent, name, text, props);
    };
    await journal.record('move', 'one');
    failOne = false;
    const flushing = journal.flush();
    await new Promise((r) => setTimeout(r, 0));
    const recording = journal.record('move', 'two');
    release();
    await flushing;
    await recording;
    expect((await journal.list()).map((r) => r.what)).toEqual(['one', 'two']);
    expect((await drive.listAll(changes)).filter((f) => !f.folder)).toHaveLength(1);
  });
});

describe('c2-create-by-id: a change taken back', () => {
  it('taking a change back whose Bin answer was lost is resolved by its stamp', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = await journal.record('move', 'one');
    const trash = drive.trash.bind(drive);
    let lost = 0;
    drive.trash = async (...x: Parameters<FakeDrive['trash']>) => {
      const out = await trash(...x);
      if (lost++ === 0) throw driveError('offline');
      return out;
    };
    await expect(journal.remove(a.id)).resolves.toBeUndefined();
    expect(lost).toBe(1);
    expect((await journal.list()).map((r) => r.what)).toEqual([]);
  });
});

describe('c2-create-by-id fix round: a waiting line', () => {
  it('a journal line keeps its reserved id until confirmed and needs no key lookup', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const files = vi.fn(async () => (await drive.listAll(changes)).filter((f) => !f.folder));
    journal = new Journal(drive, { owner: async () => root, folder: async () => changes, files }, 'device-a');
    const create = drive.createText.bind(drive);
    const get = drive.get.bind(drive);
    const sentWith: Array<string | undefined> = [];
    let lose = true;
    // The line lands and its answer is lost; the read by its id that follows gets no answer either.
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      sentWith.push(a[4]);
      const f = await create(...a);
      if (lose) {
        lose = false;
        drive.get = async () => {
          drive.get = get;
          throw driveError('offline');
        };
        throw driveError('offline');
      }
      return f;
    };
    const one = await journal.record('move', 'one');
    expect(localStorage.getItem(`bower:outbox:${root}`)).toContain(one.id);
    // A tidy-up archives it meanwhile, stamping its own operation on it.
    const archive = (await drive.createFolder(changes, 'archive')).id;
    const line = (await drive.listAll(changes)).find((f) => f.name === `${one.id}.json`);
    await drive.update(line?.id ?? '', { addParent: archive, removeParent: changes, appProperties: { bowerOp: 'RUN_STAMP' } });
    files.mockClear();
    await expect(journal.flush()).resolves.toBeUndefined();
    // Sent again with the id reserved for it, and found by that id: no listing, no second line.
    expect(sentWith).toHaveLength(2);
    expect(sentWith[0]).toBeDefined();
    expect(sentWith[1]).toBe(sentWith[0]);
    expect(files).not.toHaveBeenCalled();
    expect((await drive.listAll(changes)).filter((f) => f.name === `${one.id}.json`)).toHaveLength(1);
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
  });
});
