/** B1d observations over the existing corpus/main driver. Nothing here substitutes for planning or validation. */
import { resolve } from 'node:path';
import { appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, vi } from 'vitest';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { PILE_NOTE } from '../../src/data/piles';
import { checkCreationName } from '../../src/data/contracts/tree';
import { indexedFront, parseNote } from '../../src/data/contracts/note-format';
import { mocEdit, mocMembership, mocSnapshot } from '../../src/data/contracts/note-edit';
import type { MaintenanceNote } from '../../src/data/contracts/run-manifest';
import { SYSTEM, isHidden, type RetrievalFile } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';
import type { ClaudeCall, ClaudeExit, ClaudeSpawn } from '../src/claude';
import { loadCase } from '../src/corpus';
import { AT, frameOf, lastJson, promptOf, runOnDrive, seedCase, type CaseRun } from './corpus-run';
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

/**
 * C12's made-up large folder (c12-measure): `notes` notes spread over `folders` topic folders under the four main
 * folders, the first note of each folder its hub, and `things` loose text files in the inbox. Names are made up.
 */
export function largeFolder(notes: number, folders: number, things: number) {
  const topics = Array.from({ length: folders }, (_, f) => `${['Projects', 'Areas', 'Resources', 'Archives'][f % 4]}/Topic ${String(f + 1).padStart(2, '0')}`);
  const name = (at: string): string => at.slice(at.indexOf('/') + 1);
  const folder = Object.fromEntries(Array.from({ length: notes }, (_, i) => {
    const at = topics[i % folders] ?? '';
    const path = i < folders ? `${at}/${name(at)}.md` : `${at}/Note ${String(i + 1).padStart(3, '0')}.md`;
    return [path, note(`Alex keeps ${name(at)} record ${i + 1} on shared plots and local workshops.`, `${'Made-up evidence line. '.repeat(12)}\n`)];
  }));
  const files = Array.from({ length: things }, (_, t) => `Thing ${String(t + 1).padStart(3, '0')}.txt`);
  const inboxFiles = Object.fromEntries(files.map((file, t) => [file,
    `Alex received ${name(topics[t % folders] ?? '')} item ${t + 1}. ${'A made-up detail for the benchmark. '.repeat(40)}\n`]));
  return { folder, inbox: files.map((file) => ({ line: '', files: [file] })), inboxFiles, to: topics[0] ?? '' };
}
export interface Item { itemId: string; kind: string; destination: string | { parentId: string; name: string }; wants: string[] }
export interface Selection { items: Item[]; asks: unknown[] }
/** A planning call: the JSON it reads (run context and call text as one record) and all it reads (`promptOf`). */
export interface Frame { call: ClaudeCall; value: Record<string, unknown>; prompt: string; events: Observation[] }
export interface Traffic { method: string; url: URL; range: string | null; sent: number; got: number }
export type Base = Awaited<ReturnType<typeof setup>>;

/** Fixture data travels outside the model input and is never charged as production traffic. */
export interface PlanningFixture { drive: FakeDrive; root: string; admission?: AdmissionManifest | null }

const phasedTransports = new WeakSet<ClaudeSpawn>();

