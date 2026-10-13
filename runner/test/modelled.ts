import { resolve } from 'node:path';
import { setTimeout as realSleep } from 'node:timers/promises';
import type { Checkpoint } from '../../src/data/contracts/run-checkpoint';
import { loadCorpus } from '../src/corpus';
import { runScripted, type Before } from './corpus-run';
import { API, paging } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
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
  /** For a create: whether the folder it goes into was made by an earlier write of this run. */
  intoMade?: boolean;
}

/**
 * A run of the C04 case where every call takes its modelled latency on a clock of its own: a call waits until the run
 * has nothing else to do, then the clock jumps to the earliest due call. Calls the runner makes at the same time
 * overlap as they would on the wire, and the run's time is the clock's. No real waiting beyond a few milliseconds.
 * `before` changes the folder before the run (earlier runs' records, for a variant).
 */
export async function modelled(before?: Before, env?: Record<string, string>): Promise<{ calls: Call[]; ms: number; code: number; checkpoints: Checkpoint[]; timing: string }> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-offer-and-flat');
  if (!c) throw new Error('the C04 case is missing');
  // Drive's own page size, so a listing is the one call it is on Drive.
  paging.size = 1000;
  const calls: Call[] = [];
  /** Every checkpoint the run created, in order: the record is the second part of its multipart create. */
  const checkpoints: Checkpoint[] = [];
  const names = new Map<string, string>();
  /** The folders the run's own writes made, by id. */
  const made = new Set<string>();
  const due: Array<{ at: number; wake: () => void }> = [];
  let clock = 0;
  let settled = false;
  // The run's one timing line, as the runner logs it (`timing.ts`): what a test reads of timing's own counts.
  const logged: string[] = [];
  const log = console.log.bind(console);
  console.log = (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && args[0].startsWith('timing: ')) logged.push(args[0]);
    log(...args);
  };
  const running = runScripted(c, (inner) => async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const worker = url.origin === API;
    const kind = worker ? (url.pathname.endsWith('/token') ? 'token' : url.pathname.endsWith('/attempt') ? 'attempt' : 'status') : method === 'GET' ? 'read' : 'write';
    const call: Call = { kind, method, path: `${url.pathname}${url.search}`, at: clock };
    calls.push(call);
    if (method === 'POST' && !worker) {
      const sent = await new Response(init?.body).clone().text();
      const parent = /"parents":\["([^"]+)"\]/.exec(sent)?.[1];
      if (parent !== undefined) call.intoMade = made.has(parent);
    }
    if (method === 'POST' && url.searchParams.get('uploadType') === 'multipart') {
      const text = await new Response(init?.body).text();
      if (/"name":"checkpoint-\d+-/.test(text)) checkpoints.push(JSON.parse(text.split(/\r\n--[^\r\n]+/)[1]?.split('\r\n\r\n')[1] ?? '{}') as Checkpoint);
    }
    await new Promise<void>((wake) => due.push({ at: clock + (worker ? WORKER_MS : DRIVE_MS), wake }));
    const res = await inner(input, init);
    if (kind === 'write') {
      const id = url.pathname.split('/').pop() ?? '';
      const body = (await res.clone().json().catch(() => null)) as { id?: string; name?: string } | null;
      if (body?.id && body.name) names.set(body.id, body.name);
      if (method === 'POST' && body?.id) made.add(body.id);
      const named = names.get(body?.id ?? id);
      if (named) call.name = named;
    } else if (kind === 'read') {
      const named = names.get(url.pathname.split('/').pop() ?? '');
      if (named) call.name = named;
    }
    return res;
  }, true, before, env).finally(() => {
    settled = true;
    console.log = log;
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
  return { calls, ms: clock, code: run.code, checkpoints, timing: logged.at(-1) ?? '' };
}


/** What a `timing:` line counted per phase: Drive calls and bytes (`drive=reads:17/4096,...`), and the region. */
export function countsOf(line: string): { phases: Record<string, { calls: number; bytes: number }>; region: string | null } {
  const phases: Record<string, { calls: number; bytes: number }> = {};
  for (const m of (/ drive=(\S+)/.exec(line)?.[1] ?? '').split(',')) {
    const x = /^(\w+):(\d+)\/(\d+)$/.exec(m);
    if (x) phases[x[1] ?? ''] = { calls: Number(x[2]), bytes: Number(x[3]) };
  }
  return { phases, region: / region=(\S+)/.exec(line)?.[1] ?? null };
}

/** Drive calls in all, as timing counted them. */
export const drivecalls = (line: string): number => Object.values(countsOf(line).phases).reduce((n, p) => n + p.calls, 0);
