import { describe, expect, it } from 'vitest';
import { P2_SOURCE, SHAPES, fixture, folderOf, missingFixtures, only, recordBytes } from '../../src/data/compat-p2-fixtures';
import { parsePileDeclaration } from '../../src/data/contracts/pile-declaration';
import { parsePileDisposition } from '../../src/data/contracts/pile-disposition';
import { parseRunReport } from '../../src/data/contracts/run-checkpoint';
import type { DriveFile } from '../../src/data/drive/drive-api';
import { RunRecords } from '../../src/data/spine/records';
import { runnerReads, type RunnerReads } from '../src/spine/records';
import { toBin } from '../src/spine/retention';

/** The accepted app's files, listed the way the runner's Drive adapter lists a folder. */
describe('the accepted app files, read by the runner', () => {
  it("the accepted app's files read the same in P3: the runner's readers", async () => {
    expect(missingFixtures()).toEqual([]);
    for (const shape of SHAPES) expect(fixture(shape).source, shape).toBe(P2_SOURCE);
    const manifestFile = only('run-manifest');
    const rootId = (manifestFile.content as { scope: { rootId: string } }).scope.rootId;
    const runId = (manifestFile.content as { runId: string }).runId;
    const tree = folderOf(rootId, ['run-manifest', 'run-checkpoint', 'run-report', 'pile-declaration', 'pile-disposition']);
    const root: DriveFile = { id: rootId, name: 'Bower', folder: true, parents: [], modifiedTime: '2026-10-07T09:00:00.000Z', createdTime: '2026-10-07T09:00:00.000Z' };
    const byId = new Map<string, DriveFile>([root, ...tree.files].map((f) => [f.id, f]));
    const drive: RunnerReads = {
      get: async (id) => {
        const f = byId.get(id);
        if (!f) throw new Error(`no ${id}`);
        return f;
      },
      list: async (parent) => tree.files.filter((f) => f.parents.includes(parent)),
      readText: async (id) => tree.text.get(id) ?? '',
    };
    // Its chain of records, found from the run's folder alone.
    const found = await new RunRecords(runnerReads(drive, runId), rootId).found(runId);
    expect(found.kind).toBe('run');
    if (found.kind !== 'run') return;
    expect(found.manifest).toEqual(manifestFile.content);
    expect(found.chain).toEqual(fixture('run-checkpoint').files.map((f) => f.content));
    expect(found.chain.at(-1)?.phase).toBe('done');
    // Its folder carries no ended stamp (it is from before it): never counted nor let go of by a later run.
    const runFolders = await new RunRecords(runnerReads(drive, runId), rootId).runFolders();
    expect(runFolders.map((f) => f.name)).toEqual([runId]);
    expect(toBin(runFolders, 'a-later-run', 0)).toEqual([]);

    const report = await parseRunReport(recordBytes(only('run-report').content), { rootId, runId, captureId: found.manifest.captureId, manifestHash: found.manifestHash });
    expect(report.ok && report.value).toEqual(only('run-report').content);

    // The pile records, read through the runner's listing of `.bower/piles`.
    const reads = runnerReads(drive);
    const listed = await reads.listAll(rootId);
    const pileFolder = listed.find((f) => f.folder && f.name === 'piles');
    const inPiles = listed.filter((f) => !f.folder && pileFolder && f.parents.includes(pileFolder.id));
    expect(inPiles.map((f) => f.name).sort()).toEqual(
      [...fixture('pile-declaration').files, ...fixture('pile-disposition').files].map((f) => f.path.split('/').pop() ?? '').sort(),
    );
    for (const file of inPiles) {
      const bytes = await reads.readBytes(file.id);
      const parsed = file.name.startsWith('declaration-') ? await parsePileDeclaration(bytes, rootId) : await parsePileDisposition(bytes, rootId);
      expect(parsed.ok, file.name).toBe(true);
    }
  });
});
