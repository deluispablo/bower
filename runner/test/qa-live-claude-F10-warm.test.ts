import { resolve } from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { READ_AHEAD } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { loadCorpus } from '../src/corpus';
import { RunnerDrive } from '../src/drive';
import { refreshPlanning } from '../src/index';
import { LedgerExhausted, RunTiming } from '../src/timing';
import { RunnerToken } from '../src/token';
import { note } from './b1-planning-support';
import { runScripted, type CaseRun } from './corpus-run';
import { API, RUN_ID, TICKET, driveV3, paging } from './drive-v3';

const pageSize = paging.size;
afterEach(() => { vi.restoreAllMocks(); paging.size = pageSize; });

async function changedNotes() {
  paging.size = 1000;
  const c = (await loadCorpus(resolve(import.meta.dirname, '../../testing/corpus')))
    .find((c) => c.id === 'c04-offer-and-flat');
  if (!c) throw new Error('The C04 case is missing');
  const run = await runScripted(c, undefined, false, async (drive, root) => {
    const folder = (await drive.listAll(root)).find((file) => file.folder && file.name === 'Archive');
    if (!folder) throw new Error('The Archive folder is missing');
    for (const name of ['Earlier evidence', 'Other evidence']) {
      await drive.createText(folder.id, `${name}.md`, note(`${name}.`, 'Recorded evidence.\n', true));
    }
    // Reverse insertion order makes path ordering observable, including mixed case.
    for (let i = READ_AHEAD + 1; i >= 0; i--) {
      await drive.createText(folder.id, `${i % 2 ? 'record' : 'Record'} ${i}.md`,
        `---\nsummary: Background ${i}.\n---\nPersonal evidence.\n`);
    }
  });
  expect(run.code).toBe(0);
  expect(run.after[SYSTEM.index]).toBeDefined();
  const state = JSON.parse(run.after[SYSTEM.retrieval] ?? '{}') as NonNullable<Awaited<ReturnType<typeof refreshPlanning>>['state']>;
  const notes = Object.entries(state.files).sort(([, a], [, b]) => a.path.localeCompare(b.path));
  expect(notes.filter(([, note]) => note.owner === 'bower').length).toBeGreaterThanOrEqual(6);
  for (const [id] of notes) {
    const file = await run.drive.get(id);
    await run.drive.writeText(id, `${await run.drive.readText(id)}\nChanged evidence.\n`, file.modifiedTime);
  }
  const listing = await run.drive.listAll(run.root);
  const changed = listing.filter((file) => state.files[file.id]
    && state.files[file.id]?.version !== file.modifiedTime);
  expect(changed.length, 'both probes exercise at least READ_AHEAD + 2 changed notes').toBeGreaterThanOrEqual(READ_AHEAD + 2);
  expect(changed).toHaveLength(notes.length);
  return { run, ids: notes.map(([id]) => id) };
}

async function refresh(run: CaseRun, ids: string[], spent = 0) {
  const wire = driveV3(run.drive);
  const timing = new RunTiming();
  const starts: Array<{ id: string; afterRefusal: boolean }> = [];
  const sends: Array<{ id: string; range: string | null; afterRefusal: boolean }> = [];
  const held: Array<() => void> = [];
  let refused = false;
  let active = 0;
  let peak = 0;
  let calls = 0;
  const meter = timing.meter.bind(timing);
  vi.spyOn(timing, 'meter').mockImplementation((fetch) => {
    const measured = meter(fetch);
    return async (url, init) => {
      try { return await measured(url, init); }
      catch (error) {
        if (error instanceof LedgerExhausted) refused = true;
        throw error;
      }
    };
  });
  // Successful fake responses and a failing retry hook: each read gets one metered call, never a retry (FW3).
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin === 'https://www.googleapis.com') calls++;
    const id = url.pathname.split('/').at(-1) ?? '';
    const note = ids.includes(id) && url.searchParams.get('alt') === 'media';
    if (note) {
      sends.push({ id, range: new Headers(init?.headers).get('range'), afterRefusal: refused });
      peak = Math.max(peak, ++active);
      await new Promise<void>((release) => held.push(release));
    }
    try { return await wire.fetch(input, init); }
    finally { if (note) active--; }
  };
  const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch, now: () => wire.now });
  const adapter = new RunnerDrive({ token, attempt: 1, fetch, timing,
    pacing: { sleep: async () => { throw new Error('This transport must not retry'); } } });
  const prefix = adapter.readPrefix.bind(adapter);
  vi.spyOn(adapter, 'readPrefix').mockImplementation((file, cold) => {
    starts.push({ id: file.id, afterRefusal: refused });
    return prefix(file, cold);
  });
  let settled = false;
  const pending = timing.maintenance(async () => {
    // Spend real metered metadata calls, leaving room for discovery and only part of the changed set.
    for (let i = 0; i < spent; i++) await adapter.get(run.root);
    return refreshPlanning(adapter, run.root);
  }).finally(() => { settled = true; });
  // Hold reads across an event-loop turn, then release in reverse order; no elapsed-time assertion.
  while (!settled) {
    await nextTurn();
    held.pop()?.();
  }
  return { result: await pending, starts, sends, peak, calls, refused };
}

it('f10-warm-discovery overlaps changed prefixes in path order within the maintenance ledger', async () => {
  const { run, ids } = await changedNotes();
  const full = await refresh(run, ids);
  expect(full.result.state).toBeDefined();
  expect(full.result.exhausted).toBeUndefined();
  expect.soft(full.peak, '2 or more reads in flight').toBeGreaterThanOrEqual(2);
  expect(full.peak, 'never more than READ_AHEAD').toBeLessThanOrEqual(READ_AHEAD);
  expect(full.starts.map((read) => read.id)).toEqual(ids);
  expect(full.sends.map((read) => read.id)).toEqual(ids);
  expect(full.sends.every((read) => read.range === 'bytes=0-4095')).toBe(true);

  const allowed = 5;
  const discoveryCalls = full.calls - ids.length;
  const partial = await refresh(run, ids, 300 - discoveryCalls - allowed);
  expect(partial.refused).toBe(true);
  expect(partial.result.exhausted).toBeInstanceOf(LedgerExhausted);
  expect(partial.calls, 'the real maintenance ledger permits exactly 300 calls').toBe(300);
  expect(partial.sends.map((read) => read.id), 'landed notes are a localeCompare path-order prefix')
    .toEqual(ids.slice(0, allowed));
  expect(partial.starts.map((read) => read.id)).toEqual(ids.slice(0, partial.starts.length));
  expect(partial.starts.length, 'some changed notes remain queued at refusal').toBeLessThan(ids.length);
  expect(partial.starts.filter((read) => read.afterRefusal), 'no read starts after refusal').toEqual([]);
  expect(partial.sends.filter((read) => read.afterRefusal), 'no send escapes the ledger').toEqual([]);
  expect(partial.peak).toBeLessThanOrEqual(READ_AHEAD);
});
