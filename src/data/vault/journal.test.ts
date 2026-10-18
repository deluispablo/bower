import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { FAILED_KEY, Journal } from './journal';
import { forgetThisPerson } from '../device';
import { driveError } from '../drive/drive-api';
import { DriveHttp } from '../drive/drive-http';
import type { BowerError } from '../types';
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

  it('retract never deletes a sent line: it says sent, and the line stays (TL-P4-27 addendum 4 (3))', async () => {
    const a = await journal.record('move', 'one');
    await journal.record('move', 'two');
    await expect(journal.retract(a.id)).resolves.toBe('sent');
    expect((await journal.list()).map((r) => r.what)).toEqual(['one', 'two']);
  });

  it('retract drops a line never sent, and it is never sent after', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(drive, 'generateIds').mockRejectedValueOnce(driveError('offline'));
    const a = await journal.record('move', 'one');
    await expect(journal.retract(a.id)).resolves.toBe('dropped');
    await journal.flush();
    expect((await journal.list()).map((r) => r.what)).toEqual([]);
    expect((await drive.listAll(changes)).filter((f) => !f.folder)).toEqual([]);
  });

  it('a file that is not a journal record is skipped', async () => {
    const changes = await drive.listAll(root).then((all) => all.find((f) => f.name === 'changes'));
    await drive.createText(changes?.id ?? '', 'notes.txt', 'not json');
    await journal.record('move', 'one');
    expect((await journal.list()).map((r) => r.what)).toEqual(['one']);
  });
});

