/**
 * qa7-refused-words (qa-7 Claude F6, F7): the words of a finished run say only what happened.
 * F6: a request Bower refused (it names more than three notes) is reported as "1 change of yours read", though the
 * person changed nothing: a request is never counted among the changes of theirs read, done or not.
 * F7: a request the run did nothing for, with no "didn't" row (the pretend planner cannot act on it), is still called
 * done ("Done. See what changed in your folders."). It says it changed nothing, and the sheet does not call it done.
 * Made-up words only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '@/data/drive/fake-drive';
import { seedFakeDrive } from '@/data/fake/seed';
import { DriveVault } from '@/data/vault/drive-vault';
import { DemoWorld } from '@/data/demo/world';
import { SYSTEM } from '@/data/vault/layout';
import { REQUEST_DONE } from '@/data/spine/scripted';
import type { RunReport, RunState } from '@/data/types';
import { tidyUp } from '@/testing/tidy-up';
import { runDetail } from './run-words';

let drive: FakeDrive;
let root: string;
const vault = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
const done = (scope: RunState['scope'], report: RunReport): RunState =>
  ({ id: 'r', scope, phase: 'done', requestedAt: 0, phaseAt: 1, finishedAt: 1, seen: false, report });
const CHANGES_OF_YOURS = /changes? of yours/;
// Names four notes: Bower refuses it ("names more than three").
const REFUSED = 'Add a line to Flat hunt, Flat 7, Cobble Row, Flat 3, 12 Larkspur Lane and Money about the rent going up';
const CHORE = 'Put my visa papers together';
const QUESTION = 'Which flat is closest to Ferrowick?';
// The engine's one line for a request the run did nothing for (ruling 2, round 2), exported beside REQUEST_DONE.
const NOTHING_DONE = "Bower didn't change anything for this request.";
const fileAt = async (path: string) => {
  const f = (await drive.listAll(root)).find((x) => drive.pathOf(x.id, root) === path);
  if (!f) throw new Error(`${path} is not in the seed`);
  return f;
};

beforeEach(async () => {
  vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  localStorage.clear();
  drive = new FakeDrive();
  root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AC1 a request is never one of your changes read', () => {
  it('AC1 qa7-refused-words-refused: a refused request is not reported as a change of yours read', async () => {
    await vault().addRequest(REFUSED);
    const out = await tidyUp(drive, root, 'instructions');
    if (out.phase !== 'done') throw new Error('the run failed');
    // Positive control: Bower refused it, and says why in its row.
    expect(out.report.leftAsWritten?.map((r) => r.why)).toEqual(["Bower didn't update any note: this request names more than three. Ask for three at most at a time."]);
    expect(out.report.requests ?? []).not.toContain(REFUSED);
    expect(out.report.yourChanges ?? 0).toBe(0);
    expect(runDetail(done('instructions', out.report))).not.toMatch(CHANGES_OF_YOURS);
  });

  it('AC1 qa7-refused-words-undoes: a stored request whose undoes names nothing here settles as a request, counted as none of your changes', async () => {
    // Bower never writes a request with `undoes`; a line written elsewhere may carry one. Undo takes back no request.
    const changes = await fileAt(SYSTEM.changes);
    const id = '2026-10-10T11-00-00.000Z-undoes';
    await drive.createText(changes.id, `${id}.json`, `${JSON.stringify({ v: 1, id, at: Date.now() - 1000, kind: 'request', what: `Asked Bower: "${CHORE}"`, text: CHORE, device: 'DEVICE_B', undoes: 'LINE_GONE' })}\n`);
    const out = await tidyUp(drive, root, 'instructions');
    if (out.phase !== 'done') throw new Error('the run failed');
    // Positive control: the line was read and settled.
    expect((await vault().requests()).map((r) => r.text)).toEqual([CHORE]);
    expect(out.report.updated).toEqual([]);
    expect(out.report.yourChanges ?? 0).toBe(0);
    expect((await vault().requests())[0]?.done).toBe(NOTHING_DONE);
  });

  it('AC1 qa7-refused-words-real-change: a change the person made beside a refused request is still counted once', async () => {
    await vault().addRequest(REFUSED);
    await vault().rename('Resources/Cooking/Lemon tart.md', 'Lemon tart, best');
    const out = await tidyUp(drive, root, 'instructions');
    if (out.phase !== 'done') throw new Error('the run failed');
    expect(out.report.yourChanges).toBe(1);
    expect(runDetail(done('instructions', out.report))).toBe('1 change of yours read.');
  });

  it('AC1 qa7-refused-words-demo: the demo does not count a request it did nothing for as a change of yours', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { vault: demo, runs } = w.sources();
    await demo.addRequest('Look up the council tax band for Flat 3');
    await runs.start('instructions', { allowWeb: false });
    await vi.runAllTimersAsync();
    const run = await runs.current();
    if (run?.phase !== 'done' || !run.report) throw new Error('the run did not finish');
    expect(run.report.requests ?? []).toEqual([]);
    expect(run.report.yourChanges ?? 0).toBe(0);
    expect(runDetail(run)).not.toMatch(CHANGES_OF_YOURS);
  });
});

describe('AC2 a request the run did nothing for is not called done', () => {
  it('AC2 qa7-refused-words-chore: a request with no row and no change says so, and the sheet does not call it done', async () => {
    await vault().addRequest(QUESTION);
    await vault().addRequest(CHORE);
    const out = await tidyUp(drive, root, 'instructions');
    if (out.phase !== 'done') throw new Error('the run failed');
    const asked = new Map((await vault().requests()).map((r) => [r.text, r.done ?? '']));
    // Positive control: a question answered from the notes is done, with its links.
    expect(asked.get(QUESTION)).toContain('[[Flat 7, Cobble Row]] has the shortest commute');
    expect(out.report.requests).toEqual([QUESTION]);
    expect(asked.get(CHORE)).not.toBe(REQUEST_DONE);
    expect(asked.get(CHORE)).toBe(NOTHING_DONE);
    expect(out.report.yourChanges ?? 0).toBe(0);
  });

  it('AC2 qa7-refused-words-chore-demo: the demo does not call a request it did nothing for done', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { vault: demo, runs } = w.sources();
    await demo.addRequest(CHORE);
    await runs.start('instructions', { allowWeb: false });
    await vi.runAllTimersAsync();
    const run = await runs.current();
    if (run?.phase !== 'done' || !run.report) throw new Error('the run did not finish');
    expect((await demo.requests())[0]?.done).toBe(NOTHING_DONE);
    expect(run.report.requests ?? []).toEqual([]);
    expect(runDetail(run)).not.toMatch(/\bdone\b/);
  });

  it('AC2 qa7-refused-words-replay: a completion an earlier run stored stands verbatim when this run does nothing for the request', async () => {
    const asked = await vault().addRequest(CHORE);
    // An earlier run completed it in its own words, but its line was not archived then.
    const earlier = { id: asked.id, text: CHORE, at: asked.at, done: 'Done. Your visa papers are together in Admin.' };
    const requests = await fileAt(SYSTEM.requests);
    await drive.writeText(requests.id, `${JSON.stringify({ v: 1, done: [earlier] }, null, 2)}\n`, requests.modifiedTime);
    const out = await tidyUp(drive, root, 'instructions');
    if (out.phase !== 'done') throw new Error('the run failed');
    expect((await vault().requests()).filter((r) => r.id === asked.id).map((r) => r.done)).toEqual([earlier.done]);
    expect(out.report.requests).toEqual([CHORE]);
  });

  it('AC2 qa7-refused-words-replay-not-done: a stored row that says nothing was done stands verbatim and is never relisted as done', async () => {
    const asked = await vault().addRequest(CHORE);
    // An earlier run did nothing for it (round 3, ruling 7), and its line was not archived then.
    const earlier = { id: asked.id, text: CHORE, at: asked.at, done: NOTHING_DONE };
    const requests = await fileAt(SYSTEM.requests);
    await drive.writeText(requests.id, `${JSON.stringify({ v: 1, done: [earlier] }, null, 2)}\n`, requests.modifiedTime);
    const out = await tidyUp(drive, root, 'instructions');
    if (out.phase !== 'done') throw new Error('the run failed');
    expect((await vault().requests()).filter((r) => r.id === asked.id).map((r) => r.done)).toEqual([NOTHING_DONE]);
    expect(out.report.requests ?? []).toEqual([]);
    expect(out.report.yourChanges ?? 0).toBe(0);
  });
});