/** Alternate semantic phases; validation retries repeat their step's kind. */
export function phaseAwareClaude(
  execution: (call: ClaudeCall, step: number, attempt: number, phase: 'selection' | 'execution') => ClaudeExit | Promise<ClaudeExit>,
  fixture: (call: ClaudeCall) => PlanningFixture = (call) => {
    const value = (call as ClaudeCall & { fixture?: PlanningFixture }).fixture;
    if (!value) throw new Error('A model fixture needs its seeded Drive.');
    return value;
  },
  explicit = false,
): ClaudeSpawn {
  if (phasedTransports.has(execution as ClaudeSpawn)) return execution as ClaudeSpawn;
  let step = -1; let attempt = 0; let cwd: string | undefined;
  let selected: ClaudeExit | undefined;
  const spawn: ClaudeSpawn = async (call) => {
    const { drive, root, admission } = fixture(call);
    const context = lastJson(call.input) as {
      piles: Array<{ pileId: string; things: Array<{ fileId: string }> }>;
      sources?: Array<{ itemId: string }>; selection?: unknown;
    };
    const phase = context.selection === undefined ? 'selection' : 'execution';
    const retry = /^Your reply was refused:/m.test(call.input);
    if (cwd !== call.cwd) { cwd = call.cwd; step++; selected = undefined; attempt = 0; }
    else if (retry) attempt++;
    else attempt = 0;
    if (explicit) return execution(call, step, attempt, phase);
    if (phase === 'selection' && retry && selected) {
      await execution(call, step, attempt, phase);
      return selected;
    }
    const exit = await execution(call, step, attempt, phase);
    if (phase === 'execution') return exit;
    const files = await drive.listAll(root);
    const paths = new Map(files.map((f) => [drive.pathOf(f.id, root), f]));
    const titles = new Map<string, string[]>();
    for (const [path, file] of paths) {
      if (file.folder || !path.endsWith('.md')) continue;
      const title = file.name.slice(0, -3);
      titles.set(title, [...titles.get(title) ?? [], path]);
    }
    let envelope: Record<string, unknown> = {}; let intent: Record<string, unknown> = {};
    try {
      envelope = JSON.parse(exit.stdout) as Record<string, unknown>;
      intent = JSON.parse(String(envelope.result)) as Record<string, unknown>;
    } catch { /* Malformed execution stays malformed after an empty, valid selection. */ }
    if (Array.isArray(intent.items) && !('kind' in intent)) { selected = exit; return exit; }
    const rows = (key: string): Record<string, unknown>[] => Array.isArray(intent[key])
      ? (intent[key] as unknown[]).filter((v): v is Record<string, unknown> => !!v && typeof v === 'object') : [];
    const placed = [...rows('things'), ...rows('notes'), ...rows('asks')];
    // A request's result (C09 answers, C08 documents and revisions) uses the request's journal item.
    const results = [...rows('answers'), ...rows('documents'), ...rows('revisions')];
    const used = new Set([...placed.flatMap((r) => [r.fileId, r.pileId]), ...results.map((r) => r.requestId),
      ...[...rows('lines'), ...rows('states')].map((r) => r.cites)].filter((id): id is string => typeof id === 'string'));
    if (Array.isArray(intent.bin)) intent.bin.forEach((id) => used.add(id));
    const available = context.sources?.map((s) => s.itemId) ?? context.piles.flatMap((pile) =>
      pile.things.length ? pile.things.map((t) => t.fileId) : [pile.pileId]);
    const pileIds = new Set(context.piles.flatMap((p) => [p.pileId, ...p.things.map((t) => t.fileId)]));
    const journal = new Set(admission?.journal.map((j) => j.fileId) ?? available.filter((id) => !pileIds.has(id)));
    const unboundPaths = [...rows('lines'), ...rows('states')].filter((r) => typeof r.cites !== 'string' || !available.includes(r.cites)).map((r) => r.note);
    const pairPaths = [...rows('asks').flatMap((r) => Array.isArray(r.notes) ? r.notes : []),
      ...rows('keep').flatMap((r) => [r.kept, r.other])];
    // A journal or words source supplies uncited news/pair context; it grants no invented source id.
    if (pairPaths.length && available[0] && !available.some((id) => used.has(id))) used.add(available[0]);
    const uncitedSource = available.find((id) => used.has(id)) ?? available[0];
    if (unboundPaths.length && uncitedSource) used.add(uncitedSource);
    if (unboundPaths.length || pairPaths.length) {
      for (const id of available) if (journal.has(id) || context.piles.some((p) => p.pileId === id && !p.things.length)) used.add(id);
    }
    const items = available.filter((id) => used.has(id)).map((itemId): Item => {
      const row = placed.find((r) => r.fileId === itemId || r.pileId === itemId);
      const targetPaths = [...rows('lines'), ...rows('states')]
        .filter((r) => r.cites === itemId || (typeof r.cites !== 'string' || !available.includes(r.cites))
          && (journal.has(itemId) || itemId === uncitedSource))
        .map((r) => r.note);
      const path = typeof row?.to === 'string' ? row.to
        : typeof targetPaths[0] === 'string' ? targetPaths[0].slice(0, targetPaths[0].lastIndexOf('/')) : 'Resources';
      const existing = paths.get(path);
      const parent = paths.get(path.slice(0, path.lastIndexOf('/')));
      const name = path.split('/').at(-1) ?? '';
      let validName = !!name && name.trim() === name && !/\p{C}/u.test(name);
      try { checkCreationName(name, 'folder'); } catch { validName = false; }
      const newArea = path.split('/').length === 2 && path.startsWith('Areas/');
      const destination = existing?.folder && !/^(Inbox|\.bower)(\/|$)/.test(path) ? existing.id
        : validName && (!newArea || typeof row?.responsibility === 'string' || typeof row?.basis === 'string') && parent?.folder && !/^(Inbox|\.bower)(\/|$)/.test(path)
          ? { parentId: parent.id, name } : paths.get('Resources')?.id ?? '';
      const note = row?.note && typeof row.note === 'object' ? row.note as Record<string, unknown> : {};
      const links = parseNote('', typeof note.body === 'string' ? note.body : '').links.flatMap((link) => {
        const exact = paths.has(link) ? link : paths.has(link + '.md') ? link + '.md' : undefined;
        const matches = exact ? [exact] : titles.get(link) ?? [];
        return matches.length === 1 ? matches : [];
      });
      // A result wants the document it revises and what it links: a note by its path or title, an original by its path or a name no other file has.
      const own = results.filter((r) => r.requestId === itemId);
      const cited = [...own.flatMap((r) => typeof r.path === 'string' ? [r.path] : []), ...own.flatMap((r) => parseNote('', [r.text, r.body]
        .filter((t): t is string => typeof t === 'string').join('\n')).links)]
        .flatMap((link) => {
          const matches = paths.has(link) ? [link] : paths.has(`${link}.md`) ? [`${link}.md`]
            : [...titles.get(link) ?? [], ...[...paths].filter(([path, file]) => !file.folder && !path.endsWith('.md') && file.name === link).map(([path]) => path)];
          return matches.length === 1 ? matches : [];
        });
      const wants = [...new Set([...targetPaths, row?.basis, ...pairPaths, ...links, ...cited,
        ...(journal.has(itemId) ? unboundPaths : [])]
        .flatMap((path) => typeof path === 'string' && paths.get(path) && !paths.get(path)?.folder ? [paths.get(path)?.id ?? ''] : []))];
      return { itemId, kind: 'unknown', destination, wants };
    });
    selected = { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ ...envelope, type: 'result', subtype: 'success',
      is_error: false, result: JSON.stringify({ items, asks: rows('asks').filter((r) => r.notes === undefined) }) }) };
    return selected;
  };
  phasedTransports.add(spawn);
  return spawn;
}