describe('when Drive does not answer', () => {
  // Named in journal-ack-content's verify: the line's key is now the id reserved for its file, kept with it in the outbox.
  it.each(['direct', 'archive'])("a waiting change is acknowledged by its line key, never by a lookalike's name or contents (%s)", async (location) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const archive = (await drive.createFolder(changes, 'archive')).id;
    const files = vi.fn(async () => (await drive.listAll(changes)).filter((f) => !f.folder));
    journal = new Journal(drive, { owner: async () => root, folder: async () => changes, files }, 'device-a');
    const create = vi.spyOn(drive, 'createText').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const rec = await journal.record('rule', 'Keep receipts together', {
      path: 'Rules.md', from: 'Inbox', text: 'Keep receipts together', questionId: 'QUESTION_ID', fileId: 'FILE_ID', removes: 'Old rule',
    });
    const key = `bower:outbox:${root}`;
    const waiting = localStorage.getItem(key);
    const reserved = create.mock.calls[0]?.[4];
    expect(reserved).toBeDefined();
    // A file with the line's name and fields but not its id is not the line: it is never taken by its name or contents.
    const lookalike = await drive.createText(location === 'direct' ? changes : archive, `${rec.id}.json`, JSON.stringify(rec));
    create.mockClear();
    const read = vi.spyOn(drive, 'readText');
    await expect(journal.flush()).resolves.toBeUndefined();
    expect(files).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key)).toBeNull();
    const sent = (await drive.listAll(changes)).filter((f) => !f.folder && f.id !== lookalike.id);
    expect(sent.map((f) => f.id)).toEqual([reserved]);
    // The line itself, wherever it is now, is found by its id: acknowledged without a read and never made twice.
    localStorage.setItem(key, waiting ?? '');
    await drive.update(sent[0]?.id ?? '', location === 'direct' ? {} : { addParent: archive, removeParent: changes });
    create.mockClear();
    await expect(journal.flush()).resolves.toBeUndefined();
    expect(create.mock.calls.map((c) => c[4])).toEqual([reserved]);
    expect((await drive.listAll(changes)).filter((f) => !f.folder && f.id !== lookalike.id)).toHaveLength(1);
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
    const get = drive.get.bind(drive);
    let lose = true;
    // The line lands and its answer is lost, and so is the read by its id that follows: it waits in the outbox.
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      const f = await real(...a);
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
    // A tidy-up archives it, stamping its own operation over the line's bowerOp.
    const landed = (await drive.listAll(changes)).filter((f) => !f.folder);
    expect(landed).toHaveLength(1);
    const line = landed[0];
    if (!line) throw new Error('no line');
    await drive.update(line.id, { addParent: archive, removeParent: changes, appProperties: { bowerOp: 'RUN_STAMP' } });
    const read = vi.spyOn(drive, 'readText');
    await journal.record('move', 'two');
    // Found by the id reserved for it, which the archive move keeps: never made again, nor read back by its name and fields.
    const lines = (await drive.listAll(changes)).filter((f) => !f.folder);
    expect((await drive.get(line.id)).appProperties).toMatchObject({ bowerOp: 'RUN_STAMP' });
    expect(lines.filter((f) => f.name === `${one.id}.json`)).toHaveLength(1);
    expect(lines).toHaveLength(2);
    expect(read).not.toHaveBeenCalled();
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
  });

  it('outbox: a line whose answer was lost is not sent twice', async () => {
    const real = drive.createText.bind(drive);
    let lose = true;
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      const f = await real(...a);
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

describe('c3-reservation-home: the id kept on the outbox line', () => {
  it('a journal line kept on the device is sent after a reload under the id the home kept', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
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
    const kept = JSON.parse(localStorage.getItem(`bower:outbox:${root}`) ?? '[]') as Array<{ line: { id: string }; reserved?: string }>;
    expect(kept.map((w) => w.line.id)).toEqual([one.id]);
    expect(kept[0]?.reserved).toBe(sentWith[0]);
    // The page is reloaded: a new journal knows only what this device kept.
    const ids = vi.spyOn(drive, 'generateIds');
    const reloaded = new Journal(drive, { owner: async () => root, folder: async () => changes, files: async () => (await drive.listAll(changes)).filter((f) => !f.folder) }, 'device-a');
    await expect(reloaded.flush()).resolves.toBeUndefined();
    // Sent under the id kept on its line, found by it: no new id, one file, nothing left waiting.
    expect(ids).not.toHaveBeenCalled();
    expect(sentWith).toEqual([kept[0]?.reserved, kept[0]?.reserved]);
    expect((await drive.listAll(changes)).filter((f) => f.name === `${one.id}.json`).map((f) => f.id)).toEqual([kept[0]?.reserved]);
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
  });
});

/**
 * c4-create-landed fix round 1 (TL-P4-24 addendum 16): the outbox line keeps, with its reserved id, where and as what it
 * was first sent. A retry resends that and is judged against it; a line kept before intents were stored is sent as before.
 */
describe('c4-create-landed: the intent kept on the outbox line', () => {
  type Kept = Array<{ line: { id: string }; reserved?: string; sent?: { parent: string; name: string; content?: { md5: string; sha256: string } } }>;
  const kept = (): Kept => JSON.parse(localStorage.getItem(`bower:outbox:${root}`) ?? '[]') as Kept;
  /** The line lands and its answer is lost; the read by its id that follows gets no answer either. */
  const loseFirst = (): Array<{ parent: string; name: string; id?: string }> => {
    const create = drive.createText.bind(drive);
    const get = drive.get.bind(drive);
    const sends: Array<{ parent: string; name: string; id?: string }> = [];
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      sends.push({ parent: a[0], name: a[1], ...(a[4] ? { id: a[4] } : {}) });
      const f = await create(...a);
      if (sends.length === 1) {
        drive.get = async () => {
          drive.get = get;
          throw driveError('offline');
        };
        throw driveError('offline');
      }
      return f;
    };
    return sends;
  };

  it('a line whose answer was lost is sent again where it was first sent, though its folder is looked up anew', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sends = loseFirst();
    const one = await journal.record('move', 'one');
    // The id and the intent are on the device with the line.
    expect(kept()[0]?.sent).toMatchObject({ parent: changes, name: `${one.id}.json` });
    expect(kept()[0]?.sent?.content?.sha256).toMatch(/^[0-9a-f]{64}$/);
    // After a reload the changes folder is looked up as another one: the line still goes where it went, and is found there.
    const other = (await drive.createFolder(root, 'elsewhere')).id;
    const reloaded = new Journal(drive, { owner: async () => root, folder: async () => other, files: async () => (await drive.listAll(changes)).filter((f) => !f.folder) }, 'device-a');
    await expect(reloaded.flush()).resolves.toBeUndefined();
    expect(sends.map((x) => x.parent)).toEqual([changes, changes]);
    expect((await drive.listAll(changes)).filter((f) => f.name === `${one.id}.json`)).toHaveLength(1);
    expect(await drive.listAll(other)).toEqual([]);
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
    expect(localStorage.getItem(FAILED_KEY)).toBeNull();
  });

  it('an outbox line kept before intents, or with one that does not read, is sent as before under its kept id', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const stored of ['none', 'unreadable'] as const) {
      localStorage.clear();
      const sends = loseFirst();
      const one = await journal.record('move', `one ${stored}`);
      const line = kept()[0];
      if (!line?.reserved) throw new Error('no kept id');
      // The outbox as an earlier build kept it: the line and its id, no intent (or one this build cannot read).
      localStorage.setItem(`bower:outbox:${root}`, JSON.stringify([{ line: line.line, reserved: line.reserved, ...(stored === 'unreadable' ? { sent: { parent: 7 } } : {}) }]));
      const reloaded = new Journal(drive, { owner: async () => root, folder: async () => changes, files: async () => (await drive.listAll(changes)).filter((f) => !f.folder) }, 'device-a');
      await expect(reloaded.flush()).resolves.toBeUndefined();
      expect(sends.map((x) => x.id)).toEqual([line.reserved, line.reserved]);
      expect((await drive.listAll(changes)).filter((f) => f.name === `${one.id}.json`).map((f) => f.id)).toEqual([line.reserved]);
      expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
      journal = reloaded;
    }
  });
});

