/**
 * The runner's entry: built to one ESM file (`dist/runner.mjs`). `runTidy` is one runner process for one attempt
 * of a run (TL-P3-22 point 2), in this order:
 *
 * 1. Token: the Worker's token route gives the Drive token, the folder and the admission manifest.
 * 2. Before any write, the folder is checked for this run's report (`last-run.json` showing it done): a run whose
 *    report already landed only reports `done`, so nothing is repeated (worker contract, "Runner wire").
 * 3. Spine: the operations, each behind a checkpoint (`spine/run.ts`); `writing` is reported first.
 * 4. Barrier: once every operation is settled, `saving` is reported, then the report is saved and read back
 *    (`spine/barrier.ts`). A report that cannot be saved leaves the run in `saving`, with "effects done, report
 *    pending" in its chain, for a redispatch to finish; past the recovery ceiling the Worker ends it saying the
 *    changes were made and the summary was not saved.
 * 5. Status: `done`, only after the barrier.
 *
 * The provider (what the run plans from what it took) and the effects (how an operation reaches Drive) are handed
 * in: the scripted provider and the Drive effects come with their own entries.
 */
import { createHash } from 'node:crypto';
import { RunRecords, type RunManifest } from '../../src/data/spine/records';
import type { ItemDisposition } from '../../src/data/spine/report';
import { shownDone, type Checksum } from '../../src/data/spine/barrier';
import { RunnerDrive } from './drive';
import { RunnerStatus } from './status';
import { RunnerToken } from './token';
import { admittedPlan, runOperations, type Effects } from './spine/run';
import type { Admitted } from './spine/admitted';
import { finishRun } from './spine/barrier';
import { runnerReads } from './spine/records';

export { RunnerDrive, type RunnerDriveOptions } from './drive';
export { RunnerToken, isStaleAttempt, type RunnerTokenOptions, type TokenGrant } from './token';
export { RunnerStatus, type RunnerStatusOptions } from './status';

export interface TidyOptions {
  /** The Worker's origin. */
  api: string;
  runId: string;
  ticket: string;
  /** This runner's attempt, from its dispatch. */
  attempt: number;
  fetch?: typeof fetch;
  /** Plans a new run from what it took (the scripted provider; a stub in tests). */
  provider(taken: Admitted): Promise<RunManifest>;
  /** How operations reach Drive through this runner's adapter. */
  effects(drive: RunnerDrive): Effects;
  clock?: () => number;
  newId?: () => string;
  /** Sees the adapter before the run starts (tests set its fault hook). */
  onDrive?: (drive: RunnerDrive) => void;
}

export type TidyEnd =
  | { phase: 'done'; dispositions: ItemDisposition[] }
  | { phase: 'saving'; why: string }
  | { phase: 'failed'; why: string };

/** What a run whose chain cannot be verified says: it is not touched again. */
const UNREADABLE = 'Bower could not read what it did. Try again later.';

/** Drive's `md5Checksum`: the MD5 of the stored bytes, hex. */
const md5 = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex');

export async function runTidy(opts: TidyOptions): Promise<TidyEnd> {
  const fetchFn = opts.fetch;
  const clock = opts.clock ?? Date.now;
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const token = new RunnerToken({ api: opts.api, runId: opts.runId, ticket: opts.ticket, ...(fetchFn ? { fetch: fetchFn } : {}) });
  const status = new RunnerStatus({ api: opts.api, runId: opts.runId, ticket: opts.ticket, attempt: opts.attempt, ...(fetchFn ? { fetch: fetchFn } : {}) });

  // 1. Token.
  const grant = await token.grant();
  const rootId = grant.folderId;
  const drive = new RunnerDrive({ token, attempt: opts.attempt, ...(fetchFn ? { fetch: fetchFn } : {}) });
  opts.onDrive?.(drive);
  const reads = runnerReads(drive, opts.runId);
  const records = new RunRecords(reads, rootId);
  const checksum: Checksum = { stored: (id) => drive.md5(id), of: async (bytes) => md5(bytes) };

  // 2. This run's report already in the folder: nothing to repeat.
  if (await shownDone(reads, rootId, opts.runId)) {
    await status.post('done');
    return { phase: 'done', dispositions: [] };
  }

  // 3. Spine.
  await status.post('writing');
  const end = await runOperations({
    rootId,
    runId: opts.runId,
    attempt: opts.attempt,
    records,
    batch: () => drive.batch(),
    effects: opts.effects(drive),
    plan: admittedPlan(token, drive, opts.provider),
    clock,
    newId,
  });
  if (end.state === 'failed') {
    console.error(end.why);
    await status.post('failed', { failure: UNREADABLE });
    return { phase: 'failed', why: end.why };
  }

  // 4. Barrier: every effect settled, the report pending.
  await status.post('saving', { total: end.manifest.capture.members.length });
  let finished;
  try {
    finished = await finishRun(
      { rootId, runId: opts.runId, attempt: opts.attempt, records, reads, checksum, batch: () => drive.batch(), admission: grant.manifest, clock, newId },
      end.manifest,
      end.manifestHash,
      end.chain,
    );
  } catch (e) {
    console.error(e);
    return { phase: 'saving', why: e instanceof Error ? e.message : String(e) };
  }

  // 5. Status, only after the report is read back.
  await status.post('done');
  return { phase: 'done', dispositions: finished.dispositions };
}

/** The process's entry (stub). */
export async function main(_env: Readonly<Record<string, string | undefined>>, _opts: { fetch?: typeof fetch } = {}): Promise<number> {
  return 1;
}
