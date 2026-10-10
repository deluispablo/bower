import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { parseOwnership, type MocRegion } from '../../src/data/contracts/ownership-format';
import { parseNote } from '../../src/data/contracts/note-format';
import { parseRunManifestV2, type ManifestV2 } from '../../src/data/contracts/run-manifest';
import { canonical } from '../../src/data/spine/records';
import { sha256Hex } from '../../src/data/contracts/hashes';
import { RUNNER_WRITES, SYSTEM, isHidden, type RetrievalFile } from '../../src/data/vault/layout';
import { loadCase, type LoadedCase } from '../src/corpus';
import { AT, redispatchCase, replySequence, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive, paging } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../harness/corpus');
const METHOD = resolve(import.meta.dirname, '../../docs/harness/2026-10-08-p4-method-rubric-changes.md');
const empty = { kind: 'tidy-intent', v: 1, things: [] };
const pacing = { sleep: async (): Promise<void> => undefined };
const oldPaging = paging.size;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000; });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPaging; });

const note = (summary: string) => `---\nsummary: ${summary}\n---\nAlex's original evidence.\n`;
/** Use the established ownership parser; no test-only list writer stands in for maintenance. */
function moc(summary: string, own = true): string {
  const payloads: Record<string, string> = {
    current: '', personal: "Alex's personal map note.\n", timeline: '', 'bower-note': '',
    'moc-overview': '## Overview\n\nAlex recorded these observations.\n',
    'moc-figures': '## Figures\n\nStale figures.\n',
    'moc-members': '## Notes\n\n- [[Removed]]\n- [[Removed]]\n',
  };
  return `---\nsummary: ${summary}\ntype: moc\nbower_format: ownership/2\n${own ? 'by: bower\n' : ''}---\n\n`
    + Object.entries(payloads).map(([owner, text]) => `<!-- bower:ownership/2 begin ${owner} -->\n${text}<!-- bower:ownership/2 end ${owner} -->\n`).join('\n');
}

function region(text: string | undefined, name: MocRegion): string {
  expect(text, 'the existing MOC survives').toBeDefined();
  const bytes = new TextEncoder().encode(text ?? '');
  const parsed = parseOwnership(bytes);
  expect(parsed.status, 'script rebuilt a valid marked MOC').toBe('v2');
  if (parsed.status !== 'v2') return '';
  const span = parsed.payloads[name];
  expect(span, `${name} exists`).toBeDefined();
  return new TextDecoder().decode(bytes.subarray(span?.start, span?.end));
}

interface Sent { path: string; text: string }
interface Lost { path: string; reached: boolean; enabled: boolean }
/** Only production Drive mutations are counted; seed and snapshot calls use FakeDrive directly. */
function observe(drive: FakeDrive, root: string, sent: Sent[], lost?: Lost) {
  return (fetch: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? 'GET').toUpperCase();
    const id = /^\/(?:upload\/)?drive\/v3\/files\/([^/]+)$/.exec(url.pathname)?.[1];
    const body = init.body === undefined || init.body === null ? '' : await new Response(init.body).text();
    const boundary = /^--([^\r\n]+)\r\n/.exec(body)?.[1];
    const parts = boundary ? body.split(`--${boundary}`).slice(1, -1).map((part) => part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '')) : [];
    const meta = parts[0] ?? (!url.pathname.startsWith('/upload/') && body ? body : undefined);
    const json = meta ? JSON.parse(meta) as { name?: string; parents?: string[] } : undefined;
    const path = id ? drive.pathOf(decodeURIComponent(id), root) : json?.name && json.parents?.[0]
      ? [drive.pathOf(json.parents[0], root), json.name].filter(Boolean).join('/') : undefined;
    if (lost?.enabled && lost.reached && path === lost.path) throw new TypeError('Made-up connection remains unavailable');
    if (url.origin === 'https://www.googleapis.com' && ['POST', 'PATCH', 'DELETE'].includes(method) && path) {
      sent.push({ path, text: url.searchParams.get('uploadType') === 'media' ? body : parts[1] ?? body });
      if (lost?.enabled && path === lost.path) {
        const response = await fetch(input, init);
        expect(response.ok, 'fault happens after a real successful write').toBe(true);
        lost.reached = true;
        throw new TypeError('Lost made-up maintenance reply');
      }
    }
    return fetch(input, init);
  };
}

