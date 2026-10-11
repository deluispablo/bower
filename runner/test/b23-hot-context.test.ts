import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { askId } from '../../src/data/contracts/questions';
import { RUNNER_WRITES } from '../../src/data/vault/layout';
import * as hotModule from '../src/hot';
import { AT, caseReplies, replySequence, runScripted } from './corpus-run';
import { HOT, empty, manifests, observe, pacing, requiredFunction, runOnDrive, section, setup, writes,
  type Observation } from './b23-hot-observe';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AT);
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const noItems = (root: string, id: string): AdmissionManifest => ({
  v: 1, id, rootId: root, scope: 'all', at: Date.now(), piles: [], journal: [],
});
const renderHot = () => requiredFunction<typeof hotModule.renderHot>(hotModule, 'renderHot');

it('B3b hot: filing writes hot once and the next prompt puts it at position 6', async () => {
  const { c, drive, root } = await setup('b23-summary-person-lint');
  await drive.createText(root, 'Rules.md', '---\nsummary: Rules control.\n---\n# Rules\n- Keep gardening notes in Resources.\n');
  await drive.createText(root, 'About me.md', '# About me\nAlex keeps a quiet garden.\n');
  const events: Observation[] = [];
  const first = await runOnDrive(c, drive, root, { pacing, claude: caseReplies(c.id), around: observe(drive, root, events) }, 1);
  // Positive control: actual admitted source filing and the existing maintenance/barrier both ran.
  expect(first.code).toBe(0);
  expect(first.after['Resources/Gardening/Mulch notice.txt']).toBe(c.inboxFiles['Mulch notice.txt']);
  expect(writes(events, '.bower/retrieval.json')).toHaveLength(1);
  expect(writes(events, '.bower/last-run.json')).toHaveLength(1);
  expect.soft(writes(events, HOT), 'filing adds one real hot content send').toHaveLength(1);
  expect.soft(first.after[HOT] ?? '', 'filing persists hot').toContain('# Hot');
  expect.soft(section(first.after[HOT], 'Recent changes').join('\n')).toContain('Mulch notice');
  const manifest = JSON.parse(manifests(first)[0]?.[1] ?? '{}') as {
    operations: Array<{ operationId: string; effect: { kind: string; inputs?: { targets?: Array<{ path: string; fileId: string }> } } }>;
  };
  const maintain = manifest.operations.filter((op) => op.effect.kind === 'maintain');
  expect(maintain).toHaveLength(1);
  expect.soft(maintain[0]?.effect.inputs?.targets).toContainEqual(expect.objectContaining({ path: HOT, fileId: expect.any(String) }));
  expect(RUNNER_WRITES).toContain(HOT);
  expect.soft(writes(events, HOT)[0]?.stamp).toBe(writes(events, '.bower/retrieval.json')[0]?.stamp);
  expect.soft(events.findIndex((e) => e === writes(events, '.bower/last-run.json')[0])).toBeGreaterThan(
    events.findIndex((e) => e === writes(events, HOT)[0]));

  const inbox = (await drive.listAll(root)).find((f) => f.folder && f.name === 'Inbox');
  expect(inbox).toBeDefined();
  await drive.createText(inbox?.id ?? '', 'Next step.txt', 'Alex asks for the next garden step.', { pile: 'next-step', asAdded: 'Next step.txt' });
  const spawn = vi.fn(replySequence([{ ...empty, asks: [{ fileId: '$file:Next step.txt',
    text: 'Should this stay with the garden?', yes: 'Yes', no: 'No' }] }]));
  vi.setSystemTime(AT + 1);
  events.length = 0;
  const next = await runOnDrive(c, drive, root, { pacing, claude: spawn, around: observe(drive, root, events) }, 2);
  expect(next.code).toBe(0);
  expect(spawn).toHaveBeenCalled();
  const input = (spawn.mock.calls[0]?.[0].input ?? '').replace(/\\n/g, '\n');
  // Pin serialized prefix position by content, leaving the builder's wire shape to B1d.
  const beforeHot = [input.indexOf('Kinds of document'), input.indexOf('Rules control.'),
    input.indexOf('Alex keeps a quiet garden.'), input.indexOf('[[Mulch notice]]')];
  const atHot = input.indexOf('# Hot');
  expect.soft(atHot, 'next production prompt contains the persisted hot').toBeGreaterThanOrEqual(0);
  for (const at of beforeHot) {
    expect.soft(at, 'instructions/types, Rules, About me and index precede hot').toBeGreaterThanOrEqual(0);
    expect.soft(atHot, 'hot occupies prefix slot 6').toBeGreaterThan(at);
  }
  expect.soft(input.indexOf('Alex asks for the next garden step.'), 'request/items follow slot 6').toBeGreaterThan(atHot);
  if (first.after[HOT]) expect.soft(input).toContain(first.after[HOT]);
  const hotRead = events.findIndex((e) => e.path === HOT && e.method === 'GET' && e.media);
  expect.soft(hotRead, 'main reads persisted hot').toBeGreaterThanOrEqual(0);
  for (const path of ['Rules.md', 'About me.md']) {
    const semantic = events.findIndex((e) => e.path === path && e.method === 'GET' && e.media);
    expect.soft(semantic, 'hot is read before semantic context').toBeGreaterThan(hotRead);
  }
  expect.soft(events.filter((e) => e.path === HOT && e.method === 'GET' && e.media), 'one shared cached hot read').toHaveLength(1);
});

