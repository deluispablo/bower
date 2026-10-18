/**
 * qa-live-claude-F3, round 2 (plan-F3-remove-r2.md): a waiting request is taken back by a withdrawal line, and Undo takes
 * that line back. DriveVault over the pretend Drive, as `undo-compensate.test.ts`; the tidy-up is `tidyUp`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { driveError } from '../drive/drive-api';
import { seedFakeDrive } from '../fake/seed';
import { DemoWorld } from '../demo/world';
import { tidyUp } from '@/testing/tidy-up';
import { DriveVault } from './drive-vault';
import { PROP, SYSTEM } from './layout';

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
const VISA = 'Put my visa papers together';
const GARDEN = 'Sort the garden photos by season';

let drive: FakeDrive;
let root: string;
let at: number;

beforeEach(async () => {
  localStorage.clear();
  stubLocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  drive = new FakeDrive();
  root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
  at = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => ++at);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const tab = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() }, () => true, async () => root, {} as FakeDrive);

type Line = Record<string, unknown>;
/** The journal lines Drive holds now, archived or not. */
const linesInDrive = (): Line[] =>
  [...drive.dump(root).entries()].filter(([p]) => p.startsWith(`${SYSTEM.changes}/`) && LINE.test(p.split('/').at(-1) ?? '')).map(([, t]) => JSON.parse(t) as Line);
/** Lines still waiting for a tidy-up (not archived). */
const pendingIds = (): string[] =>
  [...drive.dump(root).keys()].filter((p) => p.startsWith(`${SYSTEM.changes}/`) && !p.startsWith(`${SYSTEM.archive}/`) && LINE.test(p.split('/').at(-1) ?? '')).map((p) => (p.split('/').at(-1) ?? '').replace('.json', ''));
const withdrawals = (id: string): Line[] => linesInDrive().filter((l) => l.undoes === id);
const done = async (words: string) => (await tab().requests()).filter((r) => r.done && r.text === words);
const shown = async (v: DriveVault) => (await v.requests()).filter((r) => !r.done).map(({ id, text, at: when }) => ({ id, text, at: when }));

/** Journal ids and creates find no network while `off` says so. */
function journalOffline(only: 'ids' | 'creates' | 'both' = 'both'): { off: boolean } {
  const state = { off: true };
  const ids = drive.generateIds.bind(drive);
  if (only !== 'creates') {
    drive.generateIds = async (...a: Parameters<FakeDrive['generateIds']>) => {
      if (state.off) throw driveError('offline');
      return ids(...a);
    };
  }
  const create = drive.createText.bind(drive);
  if (only !== 'ids') {
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      if (state.off && LINE.test(a[1])) throw driveError('offline');
      return create(...a);
    };
  }
  return state;
}

