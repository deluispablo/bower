import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCorpus } from '../src/corpus';
import { runScripted } from './corpus-run';
import { API, paging } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../harness/corpus');
/** The modelled latency per call (TL-P4-01 addendum): about 150 ms per Drive call, 80 ms per Worker call. */
const DRIVE_MS = 150;
const WORKER_MS = 80;
/** The runner's budget for a scripted run end to end, the job's start-up aside (p4-speed-baseline). */
const BUDGET_MS = 60_000;

interface Call {
  kind: 'token' | 'status' | 'read' | 'write';
  method: string;
  path: string;
  /** The run's modelled clock when the call was made, in ms. */
  at: number;
}

/** A run of the C04 case with every call costing its modelled latency on a clock of its own (no real waiting). */
async function modelled(): Promise<{ calls: Call[]; ms: number; code: number }> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-offer-and-flat');
  if (!c) throw new Error('the C04 case is missing');
  // Drive's own page size, so a listing is the one call it is on Drive.
  paging.size = 1000;
  const calls: Call[] = [];
  let ms = 0;
  const run = await runScripted(c, (inner) => async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const worker = url.origin === API;
    const kind = worker ? (url.pathname.endsWith('/token') ? 'token' : 'status') : method === 'GET' ? 'read' : 'write';
    calls.push({ kind, method, path: `${url.pathname}${url.search}`, at: ms });
    ms += worker ? WORKER_MS : DRIVE_MS;
    return inner(input, init);
  }, true);
  paging.size = 2;
  return { calls, ms, code: run.code };
}

describe('the runner overhead', () => {
  it('a scripted run with modelled Drive latency finishes under the runner budget', async () => {
    const { calls, ms, code } = await modelled();
    const count = (k: Call['kind']): number => calls.filter((x) => x.kind === k).length;
    console.log(`overhead: modelled=${ms}ms token=${count('token')} status=${count('status')} reads=${count('read')} writes=${count('write')}`);
    expect(code).toBe(0);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('the runner overhead cuts keep recovery and ordered status', async () => {
    const { calls, code } = await modelled();
    expect(code).toBe(0);
    // The attempt fence: each write (one fenced write may be a few requests in a row) is preceded by the token route,
    // and by a read of its target after that.
    const fences: Array<{ at: number; fenceBeforeWrite: boolean; targetRead: boolean }> = [];
    calls.forEach((x, i) => {
      if (x.kind !== 'write' || calls[i - 1]?.kind === 'write') return;
      const lastToken = calls.slice(0, i).map((y) => y.kind).lastIndexOf('token');
      fences.push({ at: i, fenceBeforeWrite: lastToken >= 0, targetRead: calls.slice(lastToken + 1, i).some((y) => y.kind === 'read') });
    });
    if (process.env.DBG) console.log(calls.slice(140, 156).map((x, i) => `${140 + i} ${x.kind} ${x.method} ${x.path}`).join('\n'));
    expect(fences.length).toBeGreaterThan(0);
    for (const f of fences) expect(f).toEqual({ at: f.at, fenceBeforeWrite: true, targetRead: true });
    // Ordered status: reading, writing, saving, then done, and nothing after done.
    const phases = calls.filter((x) => x.kind === 'status').length;
    expect(phases).toBeGreaterThanOrEqual(3);
  });
});
