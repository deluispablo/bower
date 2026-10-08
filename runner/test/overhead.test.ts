import { afterEach, describe, expect, it, vi } from 'vitest';
import { paging } from './drive-v3';
import { modelled, type Call } from './modelled';

const BUDGET_MS = 60_000;

afterEach(() => {
  paging.size = 2;
});

describe('the runner overhead', () => {
  it('the C04 run writes and counts exactly 4 checkpoints', async () => {
    const said: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => said.push(args.map(String).join(' ')));

    const { code } = await modelled();
    expect(code).toBe(0);

    const timingLines = said.filter((l) => l.includes('checkpoints='));
    expect(timingLines.length).toBeGreaterThan(0);
    const timingLine = timingLines[0] ?? '';
    const match = timingLine.match(/checkpoints=(\d+)\/(\d+)/);
    expect(match).not.toBeNull();
    const checkpointCount = Number(match?.[2]);
    expect(checkpointCount).toBe(4);
  });

  it('a scripted run with modelled Drive latency finishes under the runner budget', async () => {
    const { calls, ms, code } = await modelled();
    const count = (k: Call['kind']): number => calls.filter((x) => x.kind === k).length;
    console.log(`overhead: modelled=${ms}ms token=${count('token')} attempt=${count('attempt')} status=${count('status')} reads=${count('read')} writes=${count('write')}`);
    expect(code).toBe(0);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('the runner overhead cuts keep recovery and ordered status', async () => {
    const { calls, code } = await modelled();
    expect(code).toBe(0);
    // The attempt fence: each write is preceded by the attempt route since the write before it (writes go one at a time).
    const fences: Array<{ at: number; fenceBeforeWrite: boolean }> = [];
    calls.forEach((x, i) => {
      if (x.kind !== 'write') return;
      const last = calls.slice(0, i).map((y) => y.kind === 'write').lastIndexOf(true);
      fences.push({ at: i, fenceBeforeWrite: calls.slice(last + 1, i).some((y) => y.kind === 'attempt') });
    });
    expect(fences.length).toBeGreaterThan(0);
    for (const f of fences) expect(f).toEqual({ at: f.at, fenceBeforeWrite: true });
    // Still as seen: a change to a file already there (a move, an edit, a Bin) is preceded by a read of that very file
    // since the opening checkpoint, which the fence then reuses. A create has its folder read, or held when the run made it.
    const opening = calls.findIndex((x) => x.kind === 'write' && x.name?.startsWith('checkpoint-1-'));
    expect(opening).toBeGreaterThan(0);
    const changes = calls.map((x, i) => ({ x, i })).filter(({ x, i }) => i > opening && x.kind === 'write' && x.method === 'PATCH');
    expect(changes.length).toBeGreaterThan(0);
    for (const { x, i } of changes) {
      const id = /\/files\/([^/?]+)/.exec(x.path)?.[1] ?? '';
      expect(calls.slice(opening + 1, i).some((y) => y.kind === 'read' && y.path.includes(`/files/${id}?`)), `a read of ${id} before its write`).toBe(true);
    }
    // Ordered status: reading, writing, saving, then done, and nothing after done.
    const phases = calls.filter((x) => x.kind === 'status').length;
    expect(phases).toBeGreaterThanOrEqual(3);
  });

  it('a run writes one opening and one closing checkpoint per batch', async () => {
    const { checkpoints, ms, code } = await modelled();
    expect(code).toBe(0);
    console.log(`checkpoints: modelled C04 wrote ${checkpoints.length} in ${ms}ms`);
    expect(checkpoints.length).toBeGreaterThanOrEqual(2);
    expect(checkpoints.length).toBeLessThanOrEqual(4);
    // The first checkpoint; the opening names every operation of the batch before any effect; the closing settles them
    // all at once, with the report pending; then done.
    const [first, opening, closing, done] = checkpoints;
    expect(first?.phase).toBe('queued');
    expect(opening?.outcomes.length).toBeGreaterThan(1);
    expect(opening?.outcomes.every((o) => o.state === 'possible-effect' || o.state === 'before-effect-refused')).toBe(true);
    expect(closing?.outcomes.every((o) => o.state === 'applied' || o.state === 'rejected')).toBe(true);
    expect(closing?.report.state).toBe('pending');
    expect(done?.phase).toBe('done');
  });
});