async function setup(folder: Record<string, string>, id = 'b1-index-no-change') {
  const c = await loadCase(resolve(ROOT, id));
  c.folder = folder; c.folderBinary = {}; c.inbox = []; c.journal = []; c.questions = []; c.scope = 'all';
  c.bowerOwned = Object.entries(folder).filter(([, text]) => /^by: bower$/m.test(text)).map(([path]) => path);
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const admission: AdmissionManifest = { v: 1, id: 'index-feed', rootId: root, scope: 'all', at: AT, piles: [], journal: [] };
  return { c, drive, root, admission };
}
async function run(base: Awaited<ReturnType<typeof setup>>, sent: Sent[] = [], lost?: Lost, press = 1) {
  return runOnDrive(base.c, base.drive, base.root, { admission: { ...base.admission, id: `index-feed-${press}`, at: AT + press }, pacing,
    claude: replySequence([empty]), around: observe(base.drive, base.root, sent, lost),
    ...(press > 1 ? { answerStart: { scope: 'all' as const, requestId: `index-refresh-${press}` } } : {}),
  }, press);
}
function stateOf(result: CaseRun): RetrievalFile {
  expect(result.after[SYSTEM.retrieval], 'main persists the retrieval projection source').toBeDefined();
  return JSON.parse(result.after[SYSTEM.retrieval] ?? 'null') as RetrievalFile;
}
function idAt(result: CaseRun, path: string): string {
  const id = Object.entries(result.pathsById).find(([, p]) => p === path)?.[0];
  expect(id, `fixture file ${path} has a stable Drive id`).toBeDefined();
  return id ?? '';
}
function membersById(result: CaseRun, path: string): string[] {
  const state = stateOf(result);
  const links = [...region(result.after[path], 'moc-members').matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1] ?? '');
  return links.map((link) => {
    const matches = Object.entries(state.files).filter(([, f]) => f.path.replace(/\.md$/, '') === link
      || f.path.replace(/\.md$/, '').endsWith(`/${link}`));
    expect(matches, `member link ${link} resolves to exactly one stored id`).toHaveLength(1);
    return matches[0]?.[0] ?? '';
  });
}
const manifests = (result: CaseRun) => Object.entries(result.after).filter(([p]) => /\/manifest-[^/]+\.json$/.test(p));
function folded(result: CaseRun, title: string, count: number) {
  expect(result.after[SYSTEM.index], 'existing Bower MOC folds with a recursive member count').toContain(`→ [[${title}]] (${count})`);
}
/** Exact content bytes below the optional generation heading/date; do not normalize rows or spacing. */
function indexRows(text: string | undefined): string {
  expect(text).toBeDefined();
  const at = text?.indexOf('## ') ?? -1;
  return at < 0 ? text ?? '' : text?.slice(at) ?? '';
}
async function seedState(base: Awaited<ReturnType<typeof setup>>, index: string) {
  const listing = await base.drive.listAll(base.root);
  const sys = listing.find((f) => f.folder && f.name === '.bower' && f.parents[0] === base.root);
  expect(sys).toBeDefined();
  await base.drive.createText(sys?.id ?? '', 'index.md', index);
  await base.drive.createText(sys?.id ?? '', 'hot.md', 'Existing hot.\n');
  const files: RetrievalFile['files'] = {};
  for (const f of listing.filter((f) => !f.folder)) {
    const path = base.drive.pathOf(f.id, base.root) ?? '';
    if (!path.endsWith('.md') || isHidden(path) || path.startsWith('Inbox/')) continue;
    files[f.id] = { path, version: f.modifiedTime, summary: parseNote(path, await base.drive.readText(f.id)).summary || '(no summary)', coverage: { kind: 'prefix', bytes: 4096 } };
  }
  const state: RetrievalFile = { v: 1, folderId: base.root, account: 'ACCOUNT_ID',
    cursor: String(Number(await base.drive.getStartPageToken()) + 1), files };
  const target = await base.drive.createText(sys?.id ?? '', 'retrieval.json', JSON.stringify(state));
  expect(await base.drive.listChanges(state.cursor), 'positive control has a drained feed').toEqual({ changes: [], newStartPageToken: state.cursor });
  return { state, target };
}

it('B1c index: exact PARA order direct notes shortest duplicate paths and recursive folded count', async () => {
  // Deliberately reverse insertion order; Projects beats Archive, and direct Zeta beats subfolder Alpha.
  const base = await setup({
    'Archive/Old.md': note('Old evidence.'), 'Resources/Garden/Deep/Leaf.md': note('Leaf evidence.'),
    'Resources/Garden/Garden.md': moc('Garden evidence.'), 'Resources/Garden/Seed.md': note('Seed evidence.'),
    'Areas/Home.md': note('Home evidence.'), 'Projects/Beta/Note.md': note('Beta evidence.'),
    'Projects/Alpha/Note.md': note('Alpha evidence.'), 'Projects/Zeta.md': note('Direct evidence.'),
  });
  const result = await run(base);
  expect(result.code).toBe(0);
  expect(Object.keys(stateOf(result).files)).toHaveLength(8); // Control: no note was lost by folding.
  expect(result.after[SYSTEM.index]).toContain('Direct evidence.');
  expect(indexRows(result.after[SYSTEM.index])).toBe([
    '## Projects', '', '- [[Zeta]] — Direct evidence.', '', '### Alpha', '',
    '- [[Alpha/Note]] — Alpha evidence.', '', '### Beta', '', '- [[Beta/Note]] — Beta evidence.', '',
    '## Areas', '', '- [[Home]] — Home evidence.', '', '## Resources', '', '### Garden', '',
    '→ [[Garden]] (2)', '', '## Archive', '', '- [[Old]] — Old evidence.', '',
  ].join('\n'));
  for (const [id, f] of Object.entries(stateOf(result).files)) {
    expect(result.after[SYSTEM.index]).not.toContain(id);
    expect(result.after[SYSTEM.index]).not.toContain(f.version);
  }
});

