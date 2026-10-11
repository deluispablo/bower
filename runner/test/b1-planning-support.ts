/** B1d observations over the existing corpus/main driver. Nothing here substitutes for planning or validation. */
import { resolve } from 'node:path';
import { appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, vi } from 'vitest';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { PILE_NOTE } from '../../src/data/piles';
import { parseNote } from '../../src/data/contracts/note-format';
import { SYSTEM, isHidden, type RetrievalFile } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';
import type { ClaudeCall, ClaudeExit, ClaudeSpawn } from '../src/claude';
import { loadCase } from '../src/corpus';
import { AT, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { API, RUN_ID, TICKET, driveV3, fixedDrive } from './drive-v3';
import { planningIndex } from '../src/index';
import { RunnerDrive } from '../src/drive';
import { RunnerToken } from '../src/token';
import { observe, type Observation } from './b23-hot-observe';

export const HUB = 'Projects/Remote search/Remote search.md';
export const PERSONAL = 'Resources/Careers/Applications.md';
export const empty = { kind: 'tidy-intent', v: 1, things: [] };
export const note = (summary: string, body = 'Alex keeps this original evidence.\n', owned = false) =>
  `---\nsummary: ${summary}\n${owned ? 'by: bower\n' : ''}---\n\n${body}`;
export const folder = {
  [HUB]: note('Alex records remote developer offers.', '# Remote search\n\n## Current state\n\n## My plans\nAlex keeps afternoons free.\n\n## Timeline\n', true),
  [PERSONAL]: note('Alex records remote developer applications.', '# Applications\n\n## My thoughts\nAlex checks remote work.\n\n## Timeline\n'),
  'Resources/Gardening/Garden plans.md': note('Alex grows herbs.', 'PERSONAL_GARDEN_BODY\n'),
};
export interface Item { itemId: string; kind: string; destination: string | { parentId: string; name: string }; wants: string[] }
export interface Selection { items: Item[]; asks: unknown[] }
export interface Frame { call: ClaudeCall; value: Record<string, unknown>; events: Observation[] }
export interface Traffic { method: string; url: URL; range: string | null; sent: number; got: number }
export type Base = Awaited<ReturnType<typeof setup>>;

export async function setup(options: {
  fixture?: string; folder?: Record<string, string>; inbox?: Array<{ line: string; files: string[] }>;
  inboxFiles?: Record<string, string>;
} = {}) {
  const c = await loadCase(resolve(import.meta.dirname, '../../harness/corpus', options.fixture ?? 'b1-index-job-offer'));
  if (!options.fixture) {
    c.folder = options.folder ?? { ...folder }; c.folderBinary = {}; c.expected = {}; c.questions = [];
    c.journal = []; c.scope = 'all'; c.presses = undefined; c.between = undefined;
    c.inbox = options.inbox ?? [{ line: 'Alex has a remote developer offer.', files: ['Offer.txt'] }];
    c.inboxFiles = { 'Offer.txt': 'Alex received a remote developer offer. Alex records applications and offers.\n',
      'Second.txt': 'Alex received another remote developer offer.\n' }; c.inboxBinary = {};
    for (const file of c.inbox.flatMap((p) => p.files)) c.inboxFiles[file] ??= c.inboxFiles['Offer.txt'] ?? '';
    Object.assign(c.inboxFiles, options.inboxFiles);
    c.bowerOwned = Object.entries(c.folder).filter(([, text]) => /^by: bower$/m.test(text)).map(([path]) => path);
  }
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const ix = VaultIndex.build(root, await drive.listAll(root));
  const id = (path: string): string => {
    const found = ix.idOf(path);
    expect(found, `seeded id for ${path}`).toBeDefined();
    return found ?? '';
  };
  const admitted = await planAdmission(fakeRead(drive), root, { scope: c.scope === 'undo' ? 'instructions' : c.scope,
    clock: () => AT, newId: () => 'selection-admission' });
  expect(admitted.kind, 'positive control has an actual Worker admission').toBe('manifest');
  const admission: AdmissionManifest = admitted.kind === 'manifest' ? admitted.manifest :
    { v: 1, id: 'selection-admission', rootId: root, scope: 'all', at: AT, piles: [], journal: [] };
  const sources = admission.piles.flatMap((p) => {
    const things = p.items.filter((i) => i.name !== PILE_NOTE);
    return things.length ? things.map((i) => ({ itemId: i.fileId, pileId: p.pileId, name: i.name })) :
      [{ itemId: p.pileId, pileId: p.pileId, name: '' }];
  });
  return { c, drive, root, ix, id, admission, sources, warm: false };
}

export function select(base: Base, wants: string[] = [], destination = 'Projects/Remote search'): Selection {
  return { items: base.sources.map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: base.id(destination), wants })), asks: [] };
}
export function fileIntent(base: Base, to = 'Projects/Remote search') {
  return { ...empty, things: base.sources.filter((s) => s.name).map((s) => ({ fileId: s.itemId, to, name: s.name,
    note: { name: s.name.replace(/\.[^.]+$/, '.md'), summary: 'Alex received a remote developer offer.',
      body: 'Alex received a remote developer offer.' },
    ...(to.startsWith('Projects/Remote search/') ? { basis: HUB } : {}),
  })) };
}
export function reply(value: unknown, n = 1): ClaudeExit {
  return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false,
    result: JSON.stringify(value), duration_ms: n * 10, duration_api_ms: n * 7, num_turns: n,
    usage: { input_tokens: n * 11, cache_creation_input_tokens: n * 2, cache_read_input_tokens: n * 3, output_tokens: n * 5 } }) };
}

