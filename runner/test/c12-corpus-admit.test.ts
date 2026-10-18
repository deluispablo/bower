/**
 * C12's admission-wait case through production main (c12-corpus AC14): the estimate is 2 here (`vi.mock`, as
 * c12-admit.test.ts does; 144 for real), so the third one-notice pile waits untouched and is filed by the next press.
 * A file of its own: the mock applies to the whole file.
 */
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase, timelineOf } from '../src/corpus';
import { AT, caseReplies, inboxAsSeeded, perPress, runWithClaude, type CaseRun } from './corpus-run';

vi.mock('../src/timing', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/timing')>()), ADMIT_THINGS: 2 }));

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const reportOf = (r: CaseRun) => (r.lastRun as { run?: { report?: { filed: unknown[]; setAside: unknown[]; waiting?: number; nothingReady?: true } } } | null)?.run?.report;

describe('C12 admission wait through main (c12-corpus AC14)', () => {
  it('AC14 c12-corpus-admission-waits: the pile past the estimate waits untouched and is counted; the next tidy-up files it; both presses score clean', async () => {
    const c = await loadCase(join(resolve(import.meta.dirname, '../../testing/corpus'), 'c12-admission-waits'));
    const model = perPress(caseReplies('c12-admission-waits'));
    const run = await runWithClaude(c, model.claude);
    expect(run.score).toEqual({ pass: true, unmet: [] });
    const [one] = run.runs ?? [];
    if (!one) throw new Error('Press 1 is missing.');
    expect(one.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(model.calls, 'each press: selection and one writing call').toEqual([2, 2]);
    expect(reportOf(one)).toMatchObject({ waiting: 1 });
    expect(reportOf(one)?.filed).toHaveLength(2);
    expect(reportOf(one)?.setAside, 'a waiting pile has no row').toHaveLength(0);
    expect(reportOf(one)).not.toHaveProperty('nothingReady');
    const { now, was } = await inboxAsSeeded(c, one, 'Compost notice.txt');
    expect(now, 'the compost notice is still in the inbox as it was').toEqual(was);
    expect(timelineOf(one.after['Areas/Home/Garden plot.md'] ?? '').filter((l) => /compost/i.test(l)), 'the plot has no compost line yet').toEqual([]);
    expect(run.after['Areas/Home/Compost notice.txt'], 'press 2 files the notice').toBe(c.inboxFiles['Compost notice.txt']);
    expect(timelineOf(run.after['Areas/Home/Garden plot.md'] ?? '').filter((l) => l.includes('The compost bins have been emptied.')), 'its line once').toHaveLength(1);
    expect(Object.keys(run.after).filter((p) => p.startsWith('Inbox/')), 'the inbox is empty').toEqual([]);
    expect(reportOf(run), 'nothing waits after press 2').not.toHaveProperty('waiting');
  });
});
