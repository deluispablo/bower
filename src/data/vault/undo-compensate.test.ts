/**
 * c4-undo-compensate (TL-P4-27 addenda 2 to 5): Undo is the inverse forward change, decided under the outbox lock. Under
 * the lock, an Undo drops its original line when it was never sent (no reserved id, or refused onto the failed list),
 * and otherwise records the inverse line with `undoes`; the client never deletes a sent line. The outbox sends in order
 * per folder. `pairsOf` hides an original and its inverse in "Since the last tidy-up" and leaves a pair taken in one
 * run out of the report. Each red names the Codex finding it carries (2026-10-09-codex-c4-undo-withdraw-review.md).
 * Everything goes through the vault API on a pretend Drive, with a stub of the Web Locks API (jsdom has none).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { driveError, driveFailure } from '../drive/drive-api';
import { seedFakeDrive } from '../fake/seed';
import { tidyUp } from '@/testing/tidy-up';
import { DriveVault } from './drive-vault';
import { SYSTEM } from './layout';
import type { TreeNode } from '../types';

/** One holder per name at a time, in order, as the browser's Web Locks give (https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API). */
function stubLocks(): void {
  const tails = new Map<string, Promise<unknown>>();
  const locks = {
    request: <T,>(name: string, work: () => Promise<T>): Promise<T> => {
      const run = (tails.get(name) ?? Promise.resolve()).then(work, work);
      tails.set(name, run.catch(() => undefined));
      return run;
    },
  };
  vi.stubGlobal('navigator', { ...navigator, locks });
}

const LINE = /^\d{4}-\d{2}-\d{2}T[\d-]+\.\d{3}Z-[a-z0-9]{6}\.json$/;

let drive: FakeDrive;
let root: string;

beforeEach(async () => {
  localStorage.clear();
  stubLocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  drive = new FakeDrive();
  root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A page of Bower: its own memory, this browser's storage and lock. */
const tab = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() }, () => true, async () => root, {} as FakeDrive);

/** The journal lines Drive holds now, archived or not, by what they say. */
const linesInDrive = (): Array<Record<string, unknown>> =>
  [...drive.dump(root).entries()].filter(([p]) => p.startsWith(`${SYSTEM.changes}/`) && LINE.test(p.split('/').at(-1) ?? '')).map(([, t]) => JSON.parse(t) as Record<string, unknown>);

/** Every path the tree shows, folders and their things. */
async function paths(v: DriveVault): Promise<string[]> {
  const out: string[] = [];
  const walk = (nodes: readonly TreeNode[]): void => nodes.forEach((n) => { out.push(n.path); walk(n.children ?? []); });
  walk(await v.tree());
  return out;
}

const rulesText = (): string => drive.dump(root).get('Rules.md') ?? '';

/** Journal creates, and the ids reserved for them, find no network while `off` says so; the rest of Drive answers. */
function journalOffline(): { off: boolean } {
  const state = { off: true };
  const ids = drive.generateIds.bind(drive);
  drive.generateIds = async (...a: Parameters<FakeDrive['generateIds']>) => {
    if (state.off) throw driveError('offline');
    return ids(...a);
  };
  const create = drive.createText.bind(drive);
  drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
    if (state.off && LINE.test(a[1])) throw driveError('offline');
    return create(...a);
  };
  return state;
}