/** Each entry is one semantic call or validation retry. A retry is never hidden by the test driver. */
export async function run(base: Base, replies: unknown[], options: {
  beforeReply?: (turn: number, frame: Frame) => Promise<void>;
  admission?: AdmissionManifest; press?: number;
  around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch;
} = {}) {
  const errorStart = vi.mocked(console.error).mock.calls.length;
  const frames: Frame[] = []; const events: Observation[] = []; const traffic: Traffic[] = [];
  const claude: ClaudeSpawn = async (call) => {
    const frame = { call, value: JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Record<string, unknown>, events: [...events] };
    frames.push(frame);
    await options.beforeReply?.(frames.length, frame);
    return reply(replies[Math.min(frames.length - 1, replies.length - 1)], frames.length);
  };
  const around = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => {
    const observed = observe(base.drive, base.root, events)(fetch);
    const metered: typeof globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const response = await observed(input, init);
      if (url.origin === 'https://www.googleapis.com') traffic.push({ url, method: (init.method ?? 'GET').toUpperCase(),
        range: new Headers(init.headers).get('Range'), sent: init.body == null ? 0 : (await new Response(init.body).arrayBuffer()).byteLength,
        got: (await response.clone().arrayBuffer()).byteLength });
      return response;
    };
    return options.around ? options.around(metered) : metered;
  };
  const press = options.press ?? 1;
  const result = await runOnDrive(base.c, base.drive, base.root, { claude, around, admission: options.admission ?? base.admission,
    pacing: { baseMs: 0, sleep: async () => {} },
    ...(press > 1 ? { answerStart: { scope: 'all' as const, requestId: `b1d-press-${press}` } } : {}) }, press);
  const errors = vi.mocked(console.error).mock.calls.slice(errorStart).flat().map(String).join('\n');
  await appendFile(join(tmpdir(), 'b1d-selection-observations.ndjson'), JSON.stringify({
    test: expect.getState().currentTestName, warm: base.warm, code: result.code,
    calls: frames.length, driveCalls: traffic.length, bytes: traffic.reduce((n, t) => n + t.sent + t.got, 0),
    prefixes: traffic.filter((t) => t.range).length,
    media: traffic.filter((t) => t.url.searchParams.get('alt') === 'media' && !t.range).length,
    operations: manifest(result).operations.length, filed: report(result).filed.length, errors,
  }) + '\n');
  return { ...result, frames, events, traffic, claude, errors };
}