it('B1c index: 32000 character cut names every omitted folder and preserves whole rows', async () => {
  const control = await run(await setup({ 'Resources/Visible.md': note('Visible control.') }));
  expect(control.code).toBe(0);
  expect(control.after[SYSTEM.index]).toContain('[[Visible]]');
  expect(control.after[SYSTEM.index]?.length).toBeLessThanOrEqual(32000);
  expect(control.after[SYSTEM.index]).not.toContain('index cut:');
  expect(control.wire?.requests.length).toBeLessThanOrEqual(300);
  const folder = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [
    `Resources/Group ${String(i).padStart(3, '0')}/Note ${String(i).padStart(3, '0')}.md`, note(`Evidence ${i} ${'x'.repeat(199 - `Evidence ${i} `.length)}.`),
  ]));
  const base = await setup(folder);
  // A durable snapshot prevents budget observations from charging seed/snapshot or same-version note downloads.
  await seedState(base, '# Index\nOld projection.\n');
  const changed = (await base.drive.listAll(base.root)).find((f) => f.name === 'Note 000.md');
  expect(changed).toBeDefined();
  base.drive.touch(changed?.id ?? '');
  const result = await run(base);
  expect(result.code).toBe(0);
  expect(Object.keys(stateOf(result).files)).toHaveLength(150);
  const text = result.after[SYSTEM.index] ?? '';
  expect(text).toContain('[[Note 000]]');
  expect(result.wire?.requests.length, 'production-only calls stay inside Q7').toBeLessThanOrEqual(300);
  const unchangedIds = Object.entries(result.pathsById).filter(([, p]) => /^Resources\/Group \d{3}\/Note \d{3}\.md$/.test(p)
    && !p.endsWith('/Note 000.md')).map(([id]) => id);
  expect(result.wire?.requests.filter((r) => r.method === 'GET' && r.url.searchParams.get('alt') === 'media'
    && unchangedIds.some((id) => r.url.pathname === `/drive/v3/files/${id}`)), 'same-version files add no media re-reads').toEqual([]);
  expect.soft(text.length, 'context projection stays inside Q7').toBeLessThanOrEqual(32000);
  const omitted = /index cut: (\d+) folders omitted/.exec(text);
  expect(omitted, 'the cut is declared rather than silently dropping folders').not.toBeNull();
  const shown = [...text.matchAll(/^### Group \d{3}$/gm)].length;
  expect(shown + Number(omitted?.[1])).toBe(150);
  expect(Number(omitted?.[1])).toBeGreaterThan(0);
  expect(indexRows(text), 'exact retained-folder bytes and honest cut marker').toBe([
    '## Resources', '',
    ...Array.from({ length: shown }, (_, i) => [
      `### Group ${String(i).padStart(3, '0')}`, '',
      `- [[Note ${String(i).padStart(3, '0')}]] — Evidence ${i} ${'x'.repeat(199 - `Evidence ${i} `.length)}.`, '',
    ]).flat(),
    `index cut: ${150 - shown} folders omitted`, '',
  ].join('\n'));
  const rows = text.split('\n').filter((line) => line.startsWith('- [['));
  expect(rows).toHaveLength(shown);
  expect(rows.every((line) => /^- \[\[Note \d{3}\]\] — Evidence \d+ x+\.$/.test(line))).toBe(true);
  expect(result.wire?.requests.length, 'whole production run stays inside the maintenance call ceiling').toBeLessThanOrEqual(300);
});

it('B1c index: hidden app settings and dot-folder notes never enter either projection', async () => {
  const base = await setup({ 'Resources/Visible.md': note('Visible control.'),
    '.obsidian/app.json': '{"madeUp":true}', '.x/Note.md': note('Hidden sentinel.'),
    'Resources/.x/Note.md': note('Nested hidden sentinel.') });
  const result = await run(base);
  expect(result.code).toBe(0);
  expect(result.after[SYSTEM.index]).toContain('[[Visible]]');
  expect(Object.values(stateOf(result).files).map((f) => f.path)).toEqual(['Resources/Visible.md']);
  for (const path of ['.obsidian/app.json', '.x/Note.md', 'Resources/.x/Note.md']) {
    expect(result.after[path]).toBe(base.c.folder[path]);
    expect(result.after[SYSTEM.index]).not.toContain(path);
    expect(result.after[SYSTEM.retrieval]).not.toContain(path);
  }
  expect(result.after[SYSTEM.index]).not.toContain('Hidden sentinel');
});

it('B1c index: hidden-only feed changes only the cursor with a visible-feed positive control', async () => {
  const folder = { 'Resources/Visible.md': note('Visible control.') };
  const hidden = await setup(folder);
  const old = '# Index\n## Resources\n\n- [[Visible]] — Visible control.\n';
  const { state } = await seedState(hidden, old);
  const dot = await hidden.drive.createFolder(hidden.root, '.x');
  await hidden.drive.createText(dot.id, 'Note.md', note('Hidden sentinel.'));
  const obsidian = await hidden.drive.createFolder(hidden.root, '.obsidian');
  await hidden.drive.createText(obsidian.id, 'app.json', '{"madeUp":true}');
  const sent: Sent[] = [];
  const result = await run(hidden, sent);
  expect(result.code).toBe(0);
  expect(result.wire?.requests.some((r) => r.url.pathname === '/drive/v3/changes')).toBe(true);
  const after = stateOf(result);
  expect(after.cursor).not.toBe(state.cursor);
  expect({ ...after, cursor: state.cursor }).toEqual(state);
  expect(result.after[SYSTEM.index]).toBe(old);
  expect(result.after[SYSTEM.hot]).toBe('Existing hot.\n');
  expect(sent.filter((s) => [SYSTEM.index, SYSTEM.hot].some((p) => p === s.path))).toEqual([]);
  const visible = await setup(folder);
  await seedState(visible, old);
  const f = (await visible.drive.listAll(visible.root)).find((f) => f.name === 'Visible.md');
  expect(f).toBeDefined();
  await visible.drive.writeText(f?.id ?? '', note('Changed control.'), f?.modifiedTime ?? '');
  const refreshed = await run(visible);
  expect(refreshed.code).toBe(0);
  expect(refreshed.after[SYSTEM.index]).toContain('Changed control.');
});

