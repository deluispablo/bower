/**
 * The runner's report barrier (TL-P3-22 point 2; ARCHITECTURE invariant 6), after the last operation checkpoint:
 *
 * 1. The report, made from the fixed plan and the settled outcomes, is committed in the chain as pending: "effects
 *    done, report pending". From here a run that stops stays in `saving`, and a redispatch resumes here: every
 *    operation is settled, so no effect is applied again.
 * 2. The report record goes in the run's folder, read back, and each declared pile filed whole gets its consumed
 *    disposition in `.bower/piles`. Then `dispositions.json` in the run's folder: one line for every admitted item,
 *    journal lines included, filed, set aside or waiting (`itemDispositions`); one already there is left as it is.
 * 3. The report files, then `.bower/last-run.json` last, through the shared barrier (`src/data/spine/barrier.ts`),
 *    each read back by its checksum.
 * 4. Only then is the report published and the run done in the chain; the caller reports `done` after this.
 *
 * Every write is the same on a second try: a record already there with these bytes, or a file that already says
 * it, is not written again; the view's times come from the chain, so a redispatch writes the same view.
 */
import { BowerError } from '../../../src/data/types';
import type { FencedDrive } from '../../../src/data/drive/fake-drive';
import type { Checkpoint } from '../../../src/data/contracts/run-checkpoint';
import { fixedReport, jsonText, lastRunText, olderView, saveReport, type Checksum } from '../../../src/data/spine/barrier';
import type { AdmissionManifest } from '../../../src/data/spine/admission';
import { canonical, checkpointName, nextCheckpoint, reportName, type AttemptMark, type CheckpointPatch, type RecordReads, type RunManifest, type RunRecords } from '../../../src/data/spine/records';
import { dispositionsFor, itemDispositions, materialize, type ItemDisposition } from '../../../src/data/spine/report';

export interface BarrierRun {
  rootId: string;
  runId: string;
  attempt: number;
  records: RunRecords;
  /** Reads of `.bower` (the report files) and the run's records. */
  reads: RecordReads;
  checksum: Checksum;
  /** The fenced writes of the next batch (the adapter's `batch()`, which checks the attempt first). */
  batch(): Promise<FencedDrive>;
  /** What the run was admitted to take; null when the Worker kept none. */
  admission: AdmissionManifest | null;
  clock(): number;
  newId(): string;
  /** Called once "effects done, report pending" is in the chain, with it (the runner reports `saving` then). */
  onPending?(chain: Checkpoint[]): Promise<void>;
}

/** Where every admitted item ended, in the run's folder. */
export const DISPOSITIONS = 'dispositions.json';

/** `dispositions.json`: one line per admitted item. */
export interface DispositionsFile {
  v: 1;
  runId: string;
  items: ItemDisposition[];
}

export interface Finished {
  chain: Checkpoint[];
  /** The report files written, in order, `last-run.json` last. */
  written: string[];
  /** One for every admitted item; empty with no admission manifest. */
  dispositions: ItemDisposition[];
}

const UNRESOLVED = 'Bower could not check one of the things it moved. It will look again later.';
const SAVE_FAILED = 'Bower could not save what it did. Try again later.';

/** Ends a settled run: the report saved and read back, then done in the chain. Throws, leaving it in `saving`, when it cannot. */
export async function finishRun(run: BarrierRun, manifest: RunManifest, manifestHash: string, settled: Checkpoint[]): Promise<Finished> {
  let chain = settled;
  let at = chain.at(-1);
  if (!at) throw new BowerError('unknown', SAVE_FAILED);
  const where = { runId: run.runId };
  const mark: AttemptMark = { attemptId: run.newId(), epoch: run.attempt };
  const dispositions = (outcomes: Checkpoint['outcomes']): ItemDisposition[] => (run.admission ? itemDispositions(run.admission, manifest, outcomes) : []);
  if (at.phase === 'done') return { chain, written: [], dispositions: dispositions(at.outcomes) };
  if (at.phase === 'failed') throw new BowerError('unknown', SAVE_FAILED);

  const commit = async (patch: CheckpointPatch): Promise<Checkpoint> => {
    const head = chain.at(-1);
    if (!head) throw new BowerError('unknown', SAVE_FAILED);
    const next = nextCheckpoint(head, (await canonical(head)).hash, mark, patch);
    const c = await canonical(next);
    await run.records.putNew(await run.batch(), where, checkpointName(next.revision, c.hash), c.text);
    chain = [...chain, next];
    return next;
  };

  // 1. Effects done, report pending.
  if (at.report.state === 'not-ready') {
    const body = materialize(manifest, manifestHash, at.outcomes);
    if (!body) {
      console.error(`Run ${run.runId} has an operation not settled at its report`);
      throw new BowerError('unknown', UNRESOLVED);
    }
    at = await commit({ phase: 'saving', phaseAt: run.clock(), report: { state: 'pending', reportHash: (await canonical(body)).hash, body } });
  }
  const pending = chain.find((c) => c.report.state === 'pending');
  if (pending?.report.state !== 'pending') throw new BowerError('unknown', SAVE_FAILED);
  await run.onPending?.(chain);
  const body = pending.report.body;
  const r = await canonical(body);
  if (r.hash !== pending.report.reportHash) throw new BowerError('unknown', SAVE_FAILED);

  // 2. The report record, read back, and the consumed dispositions.
  await run.records.put(await run.batch(), where, reportName(r.hash), r.text);
  await run.records.report(manifest, manifestHash, r.hash);
  for (const d of dispositionsFor(manifest, at.outcomes, r.hash)) await run.records.putDisposition(await run.batch(), d);
  if ((await run.records.read(where, DISPOSITIONS)) === null) {
    const file: DispositionsFile = { v: 1, runId: run.runId, items: dispositions(at.outcomes) };
    // A fenced create, read back byte for byte; a reply lost after it landed is not a second file.
    await run.records.put(await run.batch(), where, DISPOSITIONS, jsonText(file));
  }

  // 3. The report files, then last-run.json last, each read back. The view's times are those of the pending report.
  const finishedAt = pending.phaseAt;
  const report = fixedReport(body.report);
  const view = lastRunText({
    v: 1,
    run: { id: manifest.runId, scope: manifest.runScope, phase: 'done', requestedAt: manifest.requestedAt, phaseAt: finishedAt, total: manifest.capture.members.length, finishedAt, report },
  });
  const written = await saveReport({
    rootId: run.rootId,
    reads: run.reads,
    checksum: run.checksum,
    batch: () => run.batch(),
    report,
    view,
    mayReplace: async (stored) => olderView(stored, { id: manifest.runId, requestedAt: manifest.requestedAt }),
  });

  // 4. Published and done, only now.
  at = await commit({ phase: 'done', phaseAt: finishedAt, report: { state: 'published', reportHash: r.hash } });
  return { chain, written, dispositions: dispositions(at.outcomes) };
}
