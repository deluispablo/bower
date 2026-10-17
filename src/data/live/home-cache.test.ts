import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { FakeWorker } from '../fake/fake-worker';
import { FakeRunService } from '../fake/fake-run-service';
import { seedFakeDrive } from '../fake/seed';
import { liveShape } from '../fake/live-shape';
import { makeLiveSources, type LiveSources } from './index';

let live: LiveSources | null = null;
/** Each file's modifiedTime when a cold load began. */
let versions = new Map<string, string>();
/**
 * The pretend Drive answers after a modelled delay (300 ms a call). That time is the fake clock's: once the event loop has
 * gone quiet for a few turns, the clock jumps to the next timer. So virtual time passes only in the modelled waits, never
 * in the test's own work, and a loaded machine cannot change what a test measures (Date.now is the fake clock too).
 * https://vitest.dev/guide/mocking/timers
 */
let ticking = false;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  ticking = true;
  void (async () => {
    while (ticking) {
      for (let turn = 0; turn < 5; turn++) await new Promise<void>((resolve) => { setImmediate(resolve); });
      if (ticking && vi.isFakeTimers() && vi.getTimerCount() > 0) vi.advanceTimersToNextTimer();
    }
  })();
});
afterEach(() => {
  ticking = false;
  vi.useRealTimers();
  live?.dispose();
  live = null;
  vi.restoreAllMocks();
});

/**
 * The live-shaped folder (a declared pile, 20 leftovers, 12 changes, questions, an unseen finished tidy-up) on a
 * pretend Drive at 300 ms a call, four at once, read as Home reads it (TL-P4-13 home-cache-stable).
 */
async function slowReport(opts: { cold?: boolean; earlier?: number; stamped?: boolean; empty?: boolean; latency?: number } = {}) {
  localStorage.clear();
  sessionStorage.clear();
  // The made-up leftovers are not real dispositions: their refusal is logged and expected.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const drive = new FakeDrive();
  const rootId = (await seedFakeDrive(drive, 'slow-report', Date.now())) as string;
  await liveShape(drive, rootId, { earlier: opts.earlier, stamped: opts.stamped });
  if (opts.empty) {
    // Everything in the Inbox is filed or removed; the records of earlier runs stay in `.bower/piles`.
    const all = await drive.listAll(rootId);
    const inbox = all.find((f) => f.folder && drive.pathOf(f.id, rootId) === 'Inbox');
    for (const f of all) if (inbox && f.parents.includes(inbox.id)) await drive.trash(f.id);
  }
  const runs = new FakeRunService({ drive, scale: 'instant' });
  const worker = new FakeWorker({ drive, scenario: 'slow-report', rootId, fresh: true, runs });
  if (opts.cold) {
    // As a page opens: nothing listed or read yet when Home asks. Each file's version, to show none changed.
    versions = new Map((await drive.listAll('root')).map((f) => [f.id, f.modifiedTime]));
    // The pretend Worker has read the folder's last run for itself, as the real one does on its own side.
    await worker.status();
    drive.latency = opts.latency ?? 300;
    drive.concurrency = 4;
    drive.calls = 0;
    live = makeLiveSources({ worker, drive, runningPiles: () => worker.runningPiles(), pollMs: 300, declarePiles: true });
    return { drive, s: live };
  }
  live = makeLiveSources({ worker, drive, runningPiles: () => worker.runningPiles(), pollMs: 300, declarePiles: true });
  const s = live;
  await s.session.current();
  await s.vault.tree();
  drive.latency = opts.latency ?? 300;
  drive.concurrency = 4;
  drive.calls = 0;
  return { drive, s };
}

/** What Home asks at once: the run, the Inbox from the listing, the full piles, the questions, the changes. */
async function homeLoad(s: LiveSources, drive: FakeDrive) {
  const start = Date.now();
  const done: Record<string, number> = {};
  const at = <T>(name: string, p: Promise<T>): Promise<T> => p.then((v) => { done[name] = Date.now() - start; return v; });
  const [run, listed, piles, questions] = await Promise.all([
    at('run', s.runs.current()),
    at('listed', s.vault.pilesListed()),
    at('piles', s.vault.piles()),
    at('questions', s.vault.questions()),
    at('changes', s.vault.changes()),
    // The side panel and the status bar read the piles as well (about 25 callers in the live trace).
    ...Array.from({ length: 6 }, (_, i) => at(`piles${i}`, s.vault.piles())),
  ]);
  return { run, listed, piles, questions, done, ms: Date.now() - start, calls: drive.calls };
}