it('B1c index: unchanged summaries keep index bytes and stamp through a visible version change', async () => {
  const base = await setup({ 'Resources/Visible.md': note('Visible control.') });
  const old = '# Index\n> Generated by Bower on 2026-10-06 — 1 notes. Do not edit by hand.\n\n## Resources\n\n- [[Visible]] — Visible control.\n';
  const { state } = await seedState(base, old);
  const control: Sent[] = [];
  const first = await run(base, control);
  expect(first.code).toBe(0);
  expect(first.after[SYSTEM.index]).toBe(old);
  expect(control.filter((s) => [SYSTEM.index, SYSTEM.retrieval, SYSTEM.hot].some((p) => p === s.path))).toEqual([]);
  const f = (await base.drive.listAll(base.root)).find((f) => f.name === 'Visible.md');
  expect(f).toBeDefined();
  base.drive.touch(f?.id ?? ''); // Same evidence/summary, new version: state changes, index content does not.
  vi.setSystemTime(AT + 86_400_000);
  const sent: Sent[] = [];
  const second = await run(base, sent, undefined, 2);
  expect(second.code).toBe(0);
  expect(stateOf(second).files[f?.id ?? '']?.version).not.toBe(state.files[f?.id ?? '']?.version);
  expect.soft(sent.filter((s) => s.path === SYSTEM.index), 'stamp-only changes cause zero index sends').toEqual([]);
  expect(second.after[SYSTEM.index]).toBe(old);
});

it.each([40, 41])('B1c index: existing MOC at %i direct members folds and rebuilds complete regions by id', async (count) => {
  const path = 'Resources/Garden/Garden.md';
  const folder: Record<string, string> = { [path]: moc('Garden evidence.'),
    'Resources/Garden/Child/Child.md': moc('Child evidence.'), 'Resources/Garden/Child/Note 01.md': note('Leaf evidence.') };
  for (let i = count; i > 0; i--) folder[`Resources/Garden/Note ${String(i).padStart(2, '0')}.md`] = note(`Member ${i}.`);
  const base = await setup(folder);
  const sent: Sent[] = [];
  const result = await run(base, sent);
  expect(result.code).toBe(0);
  for (const [p, text] of Object.entries(folder).filter(([p]) => /Note \d+\.md$/.test(p))) expect(result.after[p]).toBe(text);
  expect(region(folder[path], 'moc-members')).toBe('## Notes\n\n- [[Removed]]\n- [[Removed]]\n');
  expect(region(folder[path], 'moc-overview')).toBe('## Overview\n\nAlex recorded these observations.\n');
  const ids = membersById(result, path);
  const wanted = Object.entries(stateOf(result).files).filter(([, f]) => /^Resources\/Garden\/Note \d+\.md$/.test(f.path)).map(([id]) => id);
  expect.soft(ids.length, 'complete direct notes plus the existing child map').toBe(count + 1);
  wanted.push(idAt(result, 'Resources/Garden/Child/Child.md'));
  expect.soft([...ids].sort(), 'members are complete by stable Drive id').toEqual(wanted.sort());
  expect(new Set(ids).size).toBe(ids.length);
  expect(region(result.after[path], 'moc-overview')).toBe(region(folder[path], 'moc-overview'));
  expect(parseNote(path, result.after[path] ?? '').body).toBe(parseNote(path, folder[path] ?? '').body);
  expect.soft(region(result.after[path], 'moc-figures')).toMatch(new RegExp(`\\b${count}\\b`));
  folded(result, 'Garden', count + 1); // Recursive leaf count excludes the maps themselves.
  expect(Object.keys(result.after).filter((p) => !isHidden(p)).sort(), 'existing hierarchy creates no extra maps').toEqual(Object.keys(folder).sort());
  const report = (result.lastRun as { run: { report: { updated: Array<{ path: string }>; created: Array<{ path: string }> } } }).run.report;
  expect(report.updated.filter((row) => row.path === path)).toHaveLength(1);
  expect([...report.updated, ...report.created].filter((row) => isHidden(row.path))).toEqual([]);
  expect(sent.filter((s) => s.path === path)).toHaveLength(1);
  expect(sent.filter((s) => s.path === SYSTEM.index)).toHaveLength(1);
  expect(sent.filter((s) => s.path === SYSTEM.retrieval)).toHaveLength(1);
  const ops = manifests(result).flatMap(([, text]) => (JSON.parse(text) as { operations: Array<{ effect: { kind: string } }> }).operations);
  expect(ops.filter((o) => o.effect.kind === 'maintain')).toHaveLength(1);
  expect(result.wire?.requests.filter((r) => r.method === 'GET' && r.url.searchParams.get('alt') === 'media'
    && r.url.pathname === `/drive/v3/files/${idAt(result, path)}`).length).toBeLessThanOrEqual(1);
});

