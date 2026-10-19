/** B8a reds through production main and the corpus driver: the monthly log (TL-P4-50 Q1-Q2), ported from b8-log a397198f. */
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { AT, caseReplies, redispatchCase, replySequence, runOnDrive, runScripted, scoreCase, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive, paging } from './drive-v3';
import { setup as planningSetup, run as planningRun, select, fileIntent, folder, note, report } from './b1-planning-support';
import { observe, writes, type Observation } from './b23-hot-observe';
import { opKey } from '../../src/data/contracts/op-key';
import type { ManifestV2 } from '../../src/data/contracts/run-manifest';
import { MANIFEST_V2_LIMIT, parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { hashRecordJson } from '../../src/data/contracts/record-json';
import { RUNNER_WRITES } from '../../src/data/vault/layout';
import { formatLogEvent, readLog } from '../../src/data/contracts/log-format';
import { appendLog } from '../src/log';

const MONTH = '.bower/log/2026-10.md';
const HUB = 'Resources/Gardening/Gardening.md';
const NOTICE = 'Resources/Gardening/Mulch notice.md';
const empty = { kind: 'tidy-intent', v: 1, things: [] };
const pacing = { sleep: async (): Promise<void> => undefined };
const fixture = (name: string) => loadCase(resolve(import.meta.dirname, '../../testing/corpus', `c17-b8-${name}`));
const events = (run: CaseRun) => (run.after[MONTH] ?? '').split(/\r?\n/).filter((line) => / · op:[0-9a-f]{12}$/.test(line));
const manifest = (run: CaseRun): ManifestV2 => {
  const text = Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1];
  expect(text, 'main persists its admitted manifest').toBeDefined();
  return JSON.parse(text ?? '{}') as ManifestV2;
};
/** The manifest of this press's own run (a drive with several runs keeps every run folder). */
const manifestOf = (run: CaseRun): ManifestV2 => {
  const text = Object.entries(run.after).find(([path]) => path.includes(`/runs/${run.dispatch?.runId ?? ''}/`) && /\/manifest-[^/]+\.json$/.test(path))?.[1];
  expect(text, 'main persists this run manifest').toBeDefined();
  return JSON.parse(text ?? '{}') as ManifestV2;
};
/** settled-recovery's applied primary operations through caseReplies: move, companion create, hub edit, in manifest order. */
const forwardKeys = (base: { root: string }, m: ManifestV2) => m.operations.filter((op) => op.effect.kind === 'create-text'
  && op.effect.purpose === 'generated' && op.effect.name === 'Mulch notice.md' || op.effect.kind === 'move' && op.effect.before.name === 'Mulch notice.txt'
  || op.effect.kind === 'edit-text' && op.effect.path === HUB).map((op) => opKey(base.root, m.runId, op.operationId));
/** An existing month: prose, CRLF, a line with another run's key, and no final newline (R11). */
const SEEDED = '# Log\r\nAlex wrote this aside.\r\n2026-10-01 | create | Resources/Gardening/Old.md | Alex kept an old note. · op:0123456789ab';
/** bounded-encoding's seeded month: one earlier line from another run, with a sanitized name and a bare pipe. */
const SEED = '# Log\n2026-10-01 | create | Resources/Gardening/Beds / paths.md | Alex compared beds|paths. · op:0123456789ab\n';
const filing = (extra: Record<string, unknown> = {}) => ({ ...empty, ...extra, things: [{ fileId: '$file:Mulch notice.txt',
  to: 'Resources/Gardening', name: 'Mulch notice.txt', note: { name: 'Mulch notice.md', summary: 'Mulch collection opens at the amber gate.',
    body: 'Alex can collect mulch from the amber gate at the Saltmere garden.\n\nSee also [[Gardening]]: the mulch is for the same garden.',
    ...(extra.newTags ? { tags: extra.newTags } : {}) } }] });