describe('Home on the latency fake', () => {
  it('Home is complete within 35% of the call minimum on the latency fake', async () => {
    const { drive, s } = await slowReport();
    const out = await homeLoad(s, drive);
    expect(out.run?.report, 'the last tidy-up report').toBeTruthy();
    expect(out.piles.length).toBeGreaterThan(0);
    expect(out.questions.length).toBeGreaterThan(0);
    expect(out.done.listed ?? 0).toBeLessThan(1200);
    // Four calls at once at 300 ms: the floor of the Drive calls this folder needs is ceil(calls / 4) waits. Home must
    // be within 35% of it (before: 5 s for a 3.5 s floor). Under 2 s needs fewer calls, not better ordering.
    const floor = Math.ceil(out.calls / 4) * 300;
    expect(out.ms, `complete after ${out.ms} ms, ${out.calls} Drive calls, floor ${floor} ms`).toBeLessThan(floor * 1.35);
  }, 60_000);

  it('Home reads each file of the live-shaped folder once in one load (golden)', async () => {
    const { drive, s } = await slowReport();
    const calls: Record<string, number> = {};
    for (const k of ['listAll', 'readText', 'readBytes', 'storedDigest'] as const) {
      const real = drive[k].bind(drive) as (...a: unknown[]) => Promise<unknown>;
      (drive as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1; return real(...a); };
    }
    const out = await homeLoad(s, drive);
    // 1 listing, 3 pile notes + questions + last tidy-up + 12 changes as text, 1 declaration as bytes (the 20 earlier runs' records are about other piles: not read),
    // no digests: the listing carries each file's checksum (inbox-read-slow; it was 7 downloads, 26 calls).
    expect(calls).toEqual({ listAll: 1, readText: 17, readBytes: 1 });
    expect(out.calls).toBe(19);
  }, 60_000);

  it('a report refresh does not restart the inbox reads', async () => {
    const { drive, s } = await slowReport();
    // The report's refresh lands in the middle of the full read; no file is read twice because of it.
    const reads = new Map<string, number>();
    const readText = drive.readText.bind(drive);
    drive.readText = async (id: string, ...rest: never[]) => {
      reads.set(id, (reads.get(id) ?? 0) + 1);
      return readText(id, ...(rest as []));
    };
    const out = await homeLoad(s, drive);
    expect(out.piles.length).toBeGreaterThan(0);
    const twice = [...reads].filter(([, n]) => n > 1).map(([id, n]) => `${drive.pathOf(id, 'root')} x${n}`);
    expect(twice.join(', '), `read more than once in one load, ${out.calls} calls`).toBe('');
  }, 60_000);

  it('a change made elsewhere between two loads is still seen after a refresh', async () => {
    const { drive, s } = await slowReport();
    drive.latency = 0;
    const before = (await s.vault.piles()).find((p) => p.text === 'Papers from Alex');
    expect(before).toBeTruthy();
    const note = (await drive.listAll('root')).find((f) => !f.folder && f.name === 'Pile note.md' && drive.pathOf(f.id, 'root').includes('Papers from Alex'));
    expect(note).toBeTruthy();
    // Another device rewrites the pile's words; this page's kept read is of the old version until it lists again.
    const text = await drive.readText(note?.id ?? '');
    await drive.writeText(note?.id ?? '', text.replace('Papers from Alex', 'Papers from Sam'), note?.modifiedTime ?? '');
    await s.vault.refresh();
    expect((await s.vault.piles()).some((p) => p.text.includes('Papers from Sam'))).toBe(true);
  }, 60_000);
});