it('B1c index: a personal MOC stays byte identical while the Bower MOC refreshes', async () => {
  const own = 'Resources/Garden/Garden.md';
  const person = 'Resources/Reading/Reading.md';
  const folder = { [own]: moc('Garden evidence.'), [person]: moc('Personal map.', false),
    'Resources/Garden/Seed.md': note('Seed control.'), 'Resources/Reading/Book.md': note('Book control.') };
  const base = await setup(folder);
  const sent: Sent[] = [];
  const result = await run(base, sent);
  expect(result.code).toBe(0);
  expect(result.after[person]).toBe(folder[person]);
  expect(sent.filter((s) => s.path === person)).toEqual([]);
  expect(result.after[SYSTEM.index]).toContain('[[Book]]');
  expect.soft(result.after[own], 'positive counterpart: the owned map really refreshes').not.toBe(folder[own]);
  folded(result, 'Garden', 1);
  expect(result.after[SYSTEM.index]).not.toContain('→ [[Reading]]');
});

it('B1c index: done replay keeps the folded projection and complete members without another write', async () => {
  const path = 'Resources/Garden/Garden.md';
  const base = await setup({ [path]: moc('Garden evidence.'), 'Resources/Garden/Seed.md': note('Seed control.') });
  const sent: Sent[] = [];
  const first = await run(base, sent);
  expect(first.code).toBe(0);
  expect(sent.some((s) => s.path === SYSTEM.retrieval), 'control: first main performs maintenance').toBe(true);
  const recorded = manifests(first);
  sent.length = 0;
  const again = await redispatchCase(base.c, first, 2, { pacing, around: observe(base.drive, base.root, sent) });
  expect(again.code).toBe(0);
  expect(manifests(again)).toEqual(recorded);
  expect(sent.filter((s) => [path, SYSTEM.index, SYSTEM.retrieval].includes(s.path))).toEqual([]);
  for (const p of [path, SYSTEM.index, SYSTEM.retrieval]) expect(again.after[p]).toBe(first.after[p]);
  expect.soft(membersById(again, path)).toEqual([idAt(again, 'Resources/Garden/Seed.md')]);
  folded(again, 'Garden', 1);
});

it.each([SYSTEM.index, 'Resources/Garden/Garden.md', SYSTEM.retrieval])(
  'B1c index: lost reply for %s resumes the same maintain before the report barrier', async (target) => {
    const path = 'Resources/Garden/Garden.md';
    const base = await setup({ [path]: moc('Garden evidence.'), 'Resources/Garden/Seed.md': note('Seed control.') });
    const lost: Lost = { path: target, reached: false, enabled: true };
    const sent: Sent[] = [];
    const interrupted = await run(base, sent, lost);
    expect(manifests(interrupted)).toHaveLength(1); // Control: fault is after real planning, never admission/load.
    expect(interrupted.after['Resources/Garden/Seed.md']).toBe(base.c.folder['Resources/Garden/Seed.md']);
    expect(lost.reached, 'fault must hit the declared production maintenance target').toBe(true);
    expect(interrupted.code).toBe(1);
    expect(interrupted.after[SYSTEM.lastRun], 'no report before required projections settle').toBeUndefined();
    lost.enabled = false;
    const spawn = vi.fn(replySequence([empty]));
    const resumed = await redispatchCase(base.c, interrupted, 2, { pacing, claude: spawn, around: observe(base.drive, base.root, sent) });
    expect(resumed.code).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    expect(manifests(resumed)).toEqual(manifests(interrupted));
    expect(sent.filter((s) => s.path === target), 'landed bytes reconcile instead of being sent twice').toHaveLength(1);
    const barrier = sent.findIndex((s) => s.path === SYSTEM.lastRun);
    for (const p of [path, SYSTEM.index, SYSTEM.retrieval]) expect.soft(sent.findIndex((s) => s.path === p)).toBeLessThan(barrier);
    expect.soft(membersById(resumed, path)).toEqual([idAt(resumed, 'Resources/Garden/Seed.md')]);
    folded(resumed, 'Garden', 1);
  },
);

async function corpus(id: string): Promise<LoadedCase> {
  const c = await loadCase(resolve(ROOT, id));
  const row = readFileSync(METHOD, 'utf8').split('\n').filter((l) => l.startsWith(`| ${id} |`));
  expect(row, 'existing corpus has one method verdict, never an unreviewed new case').toHaveLength(1);
  expect(row[0]).toMatch(/^\| [a-z0-9-]+ \| agrees \| .{10,}/);
  return c;
}