/** Drive's own answer to every request, through the real transport (`drive-http.ts`), with no wait between tries. */
const answering = (status: number, reason?: string): DriveHttp =>
  new DriveHttp({
    token: async () => 't',
    fetch: async () => new Response(JSON.stringify({ error: { code: status, errors: reason ? [{ reason }] : [] } }), { status }),
    pacing: { baseMs: 0, sleep: async () => {} },
  });
/** A permanent refusal, as Drive answers one: a 403 that is not a rate limit. */
const REFUSED = (): DriveHttp => answering(403, 'insufficientFilePermissions');
const outbox = (): Array<{ line: { id: string }; reserved?: string }> =>
  JSON.parse(localStorage.getItem(`bower:outbox:${root}`) ?? '[]') as Array<{ line: { id: string }; reserved?: string }>;

describe('c2-create-by-id reopened: a line refused for good', () => {
  it('a refused original stays dropped when removing it from the outbox fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = drive.createText.bind(drive);
    let mode: 'offline' | 'refuse' | 'fine' = 'offline';
    const attempted: string[] = [];
    drive.createText = async (...args: Parameters<FakeDrive['createText']>) => {
      attempted.push((JSON.parse(args[2]) as { id: string }).id);
      if (mode === 'offline') throw driveError('offline');
      if (mode === 'refuse') return REFUSED().createText(...args);
      return create(...args);
    };
    const original = await journal.record('rule', 'New rule', { path: 'Rules.md', text: 'Keep recipes together.' });
    const key = `bower:outbox:${root}`;
    const failedAtDrop: string[][] = [];
    const remove = Storage.prototype.removeItem;
    const blocked = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, k: string) {
      if (k === key) {
        const failed = JSON.parse(localStorage.getItem(FAILED_KEY) ?? '{}') as Record<string, Array<{ id: string }>>;
        failedAtDrop.push((failed[root] ?? []).map((f) => f.id));
        throw new DOMException('Full', 'QuotaExceededError');
      }
      remove.call(this, k);
    });
    mode = 'refuse';
    await journal.flush();
    expect.soft(failedAtDrop).toEqual([[original.id]]);
    expect((await journal.failed()).map((f) => f.id)).toEqual([original.id]);
    expect(outbox().map((r) => r.line.id)).toEqual([original.id]);
    await expect(journal.retract(original.id)).resolves.toBe('dropped');
    blocked.mockRestore();
    // After storage and Drive recover, even a new page must respect the permanent failed-list tombstone.
    const reloaded = new Journal(drive, { owner: async () => root, folder: async () => changes,
      files: async () => (await drive.listAll(changes)).filter((f) => !f.folder) }, 'device-b');
    attempted.length = 0;
    mode = 'fine';
    await reloaded.flush();
    expect(attempted).toEqual([]);
    expect((await drive.listAll(changes)).filter((f) => !f.folder)).toEqual([]);
  });

  it('a journal line refused for good releases its id and says so once', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = drive.createText.bind(drive);
    let mode: 'offline' | 'refuse' | 'fine' = 'offline';
    const sentWith: Array<string | undefined> = [];
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      sentWith.push(a[4]);
      if (mode === 'offline') throw driveError('offline');
      // A permanent 4xx (not the 409 that proves a create landed): Drive refuses this id for good.
      if (mode === 'refuse') return REFUSED().createText(...a);
      return create(...a);
    };
    // A line that cannot go yet keeps its reserved id for the next try.
    const one = await journal.record('move', 'one');
    const kept = outbox();
    expect(kept.map((w) => w.line.id)).toEqual([one.id]);
    expect(kept[0]?.reserved).toBeDefined();
    // Drive then refuses it for good while nobody waits on it: the line ends as failed, its id is released, and it is
    // kept once among what failed, never sent again.
    mode = 'refuse';
    logged.mockClear();
    await expect(journal.flush()).resolves.toBeUndefined();
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
    expect(logged).toHaveBeenCalled();
    expect(await journal.failed()).toEqual([{ id: one.id, what: 'one', sentence: "Your change was made, but Bower couldn't make a note of it." }]);
    // Never again: the next try has nothing to send and adds nothing.
    sentWith.length = 0;
    mode = 'fine';
    await expect(journal.flush()).resolves.toBeUndefined();
    expect(sentWith).toEqual([]);
    expect(await journal.failed()).toHaveLength(1);
    await journal.putAway(one.id);
    expect(await journal.failed()).toEqual([]);
    // A new line met with the same refusal at once tells the person once, and is not kept.
    mode = 'refuse';
    await expect(journal.record('move', 'two')).rejects.toMatchObject({ message: "Your change was made, but Bower couldn't make a note of it." });
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
    expect(await journal.failed()).toEqual([]);
    mode = 'fine';
    await expect(journal.flush()).resolves.toBeUndefined();
    expect((await journal.list()).map((r) => r.what)).toEqual([]);
  });

  it.each([
    ['a 429', 429, undefined],
    ['a 403 rate limit', 403, 'rateLimitExceeded'],
    ['a 403 user rate limit', 403, 'userRateLimitExceeded'],
  ])('a journal line refused by a rate limit keeps its id and is sent later (%s)', async (_name, status, reason) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = drive.createText.bind(drive);
    let limited = true;
    const sentWith: Array<string | undefined> = [];
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      sentWith.push(a[4]);
      // Still limited after the transport's own tries: Drive says it did not take this request, not that it never will.
      return limited ? answering(status, reason).createText(...a) : create(...a);
    };
    const recorded = journal.record('move', 'one');
    await expect(recorded).resolves.toMatchObject({ what: 'one' });
    const one = await recorded;
    const kept = outbox();
    expect(kept.map((w) => w.line.id)).toEqual([one.id]);
    expect(kept[0]?.reserved).toBe(sentWith[0]);
    limited = false;
    await expect(journal.flush()).resolves.toBeUndefined();
    expect(sentWith).toEqual([sentWith[0], sentWith[0]]);
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
    const lines = (await drive.listAll(changes)).filter((f) => f.name === `${one.id}.json`);
    expect(lines.map((f) => f.id)).toEqual([sentWith[0]]);
    expect((await journal.list()).map((r) => r.what)).toEqual(['one']);
  });

  it('a refused rule, request or answer says what happened to it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => REFUSED().createText(...a);
    const told = async (p: Promise<unknown>): Promise<{ message: string; applied: unknown }> =>
      p.then(() => ({ message: 'saved', applied: undefined }), (e: unknown) => ({ message: (e as BowerError).message, applied: (e as BowerError).applied }));
    // These lines are the change itself: refused, nothing was made, so nothing says it was.
    expect(await told(journal.record('rule', 'New rule: "dentist goes in health"', { path: 'Rules.md', text: 'dentist goes in health' }))).toEqual({ message: "Bower couldn't keep that rule.", applied: undefined });
    expect(await told(journal.record('rule', 'Removed the rule "dentist goes in health"', { path: 'Rules.md', removes: 'dentist goes in health' }))).toEqual({ message: "Bower couldn't take that rule out.", applied: undefined });
    expect(await told(journal.record('request', 'Asked Bower: "Put my id papers together"', { text: 'Put my id papers together' }))).toEqual({ message: "Bower couldn't keep that request.", applied: undefined });
    expect(await told(journal.record('answer', 'Answered "Yes" to a question', { questionId: 'q1', text: 'yes' }))).toEqual({ message: "Bower couldn't keep your answer.", applied: undefined });
    // A change made in Drive was made: only its note is missing, and no line is left to take back.
    expect(await told(journal.record('move', 'Moved Lease draft to Areas', { path: 'Areas/Lease draft.pdf', fileId: 'F1' }))).toEqual({ message: "Your change was made, but Bower couldn't make a note of it.", applied: { path: 'Areas/Lease draft.pdf' } });
    expect(await journal.list()).toEqual([]);
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
    // Refused while waiting, the same words are kept among what failed.
    drive.createText = async () => { throw driveError('offline'); };
    const rule = await journal.record('rule', 'New rule: "receipts go in money"', { path: 'Rules.md', text: 'receipts go in money' });
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => REFUSED().createText(...a);
    await journal.flush();
    expect(await journal.failed()).toEqual([{ id: rule.id, what: 'New rule: "receipts go in money"', sentence: "Bower couldn't keep that rule." }]);
  });
});