it('B3b fix 1: settled journal changes enter Recent changes on their own', async () => {
  const { c, drive, root } = await setup();
  const pending = (await drive.listAll(root)).find((file) => drive.pathOf(file.id, root) === '.bower/changes');
  expect(pending).toBeDefined();
  const second = { v: 1, id: 'change-2', device: 'device-1', at: AT - 59_999, kind: 'rule',
    what: 'Added a garden reminder.', text: 'Keep watering reminders with the garden notes.' };
  await drive.createText(pending?.id ?? '', 'change-2.json', `${JSON.stringify(second)}\n`);
  const events: Observation[] = [];
  const run = await runOnDrive(c, drive, root, { pacing, claude: replySequence([empty]),
    around: observe(drive, root, events) }, 1);
  // Controls: both primary changes really settled through main, independently of the report summary.
  expect(run.code).toBe(0);
  expect(run.after['Rules.md']).toContain('Keep gardening notes in Resources.');
  expect(run.after['Rules.md']).toContain(second.text);
  const primary = [
    { id: 'change-1', at: AT - 60_000, kind: 'rule', what: 'A rule', text: c.journal[0]?.text }, second,
  ];
  for (const record of primary) {
    expect(run.after[`.bower/changes/${record.id}.json`]).toBeUndefined();
    expect(JSON.parse(run.after[`.bower/changes/archive/${record.id}.json`] ?? 'null')).toMatchObject(record);
  }
  // TL-P4-42 addendum 5: hot uses captured primary bytes and settled outcomes, never archive media.
  expect(events.filter((event) => event.method === 'GET' && event.media
    && event.path.startsWith('.bower/changes/archive/'))).toEqual([]);
  expect(writes(events, HOT)).toHaveLength(1);
  const recent = section(run.after[HOT], 'Recent changes');
  // A "Rules updated." report row cannot satisfy either primary journal row.
  for (const record of primary) {
    expect.soft(recent).toContain(`- ${new Date(record.at).toISOString().slice(0, 10)} ${record.what}`);
  }
});

it('B3b hot: date-only refresh keeps the old bytes without another write', async () => {
  const { c, drive, root } = await setup();
  c.journal = [];
  const sys = (await drive.listAll(root)).find((f) => f.name === '.bower' && f.parents[0] === root);
  expect(sys).toBeDefined();
  await drive.createText(sys?.id ?? '', 'hot.md', '# Hot\n_Updated: 2026-10-06_\n## Open threads\n- Unsupported old thread\n## Current focus\n## Recent changes');
  const events: Observation[] = [];
  const first = await runOnDrive(c, drive, root, { admission: noItems(root, 'bootstrap'), pacing, around: observe(drive, root, events) }, 1);
  expect(first.code).toBe(0);
  expect(writes(events, '.bower/retrieval.json')).toHaveLength(1);
  expect.soft(writes(events, HOT), 'positive changed-content control rewrites hot').toHaveLength(1);
  const expected = renderHot()({ today: '2026-10-07', openQuestions: [], hubs: [], changes: [] }).text;
  expect.soft(first.after[HOT] ?? '', 'unsupported prior hot is rebuilt from empty primary evidence').toBe(expected);
  const fileId = Object.entries(first.pathsById).find(([, p]) => p === HOT)?.[0] ?? '';
  const version = (await drive.get(fileId)).modifiedTime;
  const plot = (await drive.listAll(root)).find((f) => f.name === 'Plot.md');
  expect(plot).toBeDefined();
  drive.touch(plot?.id ?? ''); // Visible feed change requires maintain, without changing its hot evidence.
  vi.setSystemTime(AT + 86_400_000);
  events.length = 0;
  const next = await runOnDrive(c, drive, root, { admission: noItems(root, 'tomorrow'), pacing, around: observe(drive, root, events),
    answerStart: { scope: 'all', requestId: 'tomorrow' } }, 2);
  expect(next.code).toBe(0);
  expect(writes(events, '.bower/retrieval.json')).toHaveLength(1);
  expect(writes(events, HOT)).toEqual([]);
  expect(next.after[HOT]).toBe(first.after[HOT]);
  expect((await drive.get(fileId)).modifiedTime).toBe(version);
  expect(renderHot()({ today: '2026-10-08', openQuestions: [], hubs: [], changes: [] }).text).not.toBe(expected);
});