/** A line written straight into the changes folder, as another device or an earlier session wrote it. */
async function lineInDrive(kind: string, what: string, extra: Record<string, unknown>, at: number): Promise<string> {
  const changes = (await drive.listAll(root)).find((f) => f.folder && f.name === 'changes');
  if (!changes) throw new Error('no changes folder in the seed');
  const id = `${new Date(at).toISOString().replace(/:/g, '-')}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
  await drive.createText(changes.id, `${id}.json`, `${JSON.stringify({ v: 1, id, at, kind, what, device: 'device-b', ...extra })}\n`);
  return id;
}

describe('round 1 #1: two pages on one outbox, an Undo during the reserve', () => {
  it('the removal undone while another page reserves its id leaves the rule in place after a tidy-up', async () => {
    const a = tab();
    const b = tab();
    const worded = (await b.rules()).find((r) => !r.pending);
    if (!worded) throw new Error('no worded rule in the seed');
    const net = journalOffline();
    // Page B takes the rule out while the notes of changes find no network: its line waits, with no id yet.
    const undo = await b.removeRule(worded.id);
    net.off = false;
    // Page A sends the outbox; the id for the waiting line is being reserved when page B's Undo starts.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => (release = done));
    const ids = drive.generateIds.bind(drive);
    let reserving: () => void = () => undefined;
    const reserved = new Promise<void>((done) => (reserving = done));
    drive.generateIds = async (n, signal) => {
      reserving();
      await gate;
      return ids(n, signal);
    };
    const flushing = a.flushJournal();
    await reserved;
    const undoing = undo();
    release();
    await flushing;
    await undoing;
    drive.generateIds = ids;
    // The rule is there for a page opened now, and after the next tidy-up.
    expect((await tab().rules()).some((r) => r.text === worded.text || r.yourWords === worded.text)).toBe(true);
    const run = await tidyUp(drive, root, 'instructions');
    expect(run.phase).toBe('done');
    expect(rulesText()).toContain(worded.text);
  });
});

// Round 1 #2 (removePile while its link is Sending, through write-once withdraw) is the kept test in
// spine/write-once.test.ts, 'a pile removed while its link create is in flight never leaves a live file'.

describe('addenda 13-14 #3: the original refused for good, then Undo', () => {
  it('drops the refused line and records nothing', async () => {
    const v = tab();
    const worded = (await v.rules()).find((r) => !r.pending);
    if (!worded) throw new Error('no worded rule in the seed');
    const net = journalOffline();
    const undo = await v.removeRule(worded.id);
    // Drive refuses the waiting line for good: it ends on the failed list.
    const create = drive.createText.bind(drive);
    net.off = false;
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      if (LINE.test(a[1])) throw driveFailure('unknown', 'permanent');
      return create(...a);
    };
    await v.flushJournal().catch(() => undefined);
    expect((await v.failedChanges()).map((f) => f.what)).toEqual([`Removed the rule "${worded.text}"`]);
    drive.createText = create;
    await undo();
    expect(linesInDrive()).toEqual([]);
    expect((await v.changes()).filter((c) => c.kind === 'rule')).toEqual([]);
    expect((await tab().rules()).some((r) => r.text === worded.text)).toBe(true);
  });
});

describe('addenda 13-14 #4: two pages Undo one change', () => {
  it('a move undone in two pages ends where it was, with at most one row shown', async () => {
    const a = tab();
    const b = tab();
    const from = 'Projects/Flat hunt/Lease draft.pdf';
    const to = await a.move(from, 'Areas');
    await b.refresh();
    const both = await Promise.allSettled([a.move(to, 'Projects/Flat hunt', { undo: true }), b.move(to, 'Projects/Flat hunt', { undo: true })]);
    expect(both.some((r) => r.status === 'fulfilled')).toBe(true);
    const fresh = tab();
    expect((await paths(fresh)).includes(from)).toBe(true);
    expect((await fresh.changes()).filter((c) => c.kind === 'move').length).toBeLessThanOrEqual(1);
  });

  it('its Bin form: the second restore is refused as no longer in the Bin, and the thing is back once', async () => {
    const v = tab();
    const path = 'Projects/Flat hunt/Lease draft.pdf';
    await v.trash(path);
    const both = await Promise.allSettled([v.restore(path), v.restore(path)]);
    for (const r of both) if (r.status === 'rejected') expect((r.reason as Error).message).toMatch(/no longer in the Bin/);
    const fresh = tab();
    expect((await paths(fresh)).filter((p) => p === path)).toHaveLength(1);
    expect((await fresh.changes()).filter((c) => c.kind === 'trash' || c.kind === 'move').length).toBeLessThanOrEqual(1);
  });
});

describe('rules undone through the vault API, with a tidy-up after', () => {
  it('a suggestion kept as a rule online, then Undo: Rules.md lacks it', async () => {
    const v = tab();
    const s = (await v.suggestions())[0];
    if (!s) throw new Error('no suggestion in the seed');
    const undo = await v.dismissSuggestion(s.id, true);
    await undo();
    expect((await tab().rules()).some((r) => r.text === s.title || r.yourWords === s.title)).toBe(false);
    expect((await tidyUp(drive, root, 'instructions')).phase).toBe('done');
    expect(rulesText().toLowerCase()).not.toContain(s.title.toLowerCase().replace(/[.!]+$/, ''));
  });

  it('a rule added online, then taken out: no rule listed, and Rules.md lacks it', async () => {
    const v = tab();
    const words = 'anything from the dentist goes in health';
    const r = await v.addRule(words);
    await v.removeRule(r.id);
    expect((await tab().rules()).some((x) => x.yourWords === words)).toBe(false);
    expect((await tab().changes()).filter((c) => c.kind === 'rule')).toEqual([]);
    expect((await tidyUp(drive, root, 'instructions')).phase).toBe('done');
    expect(rulesText().toLowerCase()).not.toContain(words);
  });

  it('an Undo of a rule removal that a tidy-up already took brings the rule back at the next tidy-up', async () => {
    const v = tab();
    const worded = (await v.rules()).find((r) => !r.pending);
    if (!worded) throw new Error('no worded rule in the seed');
    const undo = await v.removeRule(worded.id);
    expect((await tidyUp(drive, root, 'instructions')).phase).toBe('done');
    expect(rulesText()).not.toContain(worded.text);
    await v.refresh();
    await undo();
    expect((await tab().rules()).some((r) => r.text === worded.text || r.yourWords === (worded.yourWords ?? worded.text))).toBe(true);
    const run = await tidyUp(drive, root, 'instructions');
    expect(run.phase).toBe('done');
    expect(rulesText()).toContain(worded.text.replace(/[.!]+$/, ''));
  });
});

describe('pairs: an original and its inverse (pairsOf)', () => {
  const note = 'Projects/Flat hunt/Lease draft.pdf';

  it('pairsOf hides a pair in Since the last tidy-up', async () => {
    const t = Date.now();
    const m = await lineInDrive('move', 'Moved Lease draft to Areas', { path: 'Areas/Lease draft.pdf', from: note, fileId: 'FILE_ID' }, t);
    await lineInDrive('move', 'Moved Lease draft to Flat hunt', { path: note, from: 'Areas/Lease draft.pdf', fileId: 'FILE_ID', undoes: m }, t + 1);
    await lineInDrive('request', 'Asked Bower: "Put my id papers together"', { text: 'Put my id papers together' }, t + 2);
    expect((await tab().changes()).map((c) => c.kind)).toEqual(['request']);
  });

  it('a same-run pair gives no report row and a count of 0', async () => {
    const v = tab();
    if (!(await paths(v)).includes(note)) throw new Error('no lease draft in the seed');
    const t = Date.now();
    const trash = await lineInDrive('trash', 'Put Lease draft in the Bin', { path: note, fileId: 'FILE_ID' }, t);
    await lineInDrive('move', 'Put back Lease draft', { path: note, from: note, fileId: 'FILE_ID', undoes: trash }, t + 1);
    const run = await tidyUp(drive, root, 'instructions');
    expect(run.phase).toBe('done');
    if (run.phase !== 'done') return;
    expect(run.report.yourChanges ?? 0).toBe(0);
    expect(run.report.rulesWorded ?? 0).toBe(0);
  });

  it('a later inverse gives one ordinary row', async () => {
    const t = Date.now();
    const m = await lineInDrive('move', 'Moved Lease draft to Areas', { path: 'Areas/Lease draft.pdf', from: note, fileId: 'FILE_ID' }, t);
    expect((await tidyUp(drive, root, 'instructions')).phase).toBe('done');
    await lineInDrive('move', 'Moved Lease draft to Flat hunt', { path: note, from: 'Areas/Lease draft.pdf', fileId: 'FILE_ID', undoes: m }, t + 1);
    expect((await tab().changes()).map((c) => c.what)).toEqual(['Moved Lease draft to Flat hunt']);
    const run = await tidyUp(drive, root, 'instructions');
    if (run.phase !== 'done') throw new Error(run.failure);
    expect(run.report.yourChanges).toBe(1);
  });

  it('a same-run rule pair: added, then its inverse taken out, words nothing and counts nothing', async () => {
    const t = Date.now();
    const add = await lineInDrive('rule', 'New rule: "anything from the dentist goes in health"', { path: 'Rules.md', text: 'anything from the dentist goes in health' }, t);
    await lineInDrive('rule', 'Removed the rule "anything from the dentist goes in health"', { path: 'Rules.md', removes: 'anything from the dentist goes in health', undoes: add }, t + 1);
    expect((await tab().rules()).some((r) => r.yourWords === 'anything from the dentist goes in health')).toBe(false);
    const run = await tidyUp(drive, root, 'instructions');
    if (run.phase !== 'done') throw new Error(run.failure);
    expect(rulesText().toLowerCase()).not.toContain('dentist');
    expect(run.report.rulesWorded ?? 0).toBe(0);
    expect(run.report.yourChanges ?? 0).toBe(0);
  });
});

describe('the outbox sends in order per folder', () => {
  it('a change made while an earlier line waits stays behind it', async () => {
    const v = tab();
    const net = journalOffline();
    await v.addRequest('Put my id papers together');
    // The next line's own send would go, but the earlier one still finds no network: it waits behind it.
    const create = drive.createText.bind(drive);
    let first = true;
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      if (LINE.test(a[1]) && first) {
        first = false;
        throw driveError('offline');
      }
      return create(...a);
    };
    net.off = false;
    await v.addRequest('Keep my lease papers together');
    expect(linesInDrive().map((l) => l.text)).toEqual([]);
    await v.flushJournal();
    expect(linesInDrive().map((l) => l.text)).toEqual(['Put my id papers together', 'Keep my lease papers together']);
  });
});
