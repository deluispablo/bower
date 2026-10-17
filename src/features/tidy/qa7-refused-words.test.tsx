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
    expect(asked.get(CHORE)).toMatch(/^Bower didn't /);
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
    expect((await demo.requests())[0]?.done).not.toBe(REQUEST_DONE);
    expect(run.report.requests ?? []).toEqual([]);
    expect(runDetail(run)).not.toMatch(/\bdone\b/);
  });
});
