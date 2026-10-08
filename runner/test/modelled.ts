import { resolve } from 'node:path';
import { setTimeout as realSleep } from 'node:timers/promises';
import { loadCorpus } from '../src/corpus';
import { runScripted } from './corpus-run';
import { API, paging } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../harness/corpus');
/** The modelled latency per call (TL-P4-01 addendum): about 150 ms per Drive call, 80 ms per Worker call. */
export const DRIVE_MS = 150;
export const WORKER_MS = 80;

export interface Call {
  kind: 'token' | 'attempt' | 'status' | 'read' | 'write';
  method: string;
  path: string;
  /** The run's modelled clock when the call was made, in ms. */
  at: number;
  /** For a write, the name of the file it made or changed (known once Drive answered). */
  name?: string;
}

/**
 * A run of the C04 case where every call takes its modelled latency on a clock of its own: a call waits until the run
 * has nothing else to do, then the clock jumps to the earliest due call. Calls the runner makes at the same time
 * overlap as they would on the wire, and the run's time is the clock's. No real waiting beyond a few milliseconds.
 */
export async function modelled(): Promise<{ calls: Call[]; ms: number; code: number }> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-offer-and-flat');
  if (!c) throw new Error('the C04 case is missing');
  // Drive's own page size, so a listing is the one call it is on Drive.
  paging.size = 1000;
  const calls: Call[] = [];
  const names = new Map<string, string>();
  const due: Array<{ at: number; wake: () => void }> = [];
  let clock = 0;
  let settled = false;
  const running = runScripted(c, (inner) => async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const worker = url.origin === API;
    const kind = worker ? (url.pathname.endsWith('/token') ? 'token' : url.pathname.endsWith('/attempt') ? 'attempt' : 'status') : method === 'GET' ? 'read' : 'write';
    const call: Call = { kind, method, path: `${url.pathname}${url.search}`, at: clock };
    calls.push(call);
    await new Promise<void>((wake) => due.push({ at: clock + (worker ? WORKER_MS : DRIVE_MS), wake }));
    const res = await inner(input, init);
    if (kind === 'write') {
      const id = url.pathname.split('/').pop() ?? '';
      const body = (await res.clone().json().catch(() => null)) as { id?: string; name?: string } | null;
      if (body?.id && body.name) names.set(body.id, body.name);
      const named = names.get(body?.id ?? id);
      if (named) call.name = named;
    } else if (kind === 'read') {
      const named = names.get(url.pathname.split('/').pop() ?? '');
      if (named) call.name = named;
    }
    return res;
  }, true).finally(() => {
    settled = true;
  });
  let waiting = -1;
  while (!settled) {
    await realSleep(1);
    // Quiet: no new call arrived since the last look, so the earliest due call is next.
    if (due.length === 0 || due.length !== waiting) {
      waiting = due.length;
      continue;
    }
    due.sort((x, y) => x.at - y.at);
    const next = due.shift();
    if (!next) continue;
    clock = Math.max(clock, next.at);
    waiting = -1;
    next.wake();
  }
  const run = await running;
  return { calls, ms: clock, code: run.code };
}

