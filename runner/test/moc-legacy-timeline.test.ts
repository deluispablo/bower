/**
 * moc-legacy-timeline (rulings R5): an older Bower map with a stored Timeline converts losslessly when maintain updates
 * its members, so the run ends done with its report (harness from audit-runner-maintain AC1).
 */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PILE_NOTE } from '../../src/data/piles';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { runOnDrive, seedCase } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const TOPIC = 'Resources/Paper craft';
const MAP = `${TOPIC}/Paper craft.md`;
const LINE = '- 2026-10-02 · Started the paper craft topic.';
// The older map's bytes as commit c180ddba seeded them (harness/corpus/c17-b56-clear-topic-templates).
const OLD_MAP = '---\nsummary: Reference notes about folded paper.\ntype: moc\nstatus: active\nby: bower\n---\n\n## Overview\n'
  + `Folded paper reference.\n\n## Notes\n\n## Sources\n\n## Timeline\n${LINE}\n`;
const CRANE = 'Crane folds.md';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('AC3 moc-legacy-timeline: filing into the older Paper craft map ends done; its Timeline moves unchanged into its frame', async () => {
  vi.setSystemTime(DAY);
  const c: LoadedCase = { id: 'moc-legacy-timeline', capability: 'C05', title: 'Alex keeps a paper craft topic', covers: 'model', source: 'new',
    scope: 'all', allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [],
    bowerOwned: [], inbox: [], inboxFiles: {}, folder: { [MAP]: OLD_MAP } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  const pile = await drive.createFolder(await id('Inbox'), 'Crane', { pile: 'crane-1' });
  await drive.createText(pile.id, PILE_NOTE, 'File this with my paper craft.\n');
  await drive.createText(pile.id, 'Crane.txt', 'A crane takes twenty folds from one square sheet.\n');
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => DAY + 1, newId: () => 'mlt-admission-1' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const topic = await id(TOPIC);
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, step) => {
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { sources?: Array<{ itemId: string }>;
      piles?: Array<{ things: Array<{ fileId: string }> }> };
    if (step === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: topic, wants: [] })), asks: [] });
    return reply({ kind: 'tidy-intent', v: 1, things: (frame.piles ?? []).flatMap((p) => p.things).map((t) => ({ fileId: t.fileId, to: TOPIC,
      name: 'Crane.txt', note: { name: CRANE, summary: 'A crane takes twenty folds from one square sheet.',
        body: 'A crane takes twenty folds from one square sheet.' } })) });
  }, () => ({ drive, root, admission: admission.manifest }), true);
  const run = await runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest,
    pacing: { baseMs: 0, sleep: async () => {} }, answerStart: { scope: 'all', requestId: 'mlt-run-1' } }, 1);

  expect(run.wire?.statuses.at(-1)?.phase, 'the run ends done, not stuck saving').toBe('done');
  expect(run.code).toBe(0);
  expect((run.lastRun as { run?: { report?: unknown } } | null)?.run?.report, 'the run keeps its report').toBeDefined();
  expect(run.after[`${TOPIC}/${CRANE}`], 'the new note was filed in the topic').toBeDefined();
  const text = run.after[MAP] ?? '';
  const bytes = new TextEncoder().encode(text);
  const own = parseOwnership(bytes);
  if (own.status !== 'v2') throw new Error(`The map was not converted: ${own.status}`);
  const region = (span: { start: number; end: number } | undefined) => new TextDecoder().decode(bytes.subarray(span?.start ?? 0, span?.end ?? 0));
  expect(region(own.payloads['moc-members']), 'the map lists the new note').toContain('[[Crane folds');
  expect(region(own.payloads.timeline), 'the Timeline moved unchanged').toBe(`## Timeline\n${LINE}\n`);
});
