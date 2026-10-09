/**
 * Earlier finished runs of a folder, as the runner leaves them in `.bower/runs/<run_id>/`: a manifest, a chain of two
 * checkpoints, and the run folder stamped as ended (`bowerRun`, `bowerRunEnded`), as a run stamps it at done. Shared by
 * the retention tests (`barrier.test.ts`) and the C04 golden variant (`drive-calls-golden.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { hashRecordJson } from '../../src/data/contracts/record-json';
import type { DriveFile } from '../../src/data/drive/drive-api';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import { RunRecords, canonical, checkpointName, firstCheckpoint, manifestName, nextCheckpoint, type RunManifest } from '../../src/data/spine/records';
import { SYSTEM } from '../../src/data/vault/layout';

export const EARLIER_AT = Date.UTC(2026, 9, 7, 9);

/** A manifest the fake runner planned on the demo folder, kept as it was planned (`checkpoints.test.ts`). */
const PLANNED = readFileSync(new URL('./fixtures/planned-manifest.json', import.meta.url), 'utf8');

export async function hash(value: unknown): Promise<string> {
  const h = await hashRecordJson(value);
  if (!h.ok) throw new Error(h.reason);
  return h.value;
}

/** The planned manifest for another run of this folder: its capture id and operation ids made again, as the planner makes them. */
export async function planned(rootId: string, runId: string): Promise<RunManifest> {
  const value = JSON.parse(PLANNED) as RunManifest;
  value.runId = runId;
  value.requestId = `request-${runId}`;
  value.scope = { rootId };
  value.captureId = await hash({ scope: value.scope, runScope: value.runScope, capture: value.capture });
  const renamed = new Map<string, string>();
  const ref = (id: string): string => renamed.get(id) ?? id;
  for (const op of value.operations) {
    op.dependsOn = op.dependsOn.map(ref);
    if ('parent' in op.effect && 'createdBy' in op.effect.parent) op.effect.parent = { createdBy: ref(op.effect.parent.createdBy) };
    const next = await hash({ runId: value.runId, captureId: value.captureId, ordinal: op.ordinal, effect: op.effect });
    renamed.set(op.operationId, next);
    op.operationId = next;
  }
  for (const item of value.reportPlan) item.requires = item.requires.map(ref);
  return value;
}

/**
 * `count` earlier runs of the folder, each ended before this one, the first the oldest (`run-00`); gives their folders
 * by run id. Each folder carries the stamp a run puts on its folder at its end.
 */
export async function finishedBefore(drive: FakeDrive, root: string, count: number): Promise<Map<string, DriveFile>> {
  for (let i = 0; i < count; i++) await finished(drive, root, await planned(root, `run-${String(i).padStart(2, '0')}`), i);
  return runFolders(drive, root);
}

/** One earlier run of the folder with `manifest`, ended before this one: its manifest, two checkpoints, its folder stamped. */
async function finished(drive: FakeDrive, root: string, manifest: RunManifest, i: number): Promise<void> {
  const records = new RunRecords(drive, root);
  const w = drive.fenced(() => {});
  const m = await canonical(manifest);
  const where = { runId: manifest.runId };
  await records.put(w, where, manifestName(m.hash), m.text);
  const mark = { attemptId: `earlier-${i}`, epoch: 1 };
  const first = firstCheckpoint(manifest, m.hash, mark, EARLIER_AT - 2000 + i);
  const c0 = await canonical(first);
  await records.put(w, where, checkpointName(0, c0.hash), c0.text);
  const endedAt = EARLIER_AT - 1000 + i;
  const last = nextCheckpoint(first, c0.hash, mark, { phase: 'failed', phaseAt: endedAt });
  const c1 = await canonical(last);
  await records.putNew(w, where, checkpointName(1, c1.hash), c1.text);
  const folder = (await runFolders(drive, root)).get(manifest.runId);
  if (!folder) throw new Error(`no folder for ${manifest.runId}`);
  await drive.update(folder.id, { appProperties: { bowerRun: manifest.runId, bowerRunEnded: String(endedAt) } });
}

/**
 * An earlier run that wrote `lines` as the Current state of the note at `path` (by its file id): its manifest's one
 * state change, as the planner records it (`state-rewrite`, its `previous` and `lines`), so a later run reads there what
 * Bower last wrote. The rest of the manifest is the planned one's.
 */
export async function stateWrittenBefore(drive: FakeDrive, root: string, path: string, lines: string[]): Promise<void> {
  const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
  if (!file) throw new Error(`no ${path}`);
  const manifest = await planned(root, 'run-state');
  const text = await drive.readText(file.id);
  const content = { encoding: 'utf8' as const, size: new TextEncoder().encode(text).byteLength, sha256: '0'.repeat(64) };
  const effect = {
    kind: 'edit-text' as const, path, text,
    before: { fileId: file.id, name: file.name, parents: file.parents, folder: false, modifiedTime: file.modifiedTime },
    beforeContent: { ...content, provenance: 'fake-stored' as const, observedModifiedTime: file.modifiedTime },
    changes: [{ kind: 'state-rewrite' as const, recordIds: [], previous: [], lines }],
    content,
  };
  const ordinal = manifest.operations.length;
  const operations = [...manifest.operations, { operationId: await hash({ runId: manifest.runId, captureId: manifest.captureId, ordinal, effect }), ordinal, dependsOn: [], effect }];
  await finished(drive, root, { ...manifest, v: 2, operations } satisfies RunManifest, 9);
}

/** The folders in `.bower/runs` outside the Bin, by name. */
export async function runFolders(drive: FakeDrive, root: string): Promise<Map<string, DriveFile>> {
  const all = await drive.listAll(root);
  const sys = all.find((f) => f.folder && f.name === SYSTEM.dir && f.parents.includes(root));
  const runs = all.find((f) => f.folder && f.name === 'runs' && sys !== undefined && f.parents.includes(sys.id));
  if (!runs) throw new Error('no .bower/runs');
  return new Map(all.filter((f) => f.folder && f.parents.includes(runs.id)).map((f) => [f.name, f]));
}
