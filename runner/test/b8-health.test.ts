/** B8b reds through production main and the corpus driver: lint and the health note (TL-P4-50 Q3-Q8), ported from b8-log a397198f. */
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import { AT, caseReplies, replySequence, runOnDrive, runScripted, runWithClaude, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';
import { observe, writes, type Observation } from './b23-hot-observe';
import type { ClaudeCall } from '../src/claude';

const HEALTH = 'Bower health.md';
const CHECKLIST = 'Resources/Gardening/Checklist.md';
const DIARY = 'Resources/Gardening/Plot diary.md';
const empty = { kind: 'tidy-intent', v: 1, things: [] };
const pacing = { sleep: async (): Promise<void> => undefined };
const fixture = (name: string) => loadCase(resolve(import.meta.dirname, '../../testing/corpus', `c17-b8-${name}`));
const report = (run: CaseRun) => (run.lastRun as { run?: { report?: { created: Array<{ path: string }>; updated: Array<{ path: string }> } } } | null)?.run?.report;
async function setup(name = 'report-only-grammar') {
  const c = await fixture(name);
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const traffic: Observation[] = [];
  return { c, drive, root, traffic, around: observe(drive, root, traffic) };
}
type Base = Awaited<ReturnType<typeof setup>>;
async function press(base: Base, n = 1) {
  return runOnDrive(base.c, base.drive, base.root, { claude: replySequence([empty]), around: base.around, pacing,
    ...(n > 1 ? { request: { kind: 'tidy' as const, text: 'Check my notes again.' } } : {}) }, n);
}
const blocked = (path: string, base: Base, status = 403) => (fetch: typeof globalThis.fetch) => {
  let seen = base.traffic.length;
  return observe(base.drive, base.root, base.traffic)(async (input, init = {}) => {
    const last = base.traffic.length > seen ? base.traffic.at(-1) : undefined;
    seen = base.traffic.length;
    if (last?.path === path && ['POST', 'PATCH'].includes(init.method ?? 'GET')) {
      return new Response(JSON.stringify({ error: { code: status, message: 'Made-up target refusal', errors: [{ reason: 'forbidden' }] } }), { status });
    }
    return fetch(input, init);
  });
};
const supportedEdit = (base: Base) => {
  const edit = base.c.presses?.[0]?.between?.find((step) => step.kind === 'edit');
  if (edit?.kind !== 'edit') throw new Error('Fixture needs a supported edit.');
  return edit;
};

describe('B8b lint and the health note through main', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AT);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('AC11 b8-lint-no-person-write', async () => {
    const c = await fixture('report-only-grammar');
    const run = await runScripted(c);
    for (const path of Object.keys(c.folder)) expect(run.after[path]).toBe(c.folder[path]);
    expect(run.after[HEALTH] ?? '', 'personal broken links and Bower-only checks are reported').toContain('Missing plan');
    expect(run.after[HEALTH]).not.toMatch(/Fence ghost|Tilde ghost|summary.*Plot diary|orphan.*Plot diary|tags?.*Plot diary/i);
    expect(run.after[HEALTH]).toContain('Loose thought');
    expect(run.after[HEALTH]).toMatch(/summary/i);
    expect(run.after[HEALTH]).toMatch(/tags?/i);
  });
  it('AC11 b8-lint-no-person-write: personal duplicate names are reported without adoption', async () => {
    const c = await fixture('report-only-grammar');
    const other = 'Areas/Plot diary.md';
    c.folder[other] = 'Alex keeps another personal diary.\r\n';
    const run = await runScripted(c);
    expect(run.after[other]).toBe(c.folder[other]);
    expect(run.props[other]?.by).toBeUndefined();
    expect(run.after[HEALTH] ?? '', 'raw duplicate personal names are the other allowed personal finding').toMatch(/duplicate/i);
    expect(run.after[HEALTH]).toContain('Plot diary');
  });
  it('AC11 control: lint does not install metadata or repair personal links', async () => {
    const c = await fixture('report-only-grammar');
    const run = await runScripted(c);
    expect(run.code).toBe(0);
    expect(run.after[DIARY]).toBe(c.folder[DIARY]);
    expect(run.after[DIARY]).toContain('[[Missing plan#Next|the plan]]');
    expect(run.props[DIARY]?.by).toBeUndefined();
  });

  it('AC12 b8-health-person-bytes-refused', async () => {
    const c = await fixture('report-only-grammar');
    const personal = '---\ncustom: Alex\n---\n\nAlex keeps a personal health diary.\r\n';
    c.folder[HEALTH] = personal;
    const drive = fixedDrive();
    const root = await seedCase(drive, c);
    const first = await runOnDrive(c, drive, root, { claude: replySequence([empty]), pacing }, 1);
    expect(first.after[HEALTH]).toBe(personal);
    const ownPath = 'Bower health (2).md';
    expect(first.after[ownPath] ?? '', 'a personal collision requires a next-free-name Bower note').toContain('by: bower');
    const healthId = Object.entries(first.pathsById).find(([, path]) => path === ownPath)?.[0];
    expect(healthId).toBeDefined();
    const saved = JSON.parse(first.after['.bower/retrieval.json'] ?? '{}') as unknown;
    const containsId = (node: unknown): boolean => node === healthId || !!node && typeof node === 'object' && Object.values(node).some(containsId);
    expect(containsId(saved), 'retrieval stores the actual health identity').toBe(true);
    // The person renames Bower's note and fixes their link: Bower follows its stored id, never a title.
    await drive.update(healthId ?? '', { name: 'Health renamed.md' });
    const diaryId = Object.entries(first.pathsById).find(([, path]) => path === DIARY)?.[0] ?? '';
    const diary = await drive.get(diaryId);
    await drive.writeText(diary.id, (c.folder[DIARY] ?? '').replace('[[Missing plan#Next|the plan]]', 'the plan'), diary.modifiedTime);
    const second = await runOnDrive(c, drive, root, { claude: replySequence([empty]), request: { kind: 'tidy' }, pacing }, 2);
    expect(second.after[HEALTH]).toBe(personal);
    expect(second.pathsById[healthId ?? '']).toBe('Health renamed.md');
    expect(second.after['Health renamed.md']).not.toContain('Missing plan');
    expect(second.after[ownPath]).toBeUndefined();
  });
  it('AC12 control: checking preserves every personal byte', async () => {
    const c = await fixture('report-only-grammar');
    c.folder[HEALTH] = 'Alex keeps a personal health diary.\r\n';
    const run = await runScripted(c);
    expect(run.code).toBe(0);
    for (const [path, text] of Object.entries(c.folder)) if (!c.bowerOwned.includes(path)) expect(run.after[path]).toBe(text);
    expect(run.props[HEALTH]?.by).toBeUndefined();
  });

  it('AC13 b8-health-real-report-row', async () => {
    const base = await setup();
    const run = await press(base);
    expect(run.code).toBe(0);
    expect(report(run)?.created.map((row) => row.path), 'confirmed health create survives last-run publication').toContain(HEALTH);
    expect(writes(base.traffic, HEALTH)).toHaveLength(1);
    expect(run.after[HEALTH]).toContain('by: bower');
  });
  it('AC13 control: refused health write cannot publish a success row', async () => {
    const base = await setup();
    const run = await runOnDrive(base.c, base.drive, base.root, { around: blocked(HEALTH, base), claude: replySequence([empty]), pacing }, 1);
    expect(report(run)?.created.some((row) => row.path === HEALTH) ?? false).toBe(false);
    expect(report(run)?.updated.some((row) => row.path === HEALTH) ?? false).toBe(false);
  });
  it('AC13 control: an existing companion row has an actual created destination', async () => {
    const run = await runScripted(await fixture('settled-recovery'));
    const path = report(run)?.created.find((row) => row.path === 'Resources/Gardening/Mulch notice.md')?.path;
    expect(path).toBeDefined();
    expect(run.after[path ?? '']).toBeDefined();
  });

  it('AC14 b8-partial-retrieval-not-completion', async () => {
    const base = await setup();
    const run = await runOnDrive(base.c, base.drive, base.root, { around: blocked(HEALTH, base), claude: replySequence([empty]), pacing }, 1);
    expect(writes(base.traffic, HEALTH), 'main must actually send the declared health note').not.toEqual([]);
    expect(run.wire?.statuses.some((status) => status.phase === 'done'), 'health has no proof, so main must remain unfinished').toBe(false);
    expect(run.code).not.toBe(0);
  });
  it('AC14 control: all existing required targets settle', async () => {
    const base = await setup();
    const run = await press(base);
    expect(run.code).toBe(0);
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(run.after['.bower/retrieval.json']).toBeDefined();
  });

  it('AC15 b8-fresh-person-edit', async () => {
    const c = await fixture('findings-refresh');
    const run = await runScripted(c);
    const [first, second] = run.runs ?? [];
    const edit = c.presses?.[0]?.between?.find((step) => step.kind === 'edit');
    if (edit?.kind !== 'edit') throw new Error('Fixture needs a supported edit.');
    expect(second?.after[CHECKLIST]).toBe(edit.text);
    expect(run.after[CHECKLIST]).toBe(edit.text);
    expect(first?.after[HEALTH] ?? '', 'first check observes the real broken link').toContain('Missing checklist');
    expect(second?.after[HEALTH]).toContain('No findings in the checked notes.');
    expect(second?.after[HEALTH]).not.toContain('Missing checklist');
    expect(report(second ?? run)?.updated.map((row) => row.path)).toContain(HEALTH);
    expect(report(run)?.created).toEqual([]);
    expect(report(run)?.updated).toEqual([]);
  });
  it('AC15 b8-no-stamp-only-write', async () => {
    const base = await setup('findings-refresh');
    const first = await press(base);
    const id = Object.entries(first.pathsById).find(([, path]) => path === CHECKLIST)?.[0] ?? '';
    const file = await base.drive.get(id);
    await base.drive.writeText(id, supportedEdit(base).text, file.modifiedTime);
    const second = await press(base, 2);
    const healthId = Object.entries(second.pathsById).find(([, path]) => path === HEALTH)?.[0];
    expect(healthId, 'changed findings create or update a real health note before the no-op check').toBeDefined();
    const before = await base.drive.get(healthId ?? '');
    base.traffic.length = 0;
    const third = await press(base, 3);
    expect(writes(base.traffic, HEALTH)).toEqual([]);
    expect((await base.drive.get(before.id)).modifiedTime).toBe(before.modifiedTime);
    expect(third.after[HEALTH]).toBe(second.after[HEALTH]);
    expect(report(third)?.created).toEqual([]);
    expect(report(third)?.updated).toEqual([]);
  });
  it('AC15 control: the full supported editor payload is preserved', async () => {
    const c = await fixture('findings-refresh');
    const run = await runScripted(c);
    const edit = c.presses?.[0]?.between?.find((step) => step.kind === 'edit');
    if (edit?.kind !== 'edit') throw new Error('Fixture needs a supported edit.');
    expect(run.after[CHECKLIST]).toBe(edit.text);
    expect(run.props[CHECKLIST]?.by).toBeUndefined();
  });
  it('AC15 control: an unchanged main run emits no derived update row', async () => {
    const base = await setup('findings-refresh');
    await press(base);
    const second = await press(base, 2);
    expect(report(second)?.updated).toEqual([]);
  });

  it('AC16 b8-incomplete-not-clean', async () => {
    const base = await setup();
    const around = (fetch: typeof globalThis.fetch) => {
      let seen = base.traffic.length;
      return observe(base.drive, base.root, base.traffic)(async (input, init = {}) => {
        const last = base.traffic.length > seen ? base.traffic.at(-1) : undefined;
        seen = base.traffic.length;
        if (last?.path === DIARY && last.media) {
          return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up unreadable evidence', errors: [{ reason: 'forbidden' }] } }), { status: 403 });
        }
        return fetch(input, init);
      });
    };
    const run = await runOnDrive(base.c, base.drive, base.root, { around, claude: replySequence([empty]), pacing }, 1);
    expect(run.after[HEALTH], 'incomplete evidence must have an honest coverage note').toBeDefined();
    expect(run.after[HEALTH]).not.toContain('No findings in the checked notes.');
    expect(run.after[HEALTH]).not.toMatch(/orphan/i);
    expect(run.after[HEALTH]).toMatch(/unchecked|not checked|could not (?:be )?check/i);
  });
  it('AC16 control: complete broken-link evidence is preserved for reporting', async () => {
    const c = await fixture('report-only-grammar');
    const run = await runScripted(c);
    expect(run.code).toBe(0);
    expect(run.after[DIARY]).toContain('[[Missing plan#Next|the plan]]');
  });

  it('AC17 b8-shared-budget-no-second-reads', async () => {
    const base = await setup('findings-refresh');
    const run = await press(base);
    const reads = base.traffic.filter((e) => e.media && e.method === 'GET' && e.path === CHECKLIST);
    expect(reads.length, 'one changed note version is read once through the shared cache').toBeLessThanOrEqual(1);
    expect(run.wire?.requests.length).toBeLessThanOrEqual(300);
    expect(run.after[HEALTH], 'budget measurement includes actual lint and health, not an absent feature').toBeDefined();
    base.traffic.length = 0;
    await press(base, 2);
    expect(base.traffic.filter((e) => e.media && e.path === CHECKLIST)).toEqual([]);
  });
  it('AC17 control: unchanged evidence adds no subject media read', async () => {
    const base = await setup('findings-refresh');
    await press(base);
    base.traffic.length = 0;
    await press(base, 2);
    expect(base.traffic.filter((e) => e.media && e.path === CHECKLIST)).toEqual([]);
  });
  it('AC17 b8-zero-lint-model-calls', async () => {
    const c = await fixture('report-only-grammar');
    const phases: string[] = [];
    const spawn = replySequence([empty]);
    const run = await runWithClaude(c, async (call: ClaudeCall) => {
      const context = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { selection?: unknown };
      phases.push(context.selection === undefined ? 'selection' : 'execution');
      return spawn(call);
    });
    expect(phases).toEqual(['selection', 'execution']);
    expect(run.after[HEALTH] ?? '', 'zero extra calls still perform script lint').toContain('Missing plan');
  });
  it('AC17 control: normal scripted planning has only selection and execution', async () => {
    let calls = 0;
    const spawn = replySequence([empty]);
    const run = await runWithClaude(await fixture('report-only-grammar'), async (call) => { calls++; return spawn(call); });
    expect(run.code).toBe(0);
    expect(calls).toBe(2);
  });

  it('AC18 b8-undo-rebuilds-health', async () => {
    const base = await setup('settled-recovery');
    const first = await runOnDrive(base.c, base.drive, base.root, { claude: caseReplies(base.c.id), around: base.around, pacing }, 1);
    expect(first.after[HEALTH] ?? '', 'the first run checks the filed companion').toContain('by: bower');
    const filed = 'Resources/Gardening/Mulch notice.txt';
    const id = Object.entries(first.pathsById).find(([, path]) => path === filed)?.[0] ?? '';
    const manifestText = Object.entries(first.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{"operations":[]}';
    const op = (JSON.parse(manifestText) as { operations: Array<{ operationId: string; effect: { kind: string; before?: { fileId: string } } }> })
      .operations.find((item) => item.effect.kind === 'move' && item.effect.before?.fileId === id)?.operationId;
    const files = await base.drive.listAll(base.root);
    const inbox = files.find((f) => f.folder && f.name === 'Inbox' && f.parents[0] === base.root);
    const changes = files.find((f) => base.drive.pathOf(f.id, base.root) === '.bower/changes');
    const source = await base.drive.get(id);
    await base.drive.update(id, { name: 'Mulch notice.txt', addParent: inbox?.id ?? '', removeParent: source.parents[0] });
    await base.drive.trash(Object.entries(first.pathsById).find(([, path]) => path === 'Resources/Gardening/Mulch notice.md')?.[0] ?? '');
    await base.drive.createText(changes?.id ?? '', 'undo-file.json', JSON.stringify({ v: 1, id: 'undo-file', device: 'device-1',
      at: AT + 1, kind: 'move', what: 'Put back Mulch notice.', undoes: op, fileId: id, path: 'Inbox/Mulch notice.txt', from: filed }));
    await base.drive.createText(changes?.id ?? '', 'undo-request.json', JSON.stringify({ v: 1, id: 'undo-request', device: 'device-1',
      at: AT + 1, kind: 'request', what: 'Undo the last tidy-up', text: 'Undo the last tidy-up' }));
    base.c.scope = 'undo';
    vi.setSystemTime(AT + 1);
    const undone = await runOnDrive(base.c, base.drive, base.root, { claude: replySequence([empty]), around: base.around, pacing,
      answerStart: { scope: 'instructions', requestId: 'undo-run' } }, 2);
    expect(undone.code).toBe(0);
    expect(undone.after[HEALTH] ?? '', 'health is rebuilt from the restored evidence').toContain('by: bower');
    expect(undone.after[HEALTH]).not.toContain('Mulch notice');
  });
  it('AC18 control: the filing that Undo reverses settles through main', async () => {
    const run = await runScripted(await fixture('settled-recovery'));
    expect(run.code).toBe(0);
    expect(run.after['Resources/Gardening/Mulch notice.md']).toBeDefined();
  });
});