/** Counts each Drive read of `drive` by what it asks for, keyed by the file's path. */
function countReads(drive: FakeDrive): Record<string, number> {
  const calls: Record<string, number> = {};
  for (const k of ['listAll', 'readText', 'readBytes', 'storedDigest'] as const) {
    const real = drive[k].bind(drive) as (...a: unknown[]) => Promise<unknown>;
    (drive as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => {
      const key = `${k} ${typeof a[0] === 'string' ? drive.pathOf(a[0], 'root') : ''}`;
      calls[key] = (calls[key] ?? 0) + 1;
      return real(...a);
    };
  }
  return calls;
}

describe('one read cache serves app and runner', () => {
  it('a refresh during a read in flight never reads one file at one modifiedTime twice (C05 findings 4)', async () => {
    // Live: Home's full read took about 6 s on the latency fake, since the report's refresh landed mid-read and its
    // files were read again. Here the report's refresh and a second one land while the piles are being read, and the
    // screens read again when told, as Home's do. Nothing in the folder changes, so every file keeps its version.
    const { drive, s } = await slowReport({ cold: true });
    const calls = countReads(drive);
    const again: Promise<unknown>[] = [];
    s.vault.subscribe(() => { again.push(s.vault.piles(), s.vault.questions(), s.vault.changes()); });
    const mid = new Promise((r) => setTimeout(r, 900)).then(() => s.vault.refresh());
    const [run, piles] = await Promise.all([s.runs.current(), s.vault.piles(), s.vault.questions(), s.vault.changes(), s.vault.pilesListed(), mid]);
    await Promise.all(again);
    expect(run?.report, 'the last tidy-up report').toBeTruthy();
    expect(piles.length).toBeGreaterThan(0);
    const after = drive.calls;
    drive.latency = 0;
    expect((await drive.listAll('root')).every((f) => versions.get(f.id) === f.modifiedTime), 'no file changed').toBe(true);
    // Only the listing is read again; each file is read once at its one version.
    const twice = Object.entries(calls).filter(([k, n]) => n > 1 && !k.startsWith('listAll')).map(([k, n]) => `${k} x${n}`);
    expect(twice.join(', '), `read twice at one version, ${after} calls`).toBe('');
    expect(calls['listAll Bower']).toBe(3);
    // Before: 49 calls (questions.json x2); 48 until the pile records were read for the inbox's piles alone; 28 until the listing carried the checksums (inbox-read-slow).
    expect(after).toBe(21);
  }, 60_000);

  it('a pile note changed elsewhere after Home read it is never written over from the kept read', async () => {
    const { drive, s } = await slowReport();
    drive.latency = 0;
    const pile = (await s.vault.piles()).find((p) => p.text === 'Papers from Alex');
    const note = (await drive.listAll('root')).find((f) => !f.folder && f.name === 'Pile note.md' && drive.pathOf(f.id, 'root').includes('Papers from Alex'));
    if (!pile || !note) throw new Error('the seeded pile and its note');
    // Another device changes the words between this page's read and its save; the listing is not read again.
    const theirs = (await drive.readText(note.id)).replace('Papers from Alex', 'Papers from Sam');
    await drive.writeText(note.id, theirs, note.modifiedTime);
    await expect(s.vault.updatePile(pile.id, 'Papers from Alex, sorted', pile.text)).rejects.toMatchObject({ code: 'conflict' });
    expect(await drive.readText(note.id)).toBe(theirs);
  }, 60_000);
});


describe('Home reads only the records of the piles in the inbox (TL-P4-16 b)', () => {
  it('Home makes the same Drive calls after 10 and after 500 earlier runs', async () => {
    // Live: an empty Inbox took 144 Drive calls and 59 s, since every earlier run's declaration and disposition was read.
    const made: number[] = [];
    for (const earlier of [10, 500]) {
      const { drive, s } = await slowReport({ cold: true, earlier, latency: 0 });
      await homeLoad(s, drive);
      made.push(drive.calls);
      live?.dispose();
      live = null;
    }
    expect(made[1], `Drive calls after 10 and after 500 earlier runs: ${made.join(' and ')}`).toBe(made[0]);
  }, 120_000);

  it('the questions do not wait for the full read of the piles', async () => {
    const { drive, s } = await slowReport({ cold: true });
    const out = await homeLoad(s, drive);
    expect(out.questions.length).toBeGreaterThan(0);
    expect(out.done.questions ?? 0, `questions after ${out.done.questions} ms, piles after ${out.done.piles} ms`).toBeLessThanOrEqual(out.done.piles ?? 0);
  }, 60_000);

  it('an empty inbox reads no stamped pile record, only the current unstamped one', async () => {
    const { drive, s } = await slowReport({ cold: true, earlier: 30, empty: true, latency: 0 });
    const calls = countReads(drive);
    const out = await homeLoad(s, drive);
    expect(out.piles).toEqual([]);
    const records = Object.keys(calls).filter((k) => !k.startsWith('listAll') && k.includes('.bower/piles/'));
    const stamped = records.filter((k) => /\/(declaration-old-|disposition-)/.test(k));
    expect(stamped, 'stamped pile records read').toEqual([]);
    const unstamped = records.filter((k) => !stamped.includes(k));
    expect(unstamped, `${out.calls} Drive calls, ${records.length} pile records read`).toHaveLength(1);
    expect(unstamped[0]).toMatch(/^readBytes Bower\/\.bower\/piles\/declaration-/);
    expect(calls[unstamped[0] ?? ''], 'current unstamped declaration reads').toBe(1);
  }, 60_000);

  it('an unstamped pile record is not read', async () => {
    // Records with no pile id (staging test folders only) are left alone: Home shows the same piles and reads none of them.
    const plain = await slowReport({ cold: true, earlier: 0, latency: 0 });
    const expected = (await homeLoad(plain.s, plain.drive)).piles.map((p) => p.text);
    live?.dispose();
    const { drive, s } = await slowReport({ cold: true, earlier: 6, stamped: false, latency: 0 });
    const calls = countReads(drive);
    const out = await homeLoad(s, drive);
    expect(out.piles.map((p) => p.text)).toEqual(expected);
    expect(expected).toContain('Papers from Alex');
    const read = Object.keys(calls).filter((k) => !k.startsWith('listAll') && /\/(declaration-old-|disposition-)/.test(k));
    expect(read, 'unstamped records read').toEqual([]);
  }, 60_000);
});
