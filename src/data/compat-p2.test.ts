/** The accepted app's files read the same through today's shared core (P3-18). */
import { describe, expect, it } from 'vitest';
import { isJournalRecord } from './contracts/journal-record';
import { parsePileDeclaration } from './contracts/pile-declaration';
import { parsePileDisposition } from './contracts/pile-disposition';
import { parseRunReport } from './contracts/run-checkpoint';
import { P2_SOURCE, SHAPES, fixture, folderOf, missingFixtures, only, recordBytes, type Shape } from './compat-p2-fixtures';
import { RunRecords } from './spine/records';
import { SYSTEM, isRunnerFile } from './vault/layout';

const JOURNAL = SHAPES.filter((s) => s.startsWith('journal-'));
const RUNNER_FILES = { 'last-run': SYSTEM.lastRun, questions: SYSTEM.questions, suggestions: SYSTEM.suggestions, requests: SYSTEM.requests, hashes: SYSTEM.hashes } as const;

describe('the accepted app files, kept from the P2 freeze', () => {
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
    const records = new RunRecords({ listAll: async () => tree.files, readBytes: async (id) => new TextEncoder().encode(tree.text.get(id) ?? '') }, rootId);
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
});