async function setup(name = 'settled-recovery', extra: Record<string, string> = {}) {
  const c = await fixture(name);
  Object.assign(c.folder, extra);
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const traffic: Observation[] = [];
  return { c, drive, root, traffic, around: observe(drive, root, traffic) };
}
type Base = Awaited<ReturnType<typeof setup>>;
const blocked = (path: string | readonly string[], base: Base, status = 403) => (fetch: typeof globalThis.fetch) => {
  const paths = typeof path === 'string' ? [path] : path;
  let seen = base.traffic.length;
  return observe(base.drive, base.root, base.traffic)(async (input, init = {}) => {
    const last = base.traffic.length > seen ? base.traffic.at(-1) : undefined;
    seen = base.traffic.length;
    if (paths.includes(last?.path ?? '') && ['POST', 'PATCH'].includes(init.method ?? 'GET')) {
      return new Response(JSON.stringify({ error: { code: status, message: 'Made-up target refusal', errors: [{ reason: status === 409 ? 'conflict' : 'forbidden' }] } }), { status });
    }
    return fetch(input, init);
  });
};
function loss(base: Base) {
  const state = { reached: false, enabled: true };
  const around = (fetch: typeof globalThis.fetch) => {
    let seen = base.traffic.length;
    return observe(base.drive, base.root, base.traffic)(async (input, init = {}) => {
      const last = base.traffic.length > seen ? base.traffic.at(-1) : undefined;
      seen = base.traffic.length;
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (state.enabled && state.reached && url.origin === 'https://www.googleapis.com' && last?.path === MONTH) {
        throw new TypeError('Made-up log readback unavailable');
      }
      const response = await fetch(input, init);
      if (state.enabled && last?.path === MONTH && ['POST', 'PATCH'].includes(init.method ?? 'GET')) {
        expect(response.ok, 'the log fault lands bytes before losing the response').toBe(true);
        state.reached = true;
        throw new TypeError('Made-up lost log response');
      }
      return response;
    });
  };
  return { state, around };
}
async function undoFiling() {
  const base = await setup();
  const first = await runOnDrive(base.c, base.drive, base.root, { claude: caseReplies(base.c.id), around: base.around, pacing }, 1);
  expect(first.code).toBe(0);
  const filed = 'Resources/Gardening/Mulch notice.txt';
  const id = Object.entries(first.pathsById).find(([, path]) => path === filed)?.[0] ?? '';
  const m = manifest(first);
  const op = m.operations.find((item) => item.effect.kind === 'move' && item.effect.before.fileId === id)?.operationId;
  expect(op).toMatch(/^[0-9a-f]{64}$/);
  const files = await base.drive.listAll(base.root);
  const inbox = files.find((f) => f.folder && f.name === 'Inbox' && f.parents[0] === base.root);
  const changes = files.find((f) => base.drive.pathOf(f.id, base.root) === '.bower/changes');
  const source = await base.drive.get(id);
  // The supported client compensation restores bytes/place, then queues its inverse for main, as B3b does.
  await base.drive.update(id, { name: 'Mulch notice.txt', addParent: inbox?.id ?? '', removeParent: source.parents[0] });
  const companion = Object.entries(first.pathsById).find(([, path]) => path === NOTICE)?.[0];
  await base.drive.trash(companion ?? '');
  await base.drive.createText(changes?.id ?? '', 'undo-file.json', JSON.stringify({ v: 1, id: 'undo-file', device: 'device-1',
    at: AT + 1, kind: 'move', what: 'Put back Mulch notice.', undoes: op, fileId: id, path: 'Inbox/Mulch notice.txt', from: filed }));
  await base.drive.createText(changes?.id ?? '', 'undo-request.json', JSON.stringify({ v: 1, id: 'undo-request', device: 'device-1',
    at: AT + 1, kind: 'request', what: 'Undo the last tidy-up', text: 'Undo the last tidy-up' }));
  vi.setSystemTime(AT + 1);
  const undone = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([empty]), around: base.around, pacing,
    answerStart: { scope: 'instructions', requestId: 'undo-run' } }, 2);
  return { base, first, undone };
}

