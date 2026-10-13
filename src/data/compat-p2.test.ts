/** The accepted app's files read the same through today's shared core (P3-18). */
import { describe, expect, it } from 'vitest';
import { isJournalRecord } from './contracts/journal-record';
import { parsePileDeclaration } from './contracts/pile-declaration';
import { parsePileDisposition } from './contracts/pile-disposition';
import { parseRunReport } from './contracts/run-checkpoint';
import { parseRules, serializeRules } from './contracts/rules-format';
import { P2_SOURCE, SHAPES, fixture, folderOf, missingFixtures, only, recordBytes, type Shape } from './compat-p2-fixtures';
import { FakeDrive } from './drive/fake-drive';
import { RunRecords } from './spine/records';
import type { Question } from './types';
import { DriveVault } from './vault/drive-vault';
import { SYSTEM, isRunnerFile } from './vault/layout';

const JOURNAL = SHAPES.filter((s) => s.startsWith('journal-'));
const RUNNER_FILES = { 'last-run': SYSTEM.lastRun, questions: SYSTEM.questions, suggestions: SYSTEM.suggestions, requests: SYSTEM.requests, hashes: SYSTEM.hashes } as const;

describe('the accepted app files, kept from the P2 freeze', () => {
  it.each([
    { label: 'legacy front-matter ownership', property: false, region: false },
    { label: 'Drive ownership property', property: true, region: false },
    { label: 'personal original bullets', property: false, region: false, personal: true },
    { label: 'region overrides legacy ownership', property: false, region: true },
    { label: 'region overrides Drive ownership', property: true, region: true },
  ])('R14 compatibility: $label', async ({ property, region, personal }) => {
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const rule = { id: 'rule-1', text: 'Keep receipts together.', yourWords: 'receipts together', since: Date.UTC(2026, 9, 13) };
    const managed = serializeRules([rule]);
    const prefix = property || personal ? managed.replace('by: bower\n', '') : managed;
    const added = '## Rules added in Bower\n<!-- bower:ownership/2 begin rules-added -->\n## Rules\n\n- Name scans by date. <!-- since 2026-10-13 -->\n  *You wrote: "scans by date"*\n<!-- bower:ownership/2 end rules-added -->\n';
    const contents = prefix + (region ? added : '');
    const file = await drive.createText(root, 'Rules.md', contents, property ? { by: 'bower' } : undefined);
    const before = await drive.get(file.id);
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    try {
      expect(await vault.rules()).toEqual(region
        ? [{ id: 'rule-1', text: 'Name scans by date.', yourWords: 'scans by date', since: rule.since }]
        : personal ? [] : parseRules(managed));
      expect(await drive.readText(file.id)).toBe(contents);
      expect(await drive.get(file.id)).toEqual(before);
    } finally {
      vault.dispose();
    }
  });

  it('has one fixture for every shape, each saying where it came from', () => {
    expect(missingFixtures()).toEqual([]);
    for (const shape of SHAPES) expect(fixture(shape).source, shape).toBe(P2_SOURCE);
  });

  it("the accepted app's files read the same in P3", async () => {
    expect(missingFixtures()).toEqual([]);
    // The runner's own files: the same fields, meant the same.
    for (const [shape, path] of Object.entries(RUNNER_FILES) as Array<[Shape & keyof typeof RUNNER_FILES, string]>) {
      const file = only(shape);
      expect(file.path, shape).toBe(path);
      expect(isRunnerFile(path as never, file.content), shape).toBe(true);
    }
    const lastRun = only('last-run').content as { run: { phase: string; report?: { filed: unknown[]; yourChanges?: number } } };
    expect(lastRun.run.phase).toBe('done');
    expect(lastRun.run.report?.filed.length).toBeGreaterThan(0);
    expect((only('requests').content as { done: Array<{ text: string; done?: string }> }).done[0]).toMatchObject({ text: 'Tidy my cooking notes', done: 'Done. See what changed in your folders.' });
    expect((only('questions').content as { questions: Array<{ yes: string; no: string }> }).questions[0]).toMatchObject({ yes: 'Yes, merge', no: 'No, keep both' });

    // Every journal line kind, field for field.
    const kinds = new Set<string>();
    for (const shape of JOURNAL) {
      const line = only(shape).content as { kind: string; v: number };
      expect(isJournalRecord(line), shape).toBe(true);
      kinds.add(line.kind);
    }
    expect([...kinds].sort()).toEqual(['answer', 'create', 'move', 'rename', 'request', 'rule', 'task', 'trash']);
    expect(only('journal-move').content).toMatchObject({ path: expect.any(String) as string, from: expect.any(String) as string, fileId: expect.any(String) as string });
    expect(only('journal-answer').content).toMatchObject({ questionId: 'q1', text: 'yes' });
    expect(only('journal-rule-removes').content).toMatchObject({ path: 'Rules.md', removes: expect.any(String) as string });

    // The run's records, by the shared reader: the run is found, its chain verifies, nothing is dropped.
    const manifestFile = only('run-manifest');
    const rootId = (manifestFile.content as { scope: { rootId: string } }).scope.rootId;
    const runId = (manifestFile.content as { runId: string }).runId;
    const tree = folderOf(rootId, ['run-manifest', 'run-checkpoint', 'run-report', 'pile-declaration', 'pile-disposition']);
    const records = new RunRecords({ listAll: async () => tree.files, readBytes: async (id) => new TextEncoder().encode(tree.text.get(id) ?? ''), get: async () => Promise.reject(new Error('no read by id here')) }, rootId);
    const found = await records.found(runId);
    expect(found.kind).toBe('run');
    if (found.kind !== 'run') return;
    expect(found.manifest).toEqual(manifestFile.content);
    expect(found.chain).toEqual(fixture('run-checkpoint').files.map((f) => f.content));
    expect(found.chain.at(-1)?.phase).toBe('done');
    expect(found.chain.at(-1)?.outcomes.every((o) => o.state === 'applied' || o.state === 'rejected')).toBe(true);

    const report = await parseRunReport(recordBytes(only('run-report').content), { rootId, runId, captureId: found.manifest.captureId, manifestHash: found.manifestHash });
    expect(report.ok).toBe(true);
    if (report.ok) expect(report.value).toEqual(only('run-report').content);

    // Pile records: the declaration as made, the disposition naming it.
    const declarations = new Map<string, string>();
    for (const file of fixture('pile-declaration').files) {
      const parsed = await parsePileDeclaration(recordBytes(file.content), rootId);
      expect(parsed.ok, file.path).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value).toEqual(file.content);
      expect(file.path).toBe(`.bower/piles/declaration-${parsed.value.declarationId}-${parsed.sha256}.json`);
      declarations.set(parsed.value.declarationId, parsed.sha256);
    }
    expect(declarations.size).toBeGreaterThan(0);
    for (const file of fixture('pile-disposition').files) {
      const parsed = await parsePileDisposition(recordBytes(file.content), rootId);
      expect(parsed.ok, file.path).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value).toEqual(file.content);
      expect(parsed.value.action).toBe('consumed');
      expect(parsed.value.declaration?.sha256).toBe(declarations.get(parsed.value.declaration?.declarationId ?? ''));
    }
  });

  it('an old run report with no answered field still reads', async () => {
    // TL-P4-19 addendum 10: `answered` is optional. The accepted app's report has none, and still reads...
    const record = only('run-report').content as { report: Record<string, unknown> };
    expect(Object.hasOwn(record.report, 'answered')).toBe(false);
    const lastRun = only('last-run').content as { run: { report: Record<string, unknown> } };
    expect(Object.hasOwn(lastRun.run.report, 'answered')).toBe(false);
    expect(isRunnerFile(SYSTEM.lastRun, lastRun)).toBe(true);
    // ...and a report that has one reads too, with the note that stays on a pair's row.
    const row = { questionId: 'q-pair-a.b', kind: 'pair', outcome: 'subject-gone', why: 'Not merged: the other note was already in the Bin.', note: 'Projects/Flat hunt/Flat 7, Cobble Row.md' };
    expect(isRunnerFile(SYSTEM.lastRun, { ...lastRun, run: { ...lastRun.run, report: { ...lastRun.run.report, answered: [row] } } })).toBe(true);
    expect(isRunnerFile(SYSTEM.lastRun, { ...lastRun, run: { ...lastRun.run, report: { ...lastRun.run.report, answered: [{ ...row, kind: 'folder' }] } } })).toBe(false);
    // The run's own report record, as the checkpoint reader reads it: without the field, and with it.
    const at = record as unknown as { runId: string; captureId: string; manifestHash: string; scope: { rootId: string } };
    const expected = { rootId: at.scope.rootId, runId: at.runId, captureId: at.captureId, manifestHash: at.manifestHash };
    expect((await parseRunReport(recordBytes(record), expected)).ok).toBe(true);
    expect((await parseRunReport(recordBytes({ ...record, report: { ...record.report, answered: [row] } }), expected)).ok).toBe(true);
    expect((await parseRunReport(recordBytes({ ...record, report: { ...record.report, answered: [{ ...row, outcome: '' }] } }), expected)).ok).toBe(false);
  });

  it('old questions without a subject still read', async () => {
    // The accepted app's questions (ids like `q1`, no subject) and an older ask that carries its thing in its id only.
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const inbox = await drive.createFolder(root, 'Inbox');
    const sys = await drive.createFolder(root, '.bower');
    const photo = await drive.createText(inbox.id, 'kitchen.txt', 'A kitchen photo.');
    const p2 = (only('questions').content as { questions: Question[] }).questions;
    const older = (id: string): Question => ({ id: `q-ask-${id}`, text: 'Is this from the viewing?', yes: 'Yes', no: 'No', askedAt: 2 });
    await drive.createText(sys.id, 'questions.json', JSON.stringify({ v: 1, questions: [...p2, older(photo.id), older('left-long-ago')] }));
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    // Every p2 question reads as it was written; the older ask stays while its thing is in the inbox, and closes once it left.
    expect(await vault.questions()).toEqual([...p2, older(photo.id)]);
  });
});