it('B1c index: corpus b1-index-no-change preserves the derived stamp on the second real instruction press', async () => {
  const c = await corpus('b1-index-no-change');
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const sent: Sent[] = [];
  const options = { pacing, claude: replySequence([empty, empty]), around: observe(drive, root, sent) };
  const first = await runOnDrive(c, drive, root, options, 1);
  expect(first.code).toBe(0);
  expect(first.after['index.md'], 'TL-P4-45 root index belongs to Alex').toBe(c.folder['index.md']);
  expect(first.after['Areas/Home/Home.md']).toBe(c.folder['Areas/Home/Home.md']);
  sent.length = 0;
  vi.setSystemTime(AT + 86_400_000);
  const second = await runOnDrive(c, drive, root, options, 2);
  expect(second.code).toBe(0);
  expect(second.after['index.md']).toBe(c.folder['index.md']);
  for (const p of c.expected.unchanged ?? []) expect(second.after[p]).toBe(c.folder[p]);
  expect.soft(sent.filter((s) => s.path === SYSTEM.index), 'no index write on an unchanged instruction run').toEqual([]);
  expect(second.after[SYSTEM.index]).toBe(first.after[SYSTEM.index]);
  expect(second.after[SYSTEM.index], 'missing derived index is rebuilt on the real instruction path').toBeDefined();
  expect(second.after[SYSTEM.index]).toContain('## Areas');
});

it('B1c index: corpus b1-moc-over-40 folds 41 leaves with complete reachable child maps', async () => {
  const c = await corpus('b1-moc-over-40');
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const result = await runOnDrive(c, drive, root, { pacing, claude: replySequence([empty]) }, 1);
  expect(result.code).toBe(0);
  const leaves = Object.keys(c.folder).filter((p) => p.startsWith('Resources/Gardening/Clippings/'));
  expect(leaves).toHaveLength(41);
  for (const path of leaves) expect(result.after[path]).toBe(c.folder[path]);
  const soil = membersById(result, 'Resources/Gardening/Soil.md');
  const water = membersById(result, 'Resources/Gardening/Water.md');
  expect(soil).toHaveLength(21); expect(water).toHaveLength(20);
  const reached = [...soil, ...water];
  expect(new Set(reached).size).toBe(41);
  expect(reached.sort()).toEqual(leaves.map((path) => idAt(result, path)).sort());
  const parent = membersById(result, 'Resources/Gardening/Gardening.md');
  expect(parent.sort()).toEqual(['Resources/Gardening/Soil.md', 'Resources/Gardening/Water.md'].map((path) => idAt(result, path)).sort());
  folded(result, 'Gardening', 41);
  expect(result.after[SYSTEM.index]).not.toContain('- [[Garden clipping');
});

const legacyPath = 'Resources/Garden/Garden.md';
const legacyOverview = '## Overview\n\nAlex recorded café observations.  \n\n';
const legacyMembers = '## Notes\n\n- [[Removed]]\n- [[Removed]]\n\n';
/** Unframed, made-up stored bytes, including prose outside both admitted headings. */
function legacyMoc(own = true, headings = true): string {
  return `---\nsummary: Garden evidence.\ntype: moc\n${own ? 'by: bower\n' : ''}custom: kept exactly\n---\n\n`
    + '# Garden\n\nAlex keeps these words.  \n- [ ] Keep this task\n\n'
    + (headings ? legacyOverview + legacyMembers : '## Description\n\nOverview is only a word here.\n\n## Links\n\n- [[Removed]]\n\n')
    + '## Personal appendix\n\nAlex keeps this suffix, too.\n';
}
const legacyFolder = (text: string): Record<string, string> => ({
  [legacyPath]: text,
  'Resources/Garden/Seed.md': note('Seed control.'),
  'Resources/Garden/Soil.md': note('Soil control.'),
});

/** Remove only new framing/format declaration and the new figures; restore the one regenerated section. */
function restoredLegacyBytes(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const own = parseOwnership(bytes);
  expect(own.status, 'first maintain migrates the legacy MOC to framed ownership').toBe('v2');
  if (own.status !== 'v2') return text;
  const members = own.payloads['moc-members'];
  const figures = own.payloads['moc-figures'];
  expect(members).toBeDefined(); expect(figures).toBeDefined();
  // Byte offsets come from the production ownership parser, so multibyte prose is protected too.
  const replacements = [
    { span: members, text: legacyMembers }, { span: figures, text: '' },
  ].sort((a, b) => (b.span?.start ?? 0) - (a.span?.start ?? 0));
  let out = bytes;
  for (const { span, text: replacement } of replacements) {
    if (!span) continue;
    const insert = new TextEncoder().encode(replacement);
    const next = new Uint8Array(out.length - (span.end - span.start) + insert.length);
    next.set(out.subarray(0, span.start)); next.set(insert, span.start);
    next.set(out.subarray(span.end), span.start + insert.length); out = next;
  }
  return new TextDecoder().decode(out)
    .replace(/^bower_format: ownership\/2\r?\n/gm, '')
    .replace(/^<!-- bower:ownership\/2 (?:begin|end) (?:current|personal|timeline|bower-note|moc-overview|moc-figures|moc-members) -->\r?\n/gm, '');
}