describe('c2-create-by-id round 5: what a refusal leaves', () => {
  const FULL = (): DriveHttp => answering(403, 'storageQuotaExceeded');
  const toldBy = async (p: Promise<unknown>): Promise<{ message: string; applied: unknown }> =>
    p.then(() => ({ message: 'saved', applied: undefined }), (e: unknown) => ({ message: (e as BowerError).message, applied: (e as BowerError).applied }));

  it('a journal line refused for a full Drive keeps its id and is sent once space is free', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = drive.createText.bind(drive);
    let full = true;
    const sentWith: Array<string | undefined> = [];
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      sentWith.push(a[4]);
      // P4-37d repro C: a full Drive refuses the line's create; moves and renames still go, so the change was made.
      return full ? FULL().createText(...a) : create(...a);
    };
    const told = await toldBy(journal.record('move', 'Moved Cooking to Archive', { path: 'Archive/Cooking', fileId: 'F1' }));
    expect(told.message).toBe("Your Google Drive is full. Your change was made; Bower will note it later.");
    expect(told.applied).toMatchObject({ path: 'Archive/Cooking' });
    const kept = outbox();
    expect(kept).toHaveLength(1);
    expect(kept[0]?.reserved).toBe(sentWith[0]);
    // Still full in the background: the line waits, with its id, and nothing is called failed.
    await expect(journal.flush()).rejects.toMatchObject({ code: 'offline' });
    expect(outbox().map((w) => w.reserved)).toEqual([sentWith[0]]);
    expect(await journal.failed()).toEqual([]);
    // A rule after it waits behind it, unsent and kept (FIFO, TL-P4-27 addendum 4 (5)): record answers it as later.
    await expect(journal.record('rule', 'New rule: "receipts go in money"', { path: 'Rules.md', text: 'receipts go in money' })).resolves.toMatchObject({ kind: 'rule' });
    expect(outbox()).toHaveLength(2);
    // Space is freed (P4-37d repro D): both are sent, the move under the id it kept.
    full = false;
    await expect(journal.flush()).resolves.toBeUndefined();
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
    expect((await drive.listAll(changes)).some((f) => f.id === sentWith[0])).toBe(true);
    expect((await journal.list()).map((r) => r.what)).toEqual(['Moved Cooking to Archive', 'New rule: "receipts go in money"']);
  });

  it('a move whose line is refused for good follows the thing to where it went', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => REFUSED().createText(...a);
    // P4-37d repro E: the thing was moved; only its line is gone, so the screen follows it and nothing names the line.
    const said = "Your change was made, but Bower couldn't make a note of it.";
    expect(await toldBy(journal.record('move', 'Moved Cooking to Archive', { path: 'Archive/Cooking', from: 'Resources/Cooking', fileId: 'F1' }))).toEqual({ message: said, applied: { path: 'Archive/Cooking' } });
    expect(await toldBy(journal.record('rename', 'Renamed Cooking to Recipes', { path: 'Resources/Recipes', from: 'Resources/Cooking', fileId: 'F1' }))).toEqual({ message: said, applied: { path: 'Resources/Recipes' } });
    expect(await toldBy(journal.record('create', 'New note "Soup" in Resources', { path: 'Resources/Soup.md', fileId: 'F2' }))).toEqual({ message: said, applied: { path: 'Resources/Soup.md' } });
    expect(await toldBy(journal.record('trash', 'Put Soup in the Bin', { path: 'Resources/Soup.md', fileId: 'F2' }))).toEqual({ message: said, applied: { path: null } });
  });

  it('sign-out forgets a failed change kept in memory when storage refuses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let mode: 'offline' | 'refuse' = 'offline';
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => (mode === 'offline' ? Promise.reject(driveError('offline')) : REFUSED().createText(...a));
    await journal.record('move', 'Moved Lease draft to Areas', { path: 'Areas/Lease draft.pdf', fileId: 'F1' });
    // This device's storage refuses what failed (P4-37d repro F): it is kept in this page's memory.
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === FAILED_KEY) throw new DOMException('Storage refused', 'QuotaExceededError');
      setItem.call(this, k, v);
    });
    mode = 'refuse';
    await journal.flush();
    expect((await journal.failed()).map((f) => f.what)).toEqual(['Moved Lease draft to Areas']);
    forgetThisPerson();
    expect(await journal.failed()).toEqual([]);
  });

  it('a journal line answered 409 whose read-back holds other bytes ends as failed once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = drive.createText.bind(drive);
    let mode: 'offline' | 'other' | 'fine' = 'offline';
    const sent: Array<string | undefined> = [];
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      sent.push(a[4]);
      if (mode === 'offline') throw driveError('offline');
      if (mode === 'other') {
        // The reserved id already holds other bytes: Drive answers 409, and the read-back's checksum is not the line's.
        if (!(await drive.listAll(changes)).some((f) => f.id === a[4])) await create(a[0], a[1], '{"other":true}\n', a[3], a[4]);
        throw driveError('conflict');
      }
      return create(...a);
    };
    const one = await journal.record('move', 'one', { path: 'Areas/one', fileId: 'F1' });
    mode = 'other';
    await expect(journal.flush()).resolves.toBeUndefined();
    // Ended honestly: out of the outbox, shown once among what failed, never sent again.
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
    expect(await journal.failed()).toEqual([{ id: one.id, what: 'one', sentence: "Your change was made, but Bower couldn't make a note of it." }]);
    sent.length = 0;
    mode = 'fine';
    await journal.flush();
    expect(sent).toEqual([]);
    expect(await journal.failed()).toHaveLength(1);
  });
});