it('B3b hot: hidden-only feed drains its cursor and leaves hot untouched', async () => {
  const { c, drive, root } = await setup();
  c.journal = [];
  const events: Observation[] = [];
  const first = await runOnDrive(c, drive, root, { admission: noItems(root, 'bootstrap'), pacing, around: observe(drive, root, events) }, 1);
  expect(first.code).toBe(0);
  expect(writes(events, '.bower/retrieval.json')).toHaveLength(1);
  expect.soft(writes(events, HOT), 'positive visible bootstrap creates hot').toHaveLength(1);
  const hidden = await drive.createFolder(root, '.obsidian');
  await drive.createText(hidden.id, 'workspace.json', '{"madeUp":true}');
  const prior = JSON.parse(first.after['.bower/retrieval.json'] ?? '{}') as { cursor: string };
  vi.setSystemTime(AT + 1);
  events.length = 0;
  const next = await runOnDrive(c, drive, root, { admission: noItems(root, 'hidden-feed'), pacing, around: observe(drive, root, events),
    answerStart: { scope: 'all', requestId: 'hidden-feed' } }, 2);
  expect(next.code).toBe(0);
  expect(next.wire?.requests.some((r) => r.url.pathname === '/drive/v3/changes')).toBe(true);
  expect((JSON.parse(next.after['.bower/retrieval.json'] ?? '{}') as { cursor: string }).cursor).not.toBe(prior.cursor);
  expect(writes(events, HOT)).toEqual([]);
  expect(next.after[HOT]).toBe(first.after[HOT]);
  expect(manifests(next).flatMap(([, text]) => (JSON.parse(text) as { operations: Array<{ effect: { kind: string } }> }).operations)
    .filter((op) => op.effect.kind === 'maintain')).toHaveLength(1); // Only bootstrap's maintain; cursor-only on press 2.
});

it('B3b hot: a Home answer removes only its settled Open thread', async () => {
  const { c } = await setup('b23-hot-question-answer');
  c.questions.push({ id: 'q-folder', text: 'Keep the garden notes together?', yes: 'Yes', no: 'No', askedAt: AT - 1 });
  const run = await runScripted(c);
  const first = run.runs?.[0];
  // Positive control: Home's real answer loop filed the letter and removed the authoritative question.
  expect(first?.code).toBe(0);
  expect(run.code).toBe(0);
  const firstQuestions = (JSON.parse(first?.after['.bower/questions.json'] ?? '{}') as { questions: Array<{ id: string }> }).questions;
  const letterId = Object.entries(first?.pathsById ?? {}).find(([, path]) => path === 'Inbox/Please file this letter./Letter.txt')?.[0];
  expect(letterId).toBeDefined();
  expect(firstQuestions.map((q) => q.id).sort()).toEqual([askId(letterId ?? ''), 'q-folder'].sort());
  expect(JSON.parse(run.after['.bower/questions.json'] ?? '{}') as unknown).toMatchObject({ questions: [expect.objectContaining({ id: 'q-folder' })] });
  expect(run.after['Projects/Flat hunt/Appointment letter.txt']).toBe(c.inboxFiles['Letter.txt']);
  const question = 'Is this appointment for the flat hunt?';
  expect.soft(section(first?.after[HOT], 'Open threads').join('\n')).toContain(question);
  expect.soft(run.after[HOT] ?? '').toContain('# Hot');
  expect(section(run.after[HOT], 'Open threads').join('\n')).not.toContain(question);
  expect.soft(section(first?.after[HOT], 'Open threads').join('\n')).toContain('Keep the garden notes together?');
  expect.soft(section(run.after[HOT], 'Open threads').join('\n')).toContain('Keep the garden notes together?');
  expect.soft(section(run.after[HOT], 'Recent changes').join('\n')).toContain('Appointment letter');
});

it.each(['unused-baseline.json', 'unused-production-baseline.json'])(
  'B3b hot: %s no longer exempts hot.ts', (name) => {
    const baseline = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../harness', name), 'utf8')) as {
      findings: string[]; reasons?: Record<string, string>;
    };
    const mentionsHot = (line: string): boolean => line.split(' ').includes('runner/src/hot.ts');
    expect(baseline.findings).toBeInstanceOf(Array);
    expect(mentionsHot('files runner/src/hot.ts runner/src/hot.ts'), 'positive detector control').toBe(true);
    expect(mentionsHot('files runner/src/index.ts runner/src/index.ts')).toBe(false);
    expect.soft(baseline.findings.filter(mentionsHot), 'remove the actual unused-file exemption').toEqual([]);
    expect(Object.keys(baseline.reasons ?? {}).filter(mentionsHot), 'remove its reason as well').toEqual([]);
  },
);
