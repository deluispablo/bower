/** B8a reds through production main and the corpus driver: the monthly log (TL-P4-50 Q1-Q2), ported from b8-log a397198f. */
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { AT, caseReplies, redispatchCase, replySequence, runOnDrive, runScripted, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';
import { observe, writes, type Observation } from './b23-hot-observe';
import { opKey } from '../../src/data/contracts/op-key';
import type { ManifestV2 } from '../../src/data/contracts/run-manifest';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { hashRecordJson } from '../../src/data/contracts/record-json';
import { RUNNER_WRITES } from '../../src/data/vault/layout';

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
const filing = (extra: Record<string, unknown> = {}) => ({ ...empty, ...extra, things: [{ fileId: '$file:Mulch notice.txt',
  to: 'Resources/Gardening', name: 'Mulch notice.txt', note: { name: 'Mulch notice.md', summary: 'Mulch collection opens at the amber gate.',
    body: 'Alex can collect mulch from the amber gate at the Saltmere garden.\n\nRelated: [[Gardening]].',
    ...(extra.newTags ? { tags: extra.newTags } : {}) } }] });
async function setup(name = 'settled-recovery') {
  const c = await fixture(name);
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const traffic: Observation[] = [];
  return { c, drive, root, traffic, around: observe(drive, root, traffic) };
}
type Base = Awaited<ReturnType<typeof setup>>;
const blocked = (path: string, base: Base, status = 403) => (fetch: typeof globalThis.fetch) => {
  let seen = base.traffic.length;
  return observe(base.drive, base.root, base.traffic)(async (input, init = {}) => {
    const last = base.traffic.length > seen ? base.traffic.at(-1) : undefined;
    seen = base.traffic.length;
    if (last?.path === path && ['POST', 'PATCH'].includes(init.method ?? 'GET')) {
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
  base.c.scope = 'undo';
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
  it('AC5 control: root personal log bytes and the legacy log stay untouched', async () => {
    const c = await fixture('bounded-encoding');
    const personal = 'Alex keeps this personal log.\r\n';
    c.folder['log.md'] = personal;
    const run = await runScripted(c);
    expect(run.code).toBe(0);
    expect(run.after['log.md']).toBe(personal);
    expect(run.after['.bower/log.md']).toBe(c.folder['.bower/log.md']);
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
  it('AC6 control: all existing required targets settle', async () => {
    const base = await setup('report-only-grammar');
    const run = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([empty]), around: base.around, pacing }, 1);
    expect(run.code).toBe(0);
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(run.after['.bower/retrieval.json']).toBeDefined();
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
    expect(events(recovered)).toHaveLength(events(first).length);
    expect(new Set(events(recovered).map((line) => line.slice(-12))).size).toBe(events(recovered).length);
    expect(writes(base.traffic, MONTH)).toHaveLength(1);
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
    const inverses = events(undone).slice(prior.length);
    expect(inverses, 'the settled inverse appends its own event').not.toEqual([]);
    expect(inverses.some((line) => line.includes('Mulch notice'))).toBe(true);
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
  it('AC9 control: the B7 addition settles through main as a vocabulary write', async () => {
    const base = await setup();
    const r = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([filing({ newTags: ['rainwater'] })]), around: base.around, pacing }, 1);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.after['.bower/tags.json'] ?? '{"tags":[]}')).toMatchObject({ tags: ['rainwater'] });
    expect(r.after[NOTICE]).toMatch(/rainwater/);
  });
});