/** A line written straight into the changes folder, as another device wrote it. */
async function lineInDrive(kind: string, what: string, extra: Record<string, unknown>, when: number): Promise<string> {
  const changes = (await drive.listAll(root)).find((f) => f.folder && f.name === 'changes');
  if (!changes) throw new Error('no changes folder in the seed');
  const id = `${new Date(when).toISOString().replace(/:/g, '-')}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
  await drive.createText(changes.id, `${id}.json`, `${JSON.stringify({ v: 1, id, at: when, kind, what, device: 'device-b', ...extra })}\n`);
  return id;
}

/** Sends a request and waits until it is in Drive. */
async function ask(v: DriveVault, words: string) {
  const r = await v.addRequest(words);
  await v.settled();
  return r;
}

describe('F3 vault-remove: a waiting request is taken back by a withdrawal line', () => {
  it('F3-1 vault-remove-sent: gone from the list, one withdrawal, the request line stays, a tidy-up files neither', async () => {
    const v = tab();
    const r = await ask(v, VISA);
    await ask(v, GARDEN);
    await v.removeRequest(r.id);
    await v.settled();
    expect((await tab().requests()).some((x) => x.id === r.id)).toBe(false);
    const out = withdrawals(r.id);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBeUndefined();
    expect(linesInDrive().filter((l) => l.id === r.id)).toHaveLength(1);
    expect((await tidyUp(drive, root, 'instructions')).phase).toBe('done');
    // Positive control: another request is done; the withdrawn one has no row, and both its lines are archived.
    expect(await done(GARDEN)).toHaveLength(1);
    expect(await done(VISA)).toHaveLength(0);
    expect(pendingIds()).not.toContain(r.id);
    expect(pendingIds()).not.toContain(out[0]?.id);
    expect(linesInDrive().filter((l) => l.id === r.id || l.undoes === r.id)).toHaveLength(2);
  });

  it('F3-2 vault-remove-unsent: both lines arrive in order after the network returns, with the same tidy-up outcome', async () => {
    const v = tab();
    await ask(v, GARDEN);
    const net = journalOffline();
    const r = await v.addRequest(VISA);
    await v.removeRequest(r.id);
    net.off = false;
    const sent: string[] = [];
    const create = drive.createText.bind(drive);
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      if (LINE.test(a[1])) sent.push(a[1].replace('.json', ''));
      return create(...a);
    };
    await v.flushJournal();
    const w = withdrawals(r.id)[0];
    expect(w, 'the withdrawal arrived').toBeDefined();
    expect(sent).toEqual([r.id, w?.id]);
    expect((await tidyUp(drive, root, 'instructions')).phase).toBe('done');
    expect(await done(GARDEN)).toHaveLength(1);
    expect(await done(VISA)).toHaveLength(0);
  });

  it('F3-3 vault-remove-reserved: a create that landed with its answer and read-back lost is never run unwithdrawn', async () => {
    const v = tab();
    await v.requests();
    await v.tree();
    const create = drive.createText.bind(drive);
    const get = drive.get.bind(drive);
    let lose = 1;
    let landedId = '';
    drive.createText = async (...a: Parameters<FakeDrive['createText']>) => {
      const made = await create(...a);
      if (LINE.test(a[1]) && lose > 0) {
        lose -= 1;
        landedId = made.id;
        throw driveError('offline');
      }
      return made;
    };
    let getLost = 1;
    drive.get = async (...a: Parameters<FakeDrive['get']>) => {
      if (a[0] === landedId && getLost > 0) {
        getLost -= 1;
        throw driveError('offline');
      }
      return get(...a);
    };
    const r = await v.addRequest(VISA);
    await v.settled();
    expect(landedId, 'the line landed in Drive').not.toBe('');
    await v.removeRequest(r.id);
    await v.settled();
    expect(linesInDrive().filter((l) => l.id === r.id), 'one file for the request').toHaveLength(1);
    expect(withdrawals(r.id)).toHaveLength(1);
    expect((await tidyUp(drive, root, 'instructions')).phase).toBe('done');
    expect(await done(VISA)).toHaveLength(0);
  });
});

describe('F3 vault-undo: Undo takes the withdrawal back', () => {
  it('F3-4 vault-undo-sent: the list is as before, one undo line, the request is done once under its own id', async () => {
    const v = tab();
    const r = await ask(v, VISA);
    await ask(v, GARDEN);
    const before = await shown(v);
    const undo = await v.removeRequest(r.id);
    await v.settled();
    const w = withdrawals(r.id)[0];
    await undo();
    await v.settled();
    expect(await shown(tab())).toEqual(before);
    const back = linesInDrive().filter((l) => l.undoes === w?.id);
    expect(back).toHaveLength(1);
    expect(back[0]?.text).toBeUndefined();
    expect((await tidyUp(drive, root, 'instructions')).phase).toBe('done');
    const rows = await done(VISA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(r.id);
  });

  it('F3-5 vault-undo-unsent-withdrawal: the withdrawal never left, so Undo drops it and the request stands alone', async () => {
    const v = tab();
    const r = await ask(v, VISA);
    const net = journalOffline('ids');
    const undo = await v.removeRequest(r.id);
    await undo();
    net.off = false;
    await v.flushJournal();
    expect((await shown(tab())).map((x) => x.id)).toEqual([r.id]);
    expect(linesInDrive().filter((l) => l.kind === 'request')).toHaveLength(1);
  });

  it('F3-6 vault-undo-after-tidy-up: the pair was archived, so Undo asks again under a new id, with no undo line', async () => {
    const v = tab();
    const r = await ask(v, VISA);
    const undo = await v.removeRequest(r.id);
    await v.settled();
    expect((await tidyUp(drive, root, 'instructions')).phase).toBe('done');
    await v.refresh();
    await undo();
    await v.settled();
    const now = (await tab().requests()).filter((x) => !x.done && x.text === VISA);
    expect(now).toHaveLength(1);
    expect(now[0]?.id).not.toBe(r.id);
    // Only the withdrawal has `undoes`; Undo wrote none.
    expect(linesInDrive().filter((l) => l.undoes !== undefined)).toHaveLength(1);
    expect((await tidyUp(drive, root, 'instructions')).phase).toBe('done');
    expect(await done(VISA)).toHaveLength(1);
  });

  it.each(['pending folder', 'run pointer'] as const)('F3-7 vault-undo-run-holds-it (%s): a run took the withdrawal, so Undo asks again, with no undo line', async (how) => {
    const v = tab();
    const r = await ask(v, VISA);
    await v.removeRequest(r.id).then(async (undo) => {
      await v.settled();
      const w = withdrawals(r.id)[0];
      const all = await drive.listAll(root);
      const file = all.find((f) => f.name === `${String(w?.id)}.json`);
      if (!file) throw new Error('no withdrawal file');
      // The Drive file id is not the record id.
      expect(file.id).not.toBe(w?.id);
      if (how === 'pending folder') {
        const changes = all.find((f) => f.folder && f.name === 'changes');
        if (!changes) throw new Error('no changes folder');
        const pending = all.find((f) => f.folder && f.name === 'pending' && f.parents.includes(changes.id)) ?? await drive.createFolder(changes.id, 'pending');
        const run = await drive.createFolder(pending.id, 'run-1');
        await drive.update(file.id, { addParent: run.id, removeParent: file.parents[0] ?? '' });
      } else await drive.update(file.id, { appProperties: { [PROP.run]: 'run-9' } });
      await undo();
      await v.settled();
    });
    const now = (await tab().requests()).filter((x) => !x.done && x.text === VISA);
    expect(now).toHaveLength(1);
    expect(now[0]?.id).not.toBe(r.id);
    expect(linesInDrive().filter((l) => l.undoes !== undefined && l.text === undefined && l.undoes !== r.id)).toHaveLength(0);
  });

  it('F3-13 vault-undo-reserved-withdrawal: a withdrawal whose create failed is undone by a line queued after it, never a re-ask', async () => {
    const v = tab();
    const r = await ask(v, VISA);
    const net = journalOffline('creates');
    const undo = await v.removeRequest(r.id);
    await undo();
    net.off = false;
    await v.flushJournal();
    await v.settled();
    expect(linesInDrive().filter((l) => l.kind === 'request' && l.text !== undefined), 'no second request').toHaveLength(1);
    expect((await tidyUp(drive, root, 'instructions')).phase).toBe('done');
    const rows = await done(VISA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(r.id);
  });
});

describe('F3 vault: identity, stored words, gone ids', () => {
  it('F3-8 vault-equal-words: only the removed id is withdrawn; Undo leaves both as before', async () => {
    const v = tab();
    const first = await ask(v, VISA);
    const second = await ask(v, VISA);
    const before = await shown(v);
    expect(before.map((x) => x.id)).toEqual([second.id, first.id]);
    const undo = await v.removeRequest(second.id);
    await v.settled();
    expect(await shown(tab())).toEqual(before.filter((x) => x.id === first.id));
    await undo();
    await v.settled();
    expect(await shown(tab())).toEqual(before);
  });

  it('F3-9 vault-projection: withdrawal and undo lines are not requests; requests with odd stored words stay and can be removed', async () => {
    const first = await lineInDrive('request', 'Asked Bower: "first"', { text: 'first words' }, at += 10);
    const refused = await lineInDrive('request', 'Asked Bower: "second"', { text: 'second words', undoes: 'LINE_GONE' }, at += 10);
    const bare = await lineInDrive('request', 'bare words', {}, at += 10);
    const blank = await lineInDrive('request', 'blank text', { text: '' }, at += 10);
    const w = await lineInDrive('request', 'Took back a request', { undoes: first }, at += 10);
    expect((await tab().requests()).map((x) => x.id).sort(), 'the first is taken back').toEqual([refused, bare, blank].sort());
    await lineInDrive('request', 'Put back a request', { undoes: w }, at += 10);
    const v = tab();
    const listed = await v.requests();
    expect(listed.map((x) => x.id).sort()).toEqual([first, refused, bare, blank].sort());
    expect(listed.find((x) => x.id === bare)?.text).toBe('bare words');
    for (const id of [bare, blank]) {
      await v.removeRequest(id);
      await v.settled();
      expect(withdrawals(id), `a withdrawal for ${id}`).toHaveLength(1);
    }
  });

  it('F3-10 vault-remove-gone: an unknown id, a done request and a withdrawal are not found, and nothing is written', async () => {
    const v = tab();
    const r = await ask(v, GARDEN);
    await tidyUp(drive, root, 'instructions');
    const doneRow = (await tab().requests()).find((x) => x.done);
    expect(doneRow, 'a done request exists').toBeDefined();
    const kept = await ask(v, VISA);
    await v.removeRequest(kept.id);
    await v.settled();
    const w = withdrawals(kept.id)[0];
    const count = linesInDrive().length;
    for (const id of ['NO_SUCH_LINE', doneRow?.id ?? 'x', String(w?.id), r.id]) {
      await expect(v.removeRequest(id), id).rejects.toMatchObject({ code: 'not-found', message: 'That request is no longer there.' });
    }
    expect(linesInDrive()).toHaveLength(count);
  });
});

describe('F3 demo-remove', () => {
  it('F3-11 demo-remove: Remove drops the request and its change line, Undo restores both in place, a done request is not found', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    try {
      const { vault, runs } = w.sources();
      const first = await vault.addRequest(VISA);
      const second = await vault.addRequest(GARDEN);
      const requests = await vault.requests();
      const changes = await vault.changes();
      const undo = await vault.removeRequest(first.id);
      expect((await vault.requests()).map((x) => x.id)).toEqual([second.id]);
      expect((await vault.changes()).some((c) => c.what.includes(VISA))).toBe(false);
      await undo();
      expect(await vault.requests()).toEqual(requests);
      expect(await vault.changes()).toEqual(changes);
      await runs.start('all');
      await vi.runAllTimersAsync();
      const finished = (await vault.requests()).find((x) => x.done);
      expect(finished, 'a request is done after the run').toBeDefined();
      await expect(vault.removeRequest(finished?.id ?? 'x')).rejects.toMatchObject({ code: 'not-found' });
    } finally {
      w.dispose();
      vi.useRealTimers();
    }
  });
});