describe('B8a monthly log through main', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AT);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('AC4 b8-applied-only-one-event', async () => {
    const base = await setup();
    const run = await runOnDrive(base.c, base.drive, base.root, { around: blocked(HUB, base, 409), claude: replySequence([{
      ...filing(), lines: [{ note: HUB, text: 'Mulch collection opens at the amber gate.', cites: '$file:Mulch notice.txt' }],
    }]), pacing }, 1);
    expect(run.code, 'an ordinary rejected hub edit still permits settled filing and maintenance').toBe(0);
    expect(writes(base.traffic, HUB), 'the primary hub write is attempted and refused').not.toEqual([]);
    expect(run.after[HUB]).toBe(base.c.folder[HUB]);
    const m = manifest(run);
    const expected = m.operations.filter((op) => op.effect.kind === 'create-text' && op.effect.purpose === 'generated'
      && op.effect.name === 'Mulch notice.md' || op.effect.kind === 'move' && op.effect.before.name === 'Mulch notice.txt')
      .map((op) => opKey(base.root, m.runId, op.operationId));
    expect(expected).toHaveLength(2);
    expect(events(run).map((line) => line.slice(-12)), 'only the two applied primary operations, in manifest order').toEqual(expected);
    expect(events(run).map((line) => line.split(' | ')[1]).sort()).toEqual(['create', 'ingest']);
  });
  it('AC4 control: filing and companion creation settle through main', async () => {
    const run = await runScripted(await fixture('settled-recovery'));
    expect(run.code).toBe(0);
    expect(run.after['Resources/Gardening/Mulch notice.txt']).toContain('Mulch');
    expect(run.after[NOTICE]).toContain('Mulch collection');
  });
  it('AC4 ruling 2: a folder-backed pile logs its things, not folder plumbing', async () => {
    const base = await planningSetup({ inbox: [{ line: 'Alex has remote developer offers.', files: ['Offer.txt', 'Second.txt'] }] });
    expect(base.admission.piles[0]?.anchor).toBeDefined();
    const to = 'Projects/Remote search/Offers';
    const selection = select(base, [base.id('Projects/Remote search/Remote search.md')]);
    for (const item of selection.items) item.destination = { parentId: base.id('Projects/Remote search'), name: 'Offers' };
    const run = await planningRun(base, [selection, fileIntent(base, to)]);
    expect(run.code).toBe(0);
    expect(report(run).filed).toHaveLength(2);
    const m = manifest(run);
    expect(m.operations.some((op) => op.effect.kind === 'create-folder' && op.effect.name === 'Offers')).toBe(true);
    expect(m.operations.some((op) => op.effect.kind === 'bin' && op.effect.before.folder)).toBe(true);
    const primary = m.operations.filter((op) => op.effect.kind === 'move' && ['Offer.txt', 'Second.txt'].includes(op.effect.before.name)
      || op.effect.kind === 'create-text' && op.effect.purpose === 'generated');
    expect(primary).toHaveLength(4);
    expect(events(run).map((line) => line.slice(-12))).toEqual(primary.map((op) => opKey(base.root, m.runId, op.operationId)));
    expect(events(run).map((line) => line.split(' | ')[1]).sort()).toEqual(['create', 'create', 'ingest', 'ingest']);
  });

  it('AC5 b8-runner-path-exact-scope', async () => {
    const run = await runScripted(await fixture('bounded-encoding'));
    const m = manifest(run);
    const targets = m.operations.flatMap((op) => op.effect.kind === 'maintain' ? op.effect.inputs.targets ?? [] : []);
    const monthly = targets.find((target) => target.path === MONTH);
    expect(monthly, 'the monthly file has an exact frozen target, not blanket dot-path permission').toBeDefined();
    expect(run.pathsById[monthly?.fileId ?? '']).toBe(MONTH);
    expect(targets.some((target) => target.path === '.bower/unrelated.md')).toBe(false);
  });
  // Already refused on main (maintenanceTargetOk resolves the id through capture places): a guard the change keeps.
  it('AC5 guard: a declared runner path cannot grant a personal note id', async () => {
    const run = await runScripted(await fixture('report-only-grammar'));
    const m = manifest(run);
    const op = m.operations.find((item) => item.effect.kind === 'maintain');
    if (op?.effect.kind !== 'maintain') throw new Error('Control main must declare maintain.');
    const target = op.effect.inputs.targets?.find((item) => item.path === '.bower/index.md');
    if (!target) throw new Error('Control main must declare its index.');
    target.fileId = Object.entries(run.pathsById).find(([, path]) => path === 'Resources/Gardening/Plot diary.md')?.[0] ?? '';
    const hash = await hashRecordJson({ runId: m.runId, captureId: m.captureId, ordinal: op.ordinal, effect: op.effect });
    if (!hash.ok) throw new Error('The mutated operation must be canonical JSON.');
    op.operationId = hash.value;
    expect((await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), run.root, RUNNER_WRITES)).ok,
      'a declared index path cannot grant a personal note id').toBe(false);
  });
  it('AC5 control: root personal log bytes stay untouched and no annual log is made', async () => {
    const c = await fixture('bounded-encoding');
    const personal = 'Alex keeps this personal log.\r\n';
    c.folder['log.md'] = personal;
    const run = await runScripted(c);
    expect(run.code).toBe(0);
    expect(run.after['log.md']).toBe(personal);
    expect(run.after['.bower/log.md'], 'no annual log is made').toBeUndefined();
  });
  it('AC5 control: the unmodified declared manifest remains valid', async () => {
    const run = await runScripted(await fixture('report-only-grammar'));
    expect((await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(manifest(run))), run.root, RUNNER_WRITES)).ok).toBe(true);
  });

  it('AC6 b8-all-targets-before-done', async () => {
    const base = await setup();
    const run = await runOnDrive(base.c, base.drive, base.root, { around: blocked(MONTH, base), claude: caseReplies(base.c.id), pacing }, 1);
    expect(writes(base.traffic, MONTH), 'main must actually send the declared monthly log').not.toEqual([]);
    expect(run.wire?.statuses.some((status) => status.phase === 'done'), 'the log has no proof, so main must remain unfinished').toBe(false);
    expect(run.code).not.toBe(0);
  });
  it('AC6 ruling: maintenance exhaustion keeps the report and leaves unreached log targets absent', async () => {
    const pageSize = paging.size;
    paging.size = 1000;
    try {
      const archive = Object.fromEntries(Array.from({ length: 139 }, (_, i) =>
        [`Archive/Record ${i}.md`, note('Unrelated background.', 'Archive evidence.\n')]));
      const base = await planningSetup({ folder: { ...folder, ...archive } });
      const run = await planningRun(base, [select(base, [base.id('Projects/Remote search/Remote search.md')]), fileIntent(base)]);
      expect(run.code).toBe(0);
      expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
      expect(report(run).filed).toHaveLength(1);
      expect(run.after['.bower/retrieval.json']).toBeDefined();
      expect(run.errors).toContain('Bower will finish updating its notes next time.');
      expect(run.after[MONTH]).toBeUndefined();
      expect((await base.drive.listAll(base.root)).some((f) => base.drive.pathOf(f.id, base.root) === '.bower/log')).toBe(false);
      expect(run.events.filter((e) => e.path.startsWith('.bower/log') && ['POST', 'PATCH'].includes(e.method))).toEqual([]);
    } finally { paging.size = pageSize; }
  });

  it('AC6 control: all existing required targets settle', async () => {
    const base = await setup('report-only-grammar');
    const run = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([empty]), around: base.around, pacing }, 1);
    expect(run.code).toBe(0);
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(run.after['.bower/retrieval.json']).toBeDefined();
  });

  it('AC6 b8-eventless-month-rollover', async () => {
    const base = await setup();
    const first = await runOnDrive(base.c, base.drive, base.root, { claude: caseReplies(base.c.id), around: base.around, pacing }, 1);
    expect(events(first), 'the October run logs its applied operations').toHaveLength(3);
    base.traffic.length = 0;
    // R12: a November run with nothing applied writes and declares no month file.
    const november: AdmissionManifest = { v: 1, id: 'feed-only-november', rootId: base.root, scope: 'all', at: Date.UTC(2026, 10, 2, 9), piles: [], journal: [] };
    vi.setSystemTime(november.at);
    const second = await runOnDrive(base.c, base.drive, base.root, { admission: november, claude: replySequence([empty]), around: base.around, pacing }, 2);
    expect(second.code).toBe(0);
    expect(Object.keys(second.after).filter((path) => path.startsWith('.bower/log/'))).toEqual([MONTH]);
    expect(second.after[MONTH]).toBe(first.after[MONTH]);
    expect(base.traffic.filter((e) => e.path.startsWith('.bower/log') && ['POST', 'PATCH'].includes(e.method))).toEqual([]);
  });
  it('R12 ruling: all refused primary events leave the declared log unwritten', async () => {
    const base = await setup();
    const source = (await base.drive.listAll(base.root)).find((f) => f.name === 'Mulch notice.txt');
    const sourcePath = base.drive.pathOf(source?.id ?? '', base.root) ?? '';
    expect(sourcePath).toMatch(/^Inbox\//);
    const run = await runOnDrive(base.c, base.drive, base.root, { around: blocked([NOTICE, sourcePath], base, 503),
      claude: replySequence([filing()]), pacing }, 1);
    expect(run.code).toBe(0);
    expect(writes(base.traffic, sourcePath)).not.toEqual([]);
    expect(run.after[NOTICE]).toBeUndefined();
    expect(run.after[sourcePath]).toBe(base.c.inboxFiles['Mulch notice.txt']);
    expect(manifest(run).operations.some((op) => op.effect.kind === 'maintain'
      && op.effect.inputs.targets?.some((target) => target.path === MONTH))).toBe(true);
    expect(run.after[MONTH]).toBeUndefined();
    expect((await base.drive.listAll(base.root)).some((f) => base.drive.pathOf(f.id, base.root) === '.bower/log')).toBe(false);
    expect(base.traffic.filter((e) => e.path.startsWith('.bower/log') && ['POST', 'PATCH'].includes(e.method))).toEqual([]);
  });

  it('AC6 guard: an eventless first run creates no log folder or month file', async () => {
    const base = await setup('report-only-grammar');
    const run = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([empty]), around: base.around, pacing }, 1);
    expect(run.code).toBe(0);
    expect(Object.keys(run.after).filter((path) => path.startsWith('.bower/log/'))).toEqual([]);
    expect(base.traffic.filter((e) => e.path.startsWith('.bower/log') && ['POST', 'PATCH'].includes(e.method))).toEqual([]);
  });

  it('AC2 b8-bounded-encoding-log-oracle', async () => {
    const c = await fixture('bounded-encoding');
    const run = await runScripted(c);
    expect(run.code).toBe(0);
    const text = run.after[MONTH] ?? '';
    expect(text, 'the ingest line names the original inbox name, sanitized').toContain(' | ingest | ');
    expect(text).toContain('Options / alternatives.txt');
    expect(text).not.toContain('Options | alternatives.txt');
    expect(text).not.toContain('\\u007c');
    for (const line of text.split('\n')) expect(new TextEncoder().encode(`${line}\n`).length).toBeLessThanOrEqual(4096);
    expect(events(run).map((line) => line.split(' | ')[1]), 'the seeded line, then the ingest and the create').toEqual(['create', 'ingest', 'create']);
    expect(run.after['.bower/log.md'], 'no annual log is made').toBeUndefined();
  });

  it('AC2 b8-month-text-never-frozen', async () => {
    // R13: a month over the manifest's 8 MiB limit still appends; the manifest freezes the month's identity, not its text.
    const big = `# Log\n${'2026-10-01 | update | Resources/Gardening/Old.md | Alex kept a long history. · op:0123456789ab\n'.repeat(Math.ceil((MANIFEST_V2_LIMIT + 1) / 92))}`;
    const base = await setup('settled-recovery', { [MONTH]: big });
    const run = await runOnDrive(base.c, base.drive, base.root, { claude: caseReplies(base.c.id), around: base.around, pacing }, 1);
    expect(run.code, 'an oversized month never refuses an ordinary run').toBe(0);
    const text = run.after[MONTH] ?? '';
    expect(text.startsWith(big)).toBe(true);
    expect(text.slice(big.length).split('\n').filter(Boolean).map((line) => line.slice(-12))).toEqual(forwardKeys(base, manifest(run)));
    const manifestBytes = Object.entries(run.after).filter(([path]) => /\/manifest-[^/]+\.json$/.test(path)).map(([, t]) => new TextEncoder().encode(t).length);
    expect(Math.max(...manifestBytes)).toBeLessThan(1024 * 1024);
  });
  it('AC2 control: an ordinary run manifest is far below the limit', async () => {
    const base = await setup();
    const run = await runOnDrive(base.c, base.drive, base.root, { claude: caseReplies(base.c.id), around: base.around, pacing }, 1);
    expect(run.code).toBe(0);
    expect(new TextEncoder().encode(JSON.stringify(manifest(run))).length).toBeLessThan(1024 * 1024);
  });

  it('AC7 b8-same-run-lost-log-response', async () => {
    const base = await setup();
    const lost = loss(base);
    const first = await runOnDrive(base.c, base.drive, base.root, { around: lost.around, claude: caseReplies(base.c.id), pacing }, 1);
    expect(lost.state.reached, 'main must actually send the declared monthly log').toBe(true);
    expect(first.wire?.statuses.some((status) => status.phase === 'done')).toBe(false);
    lost.state.enabled = false;
    const recovered = await redispatchCase(base.c, first, 2, { around: base.around, pacing });
    expect(recovered.code).toBe(0);
    const m = manifest(recovered);
    expect(events(recovered).map((line) => line.slice(-12)), 'exactly the applied primary operations, in manifest order')
      .toEqual(forwardKeys(base, m));
    expect(events(recovered), 'the landed lines are kept, not replaced').toEqual(events(first));
    expect(writes(base.traffic, MONTH)).toHaveLength(1);
  });
  it('AC7 b8-month-prefix-preserved', async () => {
    const base = await setup('settled-recovery', { [MONTH]: SEEDED });
    const lost = loss(base);
    const first = await runOnDrive(base.c, base.drive, base.root, { around: lost.around, claude: caseReplies(base.c.id), pacing }, 1);
    expect(lost.state.reached, 'main must actually send the existing month').toBe(true);
    lost.state.enabled = false;
    const recovered = await redispatchCase(base.c, first, 2, { around: base.around, pacing });
    expect(recovered.code).toBe(0);
    const text = recovered.after[MONTH] ?? '';
    expect(text.startsWith(`${SEEDED}\n`), 'every existing byte is kept, with one separating newline').toBe(true);
    expect(text.slice(SEEDED.length + 1).split('\n').filter(Boolean).map((line) => line.slice(-12))).toEqual(forwardKeys(base, manifest(recovered)));
    expect(writes(base.traffic, MONTH)).toHaveLength(1);
  });
  it('AC7 ruling 5: replay skips a keyed CRLF line and preserves every byte', () => {
    const event = { rootId: 'made-up-root', runId: 'made-up-run', operationId: 'made-up-op', requestedAt: AT,
      action: 'create', note: NOTICE, detail: 'Alex saved a mulch notice.' };
    const before = `# Log\r\n${formatLogEvent(event).line}\r\n`;
    expect(appendLog(before, [event])).toBe(before);
    const next = { ...event, operationId: 'made-up-next' };
    const appended = appendLog(before, [event, next]);
    expect(appended).toBe(`${before}${formatLogEvent(next).line}\n`);
    expect(appendLog(appended, [event, next])).toBe(appended);
  });
  it('AC7 b8-log-folder-lost-create', async () => {
    const base = await setup();
    const state = { reached: false, enabled: true };
    const around = (fetch: typeof globalThis.fetch) => {
      let seen = base.traffic.length;
      return observe(base.drive, base.root, base.traffic)(async (input, init = {}) => {
        const last = base.traffic.length > seen ? base.traffic.at(-1) : undefined;
        seen = base.traffic.length;
        const response = await fetch(input, init);
        if (state.enabled && last?.path === '.bower/log' && init.method === 'POST') {
          state.reached = true;
          throw new TypeError('Made-up lost folder response');
        }
        return response;
      });
    };
    const first = await runOnDrive(base.c, base.drive, base.root, { around, claude: caseReplies(base.c.id), pacing }, 1);
    expect(state.reached, 'main must actually create the log folder').toBe(true);
    expect(first.wire?.statuses.some((status) => status.phase === 'done')).toBe(false);
    state.enabled = false;
    const recovered = await redispatchCase(base.c, first, 2, { around: base.around, pacing });
    expect(recovered.code).toBe(0);
    const folders = (await base.drive.listAll(base.root)).filter((f) => f.folder && base.drive.pathOf(f.id, base.root) === '.bower/log');
    expect(folders, 'one log folder after recovery').toHaveLength(1);
    const month = Object.entries(recovered.pathsById).find(([, path]) => path === MONTH)?.[0] ?? '';
    expect((await base.drive.get(month)).parents).toEqual([folders[0]?.id]);
  });
  it('AC7 control: same-run recovery never refiles the companion', async () => {
    const base = await setup();
    const first = await runOnDrive(base.c, base.drive, base.root, { around: base.around, claude: caseReplies(base.c.id), pacing }, 1);
    const again = await redispatchCase(base.c, first, 2, { around: base.around, pacing });
    expect(again.code).toBe(0);
    expect(again.after).toEqual(first.after);
    expect(writes(base.traffic, NOTICE)).toHaveLength(1);
  });
  it('AC7 guard b8-done-redispatch-noop: a done run makes no provider call and no write', async () => {
    const base = await setup('report-only-grammar');
    const first = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([empty]), around: base.around, pacing }, 1);
    const again = await redispatchCase(base.c, first, 2, { around: base.around, pacing });
    const before = base.traffic.length;
    let calls = 0;
    const third = await redispatchCase(base.c, again, 3, { around: base.around, pacing, claude: async () => {
      calls++; throw new Error('A done run must never call the provider.');
    } });
    expect(calls).toBe(0);
    expect(base.traffic.slice(before).filter((e) => ['POST', 'PATCH', 'DELETE'].includes(e.method))).toEqual([]);
    expect(third.after).toEqual(first.after);
  });

  it('AC8 b8-undo-keeps-audit', async () => {
    const { base, first, undone } = await undoFiling();
    expect(undone.code).toBe(0);
    const prior = events(first);
    const m = manifest(first);
    const forward = m.operations.filter((op) => op.effect.kind === 'create-text' && op.effect.purpose === 'generated' && op.effect.name === 'Mulch notice.md'
      || op.effect.kind === 'move' && op.effect.before.name === 'Mulch notice.txt' || op.effect.kind === 'edit-text' && op.effect.path === HUB)
      .map((op) => opKey(base.root, m.runId, op.operationId));
    expect(prior.map((line) => line.slice(-12)), 'all settled forward audit events survive Undo').toEqual(forward);
    expect(events(undone).slice(0, prior.length)).toEqual(prior);
    // R10: the inverse is the client's journal line, settled by this run's archive move of that line.
    const u = manifestOf(undone);
    const archive = u.operations.find((op) => op.effect.kind === 'move' && op.effect.before.name === 'undo-file.json');
    expect(archive, 'the Undo run archives the inverse journal line').toBeDefined();
    const inverses = events(undone).slice(prior.length);
    expect(inverses, 'one event for the inverse line, none for the request line').toHaveLength(1);
    const [date, action, note, rest] = (inverses[0] ?? '').split(' | ');
    expect([date, action, note]).toEqual(['2026-10-07', 'move', 'Inbox/Mulch notice.txt']);
    expect(rest).toContain('Put back Mulch notice.');
    expect(rest?.slice(-12)).toBe(opKey(base.root, u.runId, archive?.operationId ?? ''));
    const again = await redispatchCase(base.c, undone, 2, { around: base.around, pacing });
    expect(events(again)).toEqual(events(undone));
  });
  it('AC8 control: supported compensation restores the source and settles the inverse', async () => {
    const { base, undone } = await undoFiling();
    expect(undone.code).toBe(0);
    expect(undone.after['Inbox/Mulch notice.txt']).toBe(base.c.inboxFiles['Mulch notice.txt']);
    expect(undone.after[NOTICE]).toBeUndefined();
    expect(JSON.parse(undone.after['.bower/changes/archive/undo-file.json'] ?? 'null')).toMatchObject({ undoes: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  // TL-P4-49 Q3 and TL-P4-50 Q1: a settled B7 tag addition logs as one decision line (the four lines B7 R1 moved here).
  it('AC9 b8-b7-addition-logs-decision', async () => {
    const base = await setup();
    const r = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([filing({ newTags: ['rainwater'] })]), around: base.around, pacing }, 1);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.after['.bower/tags.json'] ?? '{"tags":[]}')).toMatchObject({ tags: ['rainwater'] });
    const log = r.after[MONTH] ?? '';
    expect(log).toMatch(/decision.*rainwater.* · op:[a-f0-9]{12}/);
    const later = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([empty]), around: base.around, pacing,
      request: { kind: 'tidy', text: 'Tidy again.' } }, 2);
    expect(later.after[MONTH]?.split('\n').filter((line) => /decision.*rainwater/.test(line))).toHaveLength(1);
    const replay = await redispatchCase(base.c, r, 2, { claude: async () => { throw new Error('Replay must not model.'); }, around: base.around, pacing });
    expect((replay.after[MONTH] ?? '').split('\n').filter((line) => /decision.*rainwater/.test(line))).toHaveLength(1);
  });
  it('AC9 b8-b7-additions-one-decision-per-write', async () => {
    const base = await setup('settled-recovery', { '.bower/tags.json': '{"v":1,"tags":["gardening"]}\n' });
    const r = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([filing({ newTags: ['gardening', 'rainwater', 'compost'] })]), around: base.around, pacing }, 1);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.after['.bower/tags.json'] ?? '{"tags":[]}')).toMatchObject({ tags: ['gardening', 'rainwater', 'compost'] });
    const decisions = events(r).filter((line) => line.split(' | ')[1] === 'decision');
    expect(decisions, 'one decision event for the one vocabulary write').toHaveLength(1);
    expect(decisions[0]).toMatch(/rainwater/);
    expect(decisions[0]).toMatch(/compost/);
    expect(decisions[0]?.split(' | ').slice(2).join(' | ')).not.toMatch(/gardening/);
    const m = manifest(r);
    const write = m.operations.find((op) => op.effect.kind === 'write-runner-json' && String(op.effect.path) === '.bower/tags.json');
    expect(decisions[0]?.slice(-12)).toBe(opKey(base.root, m.runId, write?.operationId ?? ''));
  });
  it('AC9 control: the B7 addition settles through main as a vocabulary write', async () => {
    const base = await setup();
    const r = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([filing({ newTags: ['rainwater'] })]), around: base.around, pacing }, 1);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.after['.bower/tags.json'] ?? '{"tags":[]}')).toMatchObject({ tags: ['rainwater'] });
    expect(r.after[NOTICE]).toMatch(/rainwater/);
  });
  it('corpus-fix-b8 AC1: monthly encoding uses minimal delimiter-rich evidence', async () => {
    const c = await fixture('bounded-encoding');
    expect(Object.keys(c.folder).filter((path) => path.startsWith('.bower/log')), 'one seeded month and no annual log').toEqual([MONTH]);
    expect(c.folder[MONTH]).toBe(SEED);
    const run = await runScripted(c);
    expect(run.code).toBe(0);
    expect(scoreCase(c, run).unmet, 'bounded-encoding meets its expectations').toEqual([]);
    const text = run.after[MONTH] ?? '';
    expect(text.startsWith(SEED), 'every seeded byte is kept').toBe(true);
    const m = manifest(run);
    const keys = m.operations.filter((op) => op.effect.kind === 'move' && op.effect.before.name === 'Options | alternatives.txt'
      || op.effect.kind === 'create-text' && op.effect.purpose === 'generated' && op.effect.name === 'Mulch options.md')
      .map((op) => opKey(run.root, m.runId, op.operationId));
    expect(keys).toHaveLength(2);
    expect(text.slice(SEED.length).split('\n').filter(Boolean).map((line) => line.split(' | ')), 'the ingest, then the create: four readable fields each').toEqual([
      ['2026-10-07', 'ingest', 'Resources/Gardening/Mulch options.txt', `From the inbox: Options / alternatives.txt · op:${keys[0] ?? ''}`],
      ['2026-10-07', 'create', 'Resources/Gardening/Mulch options.md', `Alex compared mulch options. · op:${keys[1] ?? ''}`],
    ]);
    expect(readLog(text).keys, 'the seeded key, then this run\'s keys').toEqual(['0123456789ab', ...keys]);
    expect(Object.keys(run.after).filter((path) => path.startsWith('.bower/log')), 'no annual log and no other month').toEqual([MONTH]);
  });
});