function expectLegacyMigrated(result: CaseRun, path = legacyPath): void {
  const text = result.after[path];
  expect(region(text, 'moc-overview')).toBe(legacyOverview);
  const names = ['moc-overview', 'moc-figures', 'moc-members'];
  for (const name of names) {
    expect(text?.match(new RegExp(`^<!-- bower:ownership/2 begin ${name} -->$`, 'gm'))).toHaveLength(1);
    expect(text?.match(new RegExp(`^<!-- bower:ownership/2 end ${name} -->$`, 'gm'))).toHaveLength(1);
  }
  const positions = names.map((name) => text?.indexOf(`<!-- bower:ownership/2 begin ${name} -->`) ?? -1);
  expect(positions[0]).toBeLessThan(positions[1] ?? -1);
  expect(positions[1]).toBeLessThan(positions[2] ?? -1);
  expect(membersById(result, path).sort()).toEqual(['Resources/Garden/Seed.md', 'Resources/Garden/Soil.md']
    .map((p) => idAt(result, p)).sort());
  expect(region(text, 'moc-members')).not.toContain('[[Removed]]');
}

it('B1c index: legacy MOC migrates on its first maintain and keeps every other byte', async () => {
  const original = legacyMoc();
  expect(parseOwnership(new TextEncoder().encode(original)).status).toBe('legacy');
  expect(parseNote(legacyPath, original).byBower).toBe(true);
  const base = await setup(legacyFolder(original));
  const sent: Sent[] = [];
  const result = await run(base, sent);
  expect(result.code).toBe(0);
  expect(sent.filter((s) => s.path === SYSTEM.retrieval), 'positive control: main really maintains the state').toHaveLength(1);
  expect(stateOf(result).files[idAt(result, 'Resources/Garden/Seed.md')]?.summary).toBe('Seed control.');
  for (const path of ['Resources/Garden/Seed.md', 'Resources/Garden/Soil.md']) expect(result.after[path]).toBe(base.c.folder[path]);
  expectLegacyMigrated(result);
  expect(restoredLegacyBytes(result.after[legacyPath] ?? ''), 'all bytes outside the regenerated Notes survive').toBe(original);
  expect(sent.filter((s) => s.path === legacyPath)).toHaveLength(1);
});

it('B1c index: legacy MOC second maintain is idempotent with no MOC write', async () => {
  const base = await setup(legacyFolder(legacyMoc()));
  const firstSent: Sent[] = [];
  const first = await run(base, firstSent);
  expect(first.code).toBe(0);
  expect(firstSent.filter((s) => s.path === SYSTEM.retrieval), 'positive control: first maintain ran').toHaveLength(1);
  const seedId = idAt(first, 'Resources/Garden/Seed.md');
  base.drive.touch(seedId); // Same summary and membership, new version: force a real second maintain.
  const sent: Sent[] = [];
  const second = await run(base, sent, undefined, 2);
  expect(second.code).toBe(0);
  expect(stateOf(second).files[seedId]?.version).not.toBe(stateOf(first).files[seedId]?.version);
  const ops = manifests(second).flatMap(([, text]) => (JSON.parse(text) as ManifestV2).operations);
  expect(ops.filter((op) => op.effect.kind === 'maintain'), 'both real presses reached maintain').toHaveLength(2);
  expect(second.after[legacyPath], 'second maintain keeps the exact migrated bytes').toBe(first.after[legacyPath]);
  expect(sent.filter((s) => s.path === legacyPath), 'second maintain sends no MOC write').toEqual([]);
  expectLegacyMigrated(second); // An untouched legacy note cannot masquerade as an idempotent migration.
  expect(firstSent.filter((s) => s.path === legacyPath), 'positive control: migration wrote once').toHaveLength(1);
  expect(restoredLegacyBytes(second.after[legacyPath] ?? '')).toBe(base.c.folder[legacyPath]);
});

it('B1c index: legacy MOC without Overview and Notes is untouched', async () => {
  // A missing pair, either single missing heading, and near-matches never grant migration by guessing.
  const originals = [legacyMoc(true, false), legacyMoc().replace('## Overview\n', '## Description\n'),
    legacyMoc().replace('## Notes\n', '## Links\n')];
  for (const original of originals) {
    const base = await setup(legacyFolder(original));
    const sent: Sent[] = [];
    const result = await run(base, sent);
    expect(result.code).toBe(0);
    expect(result.after[legacyPath]).toBe(original);
    expect(sent.filter((s) => s.path === legacyPath)).toEqual([]);
    expect(result.after['Resources/Garden/Seed.md']).toBe(base.c.folder['Resources/Garden/Seed.md']);
    expect(sent.filter((s) => s.path === SYSTEM.retrieval), 'main reached maintenance for the protected fixture').toHaveLength(1);
  }
  const controlSent: Sent[] = [];
  const control = await run(await setup(legacyFolder(legacyMoc())), controlSent);
  expect(control.code).toBe(0);
  expectLegacyMigrated(control); // Positive counterpart: the exact admitted headings really migrate.
  expect(controlSent.filter((s) => s.path === legacyPath)).toHaveLength(1);
});