export async function setup(options: {
  fixture?: string; folder?: Record<string, string>; inbox?: Array<{ line: string; files: string[] }>;
  inboxFiles?: Record<string, string>;
} = {}) {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus', options.fixture ?? 'b1-index-job-offer'));
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
  const logStart = vi.mocked(console.log).mock.calls.length;
  const before = Object.fromEntries(await Promise.all((await base.drive.listAll(base.root))
    .map(async (file) => [file.id, await base.drive.evidence(file.id)] as const)));
  const errorStart = vi.mocked(console.error).mock.calls.length;
  const frames: Frame[] = []; const events: Observation[] = []; const traffic: Traffic[] = [];
  const claude = phaseAwareClaude(async (call) => {
    const frame = { call, value: frameOf(call), prompt: promptOf(call), events: [...events] };
    frames.push(frame);
    await options.beforeReply?.(frames.length, frame);
    return reply(replies[Math.min(frames.length - 1, replies.length - 1)], frames.length);
  }, () => ({ drive: base.drive, root: base.root, admission: options.admission ?? base.admission }), true);
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
  return { ...result, frames, events, traffic, claude, errors, before,
    consoleLines: vi.mocked(console.log).mock.calls.slice(logStart).map((args) => args.map(String).join(' ')) };
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
/** Refused replies fail; their sources remain available without a ledger-exhaustion announcement. */
export function failedReply(result: Awaited<ReturnType<typeof run>>) {
  expect.soft(result.code, 'no valid reply after the retry fails the run').toBe(1);
  expect.soft(result.wire?.statuses.at(-1)?.phase, 'invalid reply exhaustion ends failed').toBe('failed');
  untouchedInbox(result);
}

function untouchedInbox(result: Awaited<ReturnType<typeof run>>) {
  expect.soft(report(result), 'exhausted items have no report row').toEqual({ filed: [], setAside: [], questions: [] });
  const sources = result.dispatch?.admission.piles.flatMap((p) => p.items) ?? [];
  for (const source of sources) {
    const path = Object.entries(result.pathsById).find(([id]) => id === source.fileId)?.[1] ?? '';
    expect.soft(path, 'waiting comes from the source still in the inbox').toMatch(/^Inbox\//);
    expect.soft(Object.hasOwn(result.after, path), 'the next run can still read the waiting source').toBe(true);
  }
  expect.soft(result.events.filter((e) => ['PATCH', 'POST', 'DELETE'].includes(e.method) && !e.path.startsWith('.bower/')),
    'exhaustion never mutates source or personal evidence').toEqual([]);
  expect.soft(result.events.filter((e) => ['PATCH', 'POST', 'DELETE'].includes(e.method)
    && /(?:manifest-[^/]+\.json|\/changes\/)/.test(e.path)), 'no manifest change or request consumption').toEqual([]);
}

export function leavesForNextRun(result: Awaited<ReturnType<typeof run>>) {
  expect.soft(result.code, 'ledger exhaustion is a done run').toBe(0);
  expect.soft(result.wire?.statuses.at(-1)?.phase, 'exhaustion ends done').toBe('done');
  untouchedInbox(result);
  const lines = result.consoleLines.filter((line) => /exhaust|next run|left.*inbox|wait/i.test(line) && !line.startsWith('timing:'));
  expect.soft(lines, 'one console line counts the items left for the next run').toHaveLength(1);
  const count = result.dispatch?.admission.piles.reduce((n, p) => n + Math.max(1, p.items.filter((i) => i.name !== PILE_NOTE).length), 0) ?? 0;
  expect.soft(lines[0] ?? '').toMatch(new RegExp(`\\b${count}\\b`));
}

/** Find the script's candidate rows without pinning a particular serialized prefix or per-item container. */
export function candidates(frame: Pick<Frame, 'value'> | undefined, itemId: string): string[] {
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
export async function seedState(base: Base, settleMocs = false) {
  const wire = driveV3(base.drive); wire.folderId = base.root;
  const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
  const projection = await planningIndex(new RunnerDrive({ token, attempt: 1, fetch: wire.fetch,
    pacing: { baseMs: 0, sleep: async () => {} } }), base.root);
  expect(projection, 'warm fixture uses the real B1c projection').toBeTypeOf('string');
  const files: Record<string, MaintenanceNote> = {};
  for (const f of await base.drive.listAll(base.root)) {
    const path = base.drive.pathOf(f.id, base.root) ?? '';
    if (f.folder || !path.endsWith('.md') || isHidden(path) || path.startsWith('Inbox/')) continue;
    const text = await base.drive.readText(f.id);
    const front = indexedFront(text);
    const moc = front.type === 'moc' ? mocSnapshot(text) : null;
    files[f.id] = { path, version: f.modifiedTime, ...front,
      coverage: { kind: 'prefix', bytes: 4096 }, ...(moc ? { moc } : {}) };
  }
  if (settleMocs) {
    const members = mocMembership(files);
    for (const [id, entry] of Object.entries(files)) {
      if (!entry.moc) continue;
      const edit = mocEdit(id, files, members);
      if (!edit) continue;
      const newer = await base.drive.writeText(id, edit.text, entry.version);
      const moc = mocSnapshot(edit.text);
      files[id] = { ...entry, version: newer.modifiedTime, ...(moc ? { moc } : {}) };
    }
  }
  for (const [id, members] of mocMembership(files)) {
    const entry = files[id];
    if (entry?.moc) entry.members = members;
  }
  const state: RetrievalFile & { files: Record<string, MaintenanceNote> } = { v: 1, folderId: base.root, account: 'ACCOUNT_ID',
    cursor: String(Number(await base.drive.getStartPageToken()) + 1), files };
  const sys = base.id(SYSTEM.dir);
  await base.drive.createText(sys, 'retrieval.json', JSON.stringify(state));
  await base.drive.createText(sys, 'index.md', projection ?? '');
  await base.drive.createText(sys, 'hot.md', '# Hot\n\n## Recent changes\n- 2026-10-06 · Existing change. · op:012345abcdef\n');
  base.warm = true;
  return state;
}