export function manifest(result: CaseRun): { operations: Array<{ operationId: string; effect: { kind: string } }> } {
  return JSON.parse(Object.entries(result.after).find(([p]) => /\/manifest-[^/]+\.json$/.test(p))?.[1] ?? '{"operations":[]}') as
    { operations: Array<{ operationId: string; effect: { kind: string } }> };
}
export function report(result: CaseRun): { filed: unknown[]; setAside: unknown[]; questions: unknown[] } {
  return (result.lastRun as { run?: { report?: { filed: unknown[]; setAside: unknown[]; questions: unknown[] } } } | null)?.run?.report
    ?? { filed: [], setAside: [], questions: [] };
}
export function completed(result: Awaited<ReturnType<typeof run>>, files = 1) {
  expect.soft(result.code, 'valid control completes through main').toBe(0);
  expect.soft(result.wire?.statuses.at(-1)?.phase, 'valid control reaches the done barrier').toBe('done');
  expect.soft(report(result).filed, 'valid control really files the source').toHaveLength(files);
  expect.soft(result.frames, 'selection then execution, with no validation retry').toHaveLength(2);
  expect.soft(result.frames[1]?.call.input, 'step two receives the frozen source id').toContain(result.dispatch?.admission.piles[0]?.items.find((i) => i.name !== PILE_NOTE)?.fileId ?? '');
}
export function waits(result: Awaited<ReturnType<typeof run>>) {
  expect.soft(result.code, 'selection exhaustion is a done run with waiting items').toBe(0);
  expect.soft(result.wire?.statuses.at(-1)?.phase, 'exhaustion ends done, retaining waiting work').toBe('done');
  expect.soft(report(result).filed).toEqual([]);
  expect.soft(report(result).setAside.length, 'reuse the existing set-aside row').toBeGreaterThan(0);
  const text = Object.entries(result.after).find(([p]) => p.endsWith('/dispositions.json'))?.[1];
  const dispositions = JSON.parse(text ?? '{"items":[]}') as { items: Array<{ disposition: string }> };
  expect.soft(dispositions.items.length).toBeGreaterThan(0);
  expect.soft(dispositions.items.every((i) => i.disposition === 'waiting')).toBe(true);
  expect.soft(result.events.filter((e) => ['PATCH', 'POST', 'DELETE'].includes(e.method) && !e.path.startsWith('.bower/')),
    'exhaustion never mutates source or personal evidence').toEqual([]);
}

/** Find the script's candidate rows without pinning a particular serialized prefix or per-item container. */
export function candidates(frame: Frame | undefined, itemId: string): string[] {
  const lists: string[][] = [];
  const visit = (value: unknown, key = '', owner?: string): void => {
    if (Array.isArray(value)) {
      if (/candidate|neighbou?r/i.test(key) && (owner === undefined || owner === itemId)) {
        const ids = value.flatMap((row): string[] => {
          if (typeof row === 'string') return [row];
          if (!row || typeof row !== 'object') return [];
          const r = row as Record<string, unknown>;
          const id = r.id ?? r.fileId ?? r.noteId ?? r.folderId;
          return typeof id === 'string' ? [id] : [];
        });
        if (ids.length) lists.push(ids);
      }
      value.forEach((v) => visit(v, key, owner));
    } else if (value && typeof value === 'object') {
      const row = value as Record<string, unknown>;
      const own = typeof row.itemId === 'string' ? row.itemId : owner;
      Object.entries(row).forEach(([k, v]) => visit(v, /candidate|neighbou?r/i.test(key) ? key : k, k === itemId ? itemId : own));
    }
  };
  visit(frame?.value);
  return lists.sort((a, b) => b.length - a.length)[0] ?? [];
}
export function media(result: Awaited<ReturnType<typeof run>>, id: string, full = true) {
  return result.traffic.filter((t) => t.method === 'GET' && t.url.pathname === `/drive/v3/files/${id}`
    && t.url.searchParams.get('alt') === 'media' && (!full || !t.range));
}

/** Durable warm cache made from made-up seed bytes; no production traffic is charged to seeding. */
export async function seedState(base: Base) {
  const wire = driveV3(base.drive); wire.folderId = base.root;
  const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
  const projection = await planningIndex(new RunnerDrive({ token, attempt: 1, fetch: wire.fetch,
    pacing: { baseMs: 0, sleep: async () => {} } }), base.root);
  expect(projection, 'warm fixture uses the real B1c projection').toBeTypeOf('string');
  const files: RetrievalFile['files'] = {};
  for (const f of await base.drive.listAll(base.root)) {
    const path = base.drive.pathOf(f.id, base.root) ?? '';
    if (f.folder || !path.endsWith('.md') || isHidden(path) || path.startsWith('Inbox/')) continue;
    files[f.id] = { path, version: f.modifiedTime, summary: parseNote(path, await base.drive.readText(f.id)).summary || '(no summary)',
      coverage: { kind: 'prefix', bytes: 4096 } };
  }
  const state: RetrievalFile = { v: 1, folderId: base.root, account: 'ACCOUNT_ID',
    cursor: String(Number(await base.drive.getStartPageToken()) + 1), files };
  const sys = base.id(SYSTEM.dir);
  await base.drive.createText(sys, 'retrieval.json', JSON.stringify(state));
  await base.drive.createText(sys, 'index.md', projection ?? '');
  await base.drive.createText(sys, 'hot.md', '# Hot\n\n## Recent changes\n- Existing change. <!-- bower:op made-up-op -->\n');
  base.warm = true;
  return state;
}