it('B1c index: legacy MOC belonging to a person with the same headings is untouched', async () => {
  const person = 'Resources/Reading/Reading.md';
  const original = legacyMoc(false);
  const base = await setup({ ...legacyFolder(legacyMoc()), [person]: original,
    'Resources/Reading/Book.md': note('Book control.') });
  const sent: Sent[] = [];
  const result = await run(base, sent);
  expect(result.code).toBe(0);
  expect(parseNote(person, original).byBower).toBe(false);
  expect(result.after[person]).toBe(original);
  expect(sent.filter((s) => s.path === person)).toEqual([]);
  expect(result.after[SYSTEM.index]).toContain('[[Book]]');
  expectLegacyMigrated(result); // Same maintain, same headings: only the Bower-owned counterpart migrates.
  expect(sent.filter((s) => s.path === legacyPath)).toHaveLength(1);
});

/** A snapshot may choose its envelope; assert the frozen region bytes without inventing a second schema. */
function snapshotStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item: unknown) => snapshotStrings(item));
  return value && typeof value === 'object' ? Object.values(value).flatMap(snapshotStrings) : [];
}

it('B1c index: maintain MOC targets pass the fenced-edit guard and personal targets are refused', async () => {
  const person = 'Resources/Reading/Reading.md';
  const ownText = moc('Garden evidence.');
  const personText = moc('Personal map.', false);
  const base = await setup({ ...legacyFolder(ownText), [person]: personText,
    'Resources/Reading/Book.md': note('Book control.') });
  const result = await run(base);
  expect(result.code).toBe(0);
  const recorded = manifests(result).find(([, text]) => (JSON.parse(text) as ManifestV2).runId === result.dispatch?.runId);
  expect(recorded, 'positive control: main persists a real manifest').toBeDefined();
  const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
  const manifest = JSON.parse(recorded?.[1] ?? '{}') as ManifestV2;
  expect(await parseRunManifestV2(encode(manifest), base.root, RUNNER_WRITES), 'real main manifest passes the guard').toMatchObject({ ok: true });
  const op = manifest.operations.find((item) => item.effect.kind === 'maintain');
  expect(op).toBeDefined();
  if (!op || op.effect.kind !== 'maintain') return;
  const inputs = op.effect.inputs;
  const ownId = idAt(result, legacyPath);
  const personId = idAt(result, person);
  const ownBefore = inputs.listing?.find((f) => f.fileId === ownId);
  const personalBefore = inputs.listing?.find((f) => f.fileId === personId);
  expect(ownBefore).toBeDefined();
  expect(personalBefore).toBeDefined();
  const reseal = async (value: ManifestV2): Promise<void> => {
    const item = value.operations.find((entry) => entry.effect.kind === 'maintain');
    if (!item) throw new Error('Missing copied maintain effect');
    const oldId = item.operationId;
    item.operationId = (await canonical({ runId: value.runId, captureId: value.captureId,
      ordinal: item.ordinal, effect: item.effect })).hash;
    for (const row of value.reportPlan) row.requires = row.requires.map((id) => id === oldId ? item.operationId : id);
  };
  // Keep the real captured person snapshot. Retarget only the declared send and reseal the operation,
  // so rejection must come from the fenced contract, never a stale operation digest.
  const refused = structuredClone(manifest);
  const badOp = refused.operations.find((item) => item.operationId === op.operationId);
  if (!badOp || badOp.effect.kind !== 'maintain') throw new Error('Missing copied maintain effect');
  const badTarget = badOp.effect.inputs.targets?.find((t) => t.fileId === ownId) ?? badOp.effect.inputs.targets?.[0];
  expect(badTarget).toBeDefined();
  Object.assign(badTarget ?? {}, { path: person, fileId: personId, parentId: personalBefore?.parents[0],
    beforeContent: { encoding: 'utf8', size: new TextEncoder().encode(personText).length,
      sha256: await sha256Hex(personText), provenance: 'fake-stored', observedModifiedTime: personalBefore?.modifiedTime } });
  await reseal(refused);
  expect(await parseRunManifestV2(encode(refused), base.root, RUNNER_WRITES), 'a person target is refused with valid identities').toMatchObject({ ok: false });
  // Submit an explicit owned target even before main knows to declare one. The snapshot remains main's
  // real frozen input, so these assertions cover both its region inputs and the existing admission guard.
  const admitted = structuredClone(manifest);
  const ownOp = admitted.operations.find((item) => item.operationId === op.operationId);
  if (!ownOp || ownOp.effect.kind !== 'maintain') throw new Error('Missing copied maintain effect');
  Object.assign(ownOp.effect.inputs, { targets: [
    ...(inputs.targets ?? []).filter((t) => t.fileId !== ownId),
    { path: legacyPath, fileId: ownId, parentId: ownBefore?.parents[0], beforeContent: {
      encoding: 'utf8', size: new TextEncoder().encode(ownText).length, sha256: await sha256Hex(ownText),
      provenance: 'fake-stored', observedModifiedTime: ownBefore?.modifiedTime,
    } },
  ] });
  await reseal(admitted);
  const frozen = snapshotStrings(inputs.snapshot?.[ownId]);
  for (const name of ['moc-overview', 'moc-figures', 'moc-members'] as const) {
    const previous = region(ownText, name);
    expect.soft(frozen.some((text) => text.includes(previous)), `${name} bytes are frozen in maintain snapshot inputs`).toBe(true);
  }
  expect(await parseRunManifestV2(encode(admitted), base.root, RUNNER_WRITES), 'MOC snapshot and target pass the same existing guard').toMatchObject({ ok: true });
});