describe('c2-create-by-id round 6: a gone target, a resent request', () => {
  // What failed in an earlier test, kept in memory while storage refused it, is not this test's.
  beforeEach(() => {
    vi.restoreAllMocks();
    forgetThisPerson();
  });

  it('a second not-found ends the line for good', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let listedAnew = 0;
    const place = { owner: async () => root, folder: async () => changes, files: async () => (await drive.listAll(changes)).filter((f) => !f.folder), stale: () => { listedAnew += 1; } };
    const j = new Journal(drive, place, 'device-a');
    const sentWith: Array<string | undefined> = [];
    // P4-37e repro G: Drive answers 404 to every create of the line, and a fresh listing does not clear it.
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      sentWith.push(a[4]);
      return answering(404, 'notFound').createText(...a);
    };
    const one = await j.record('move', 'Moved Taxes to Money', { path: 'Money/Taxes', fileId: 'F1' });
    // The first 404: the line waits with its id, and its place is listed anew before the one more try.
    expect(outbox().map((w) => w.line.id)).toEqual([one.id]);
    expect(listedAnew).toBe(1);
    expect(await j.failed()).toEqual([]);
    // The second 404, after the fresh listing (here after a reload): permanent. Ended once among what failed.
    const reloaded = new Journal(drive, place, 'device-a');
    await expect(reloaded.flush()).resolves.toBeUndefined();
    expect(localStorage.getItem(`bower:outbox:${root}`)).toBeNull();
    expect(await reloaded.failed()).toEqual([{ id: one.id, what: 'Moved Taxes to Money', sentence: "Your change was made, but Bower couldn't make a note of it." }]);
    expect(sentWith).toEqual([sentWith[0], sentWith[0]]);
    // A gone target never loops: later tries send nothing and add nothing.
    sentWith.length = 0;
    for (let i = 0; i < 3; i++) await reloaded.flush();
    expect(sentWith).toEqual([]);
    expect(await reloaded.failed()).toHaveLength(1);
  });

  it('one request resent after a wait makes one line, under its reserved id', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = drive.createText.bind(drive);
    let full = true;
    const sentWith: Array<string | undefined> = [];
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      sentWith.push(a[4]);
      return full ? answering(403, 'storageQuotaExceeded').createText(...a) : create(...a);
    };
    const ask = (): Promise<unknown> => journal.record('request', 'Asked Bower: "Put my id papers together"', { text: 'Put my id papers together' }, 'press-1');
    const kept = 'Your Google Drive is full. Bower kept this and will send it later.';
    await expect(ask()).rejects.toMatchObject({ message: kept });
    // P4-37e minor: the words stay in the composer and the person sends them again: still the one line.
    await expect(ask()).rejects.toMatchObject({ message: kept });
    expect(outbox()).toHaveLength(1);
    expect(new Set(sentWith)).toEqual(new Set([outbox()[0]?.reserved]));
    full = false;
    const sent = await ask();
    expect(outbox()).toEqual([]);
    const lines = (await drive.listAll(changes)).filter((f) => f.name.endsWith('.json'));
    expect(lines.map((f) => f.id)).toEqual([sentWith[0]]);
    expect((await journal.list()).map((r) => r.id)).toEqual([(sent as { id: string }).id]);
    // Another press is another request.
    await journal.record('request', 'Asked Bower: "Compare the flats"', { text: 'Compare the flats' }, 'press-2');
    expect((await journal.list()).map((r) => r.what)).toEqual(['Asked Bower: "Put my id papers together"', 'Asked Bower: "Compare the flats"']);
  });
});
