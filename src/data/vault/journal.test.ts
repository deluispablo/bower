import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { Journal } from './journal';
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
    expect(await told(journal.record('move', 'Moved Lease draft to Areas', { path: 'Areas/Lease draft.pdf', fileId: 'F1' }))).toEqual({ message: "Your change was made, but Bower couldn't make a note of it.", applied: undefined });
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
