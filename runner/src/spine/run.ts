/**
 * The runner's operations, each behind a checkpoint in `.bower/runs/<run_id>/` (TL-P3-21 points 2 and 3), over
 * the shared run records (`src/data/spine/records.ts`) and the adapter's fenced writes.
 *
 * - A new run writes its manifest record and its first checkpoint before any operation.
 * - Each operation's intent (`possible-effect`) is committed before it is sent, and its outcome after; so a
 *   checkpoint follows every applied operation.
 * - A restarted runner, or a new attempt, reads only its run's folder, verifies the chain and goes on after the
 *   last checkpoint; it never plans again. A broken or unverifiable chain stops the run as failed with nothing
 *   written.
 * - An operation recorded as applied or rejected is never sent again. One recorded as possibly sent is applied
 *   only on evidence that it landed; with none, the run stops there, since real Drive gives no proof that a sent
 *   write did not land (TL-P2-16), and sending it again could apply it twice.
 *
 * A run here ends with every operation settled, in `saving`; the report barrier (`barrier.ts`) ends it.
 */
import { BowerError } from '../../../src/data/types';
import type { FencedDrive } from '../../../src/data/drive/fake-drive';
import type { Checkpoint, EffectEvidence, Failure, Outcome } from '../../../src/data/contracts/run-checkpoint';
import { parseRunManifestV2, type OperationV2 } from '../../../src/data/contracts/run-manifest';
import { canonical, checkpointName, firstCheckpoint, manifestName, nextCheckpoint, type AttemptMark, type CheckpointPatch, type RunManifest, type RunRecords } from '../../../src/data/spine/records';
import { takeAdmitted, type Admitted, type AdmittedReader } from './admitted';
import type { RunnerToken } from '../token';

/** How one operation ended once sent: `rejected` only when its precondition refused it before anything was sent. */
export type Settled = { state: 'applied'; evidence: EffectEvidence } | { state: 'rejected'; failure: Failure };

/** The effects of operations on the folder: the adapter's sends and evidence reads. */
export interface Effects {
  /** Sends the operation once through these fenced writes. */
  apply(op: OperationV2, head: Checkpoint, w: FencedDrive): Promise<Settled>;
  /** Stored evidence that the operation's effect landed; null when none is found. */
  observe(op: OperationV2, head: Checkpoint): Promise<EffectEvidence | null>;
}

export interface SpineRun {
  rootId: string;
  runId: string;
  /** This runner's attempt, from its dispatch; it is the epoch of the checkpoints it writes. */
  attempt: number;
  records: RunRecords;
  /** The fenced writes of the next batch (the adapter's `batch()`, which checks the attempt first). */
  batch(): Promise<FencedDrive>;
  effects: Effects;
  /** The run's manifest; asked only when its folder holds none (see `admittedPlan`). */
  plan(): Promise<RunManifest>;
  clock(): number;
  newId(): string;
}

/** Settled: every operation applied or rejected (or the run already ended), with its verified manifest. */
export type RunEnd = { state: 'settled'; chain: Checkpoint[]; manifest: RunManifest; manifestHash: string } | { state: 'failed'; why: string };

/** One sentence for a run that stopped on an operation it cannot tell was applied. */
const UNRESOLVED = 'Bower could not check one of the things it moved. It will look again later.';
/** Why an operation whose prerequisites did not all happen is not sent. */
const STAYED: Failure = { code: 'conflict', message: 'Some of its things stayed where they were, so it stays too.' };

const ended = (c: Checkpoint): boolean => c.phase === 'done' || c.phase === 'failed';

export async function runOperations(run: SpineRun): Promise<RunEnd> {
  const where = { runId: run.runId };
  const mark: AttemptMark = { attemptId: run.newId(), epoch: run.attempt };
  const found = await run.records.found(run.runId);
  if (found.kind === 'broken') return { state: 'failed', why: found.why };

  let manifest: RunManifest;
  let manifestHash: string;
  let chain: Checkpoint[];
  let headHash: string | null;
  if (found.kind === 'run') {
    ({ manifest, manifestHash, chain, head: headHash } = found);
  } else {
    manifest = await run.plan();
    const m = await canonical(manifest);
    const parsed = await parseRunManifestV2(m.bytes, run.rootId);
    if (!parsed.ok || manifest.runId !== run.runId) {
      const why = `The manifest planned for run ${run.runId} is refused (${parsed.ok ? 'another run' : parsed.reason})`;
      console.error(why);
      return { state: 'failed', why };
    }
    manifestHash = m.hash;
    await run.records.put(await run.batch(), where, manifestName(m.hash), m.text);
    chain = [];
    headHash = null;
  }

  let head = chain.at(-1);
  if (!head || headHash === null) {
    head = firstCheckpoint(manifest, manifestHash, mark, run.clock());
    const c = await canonical(head);
    await run.records.put(await run.batch(), where, checkpointName(0, c.hash), c.text);
    chain = [head];
    headHash = c.hash;
  }
  if (ended(head)) return { state: 'settled', chain, manifest, manifestHash };

  let at: Checkpoint = head;
  let atHash: string = headHash;
  const commit = async (patch: CheckpointPatch): Promise<void> => {
    const next = nextCheckpoint(at, atHash, mark, patch);
    const c = await canonical(next);
    await run.records.putNew(await run.batch(), where, checkpointName(next.revision, c.hash), c.text);
    at = next;
    atHash = c.hash;
    chain = [...chain, next];
  };
  const resolve = (op: OperationV2, outcome: Outcome): Promise<void> =>
    commit({ outcomes: at.outcomes.map((o) => (o.operationId === op.operationId ? outcome : o)) });

  if (at.phase !== 'saving') await commit({ phase: 'saving', phaseAt: run.clock() });
  for (const op of manifest.operations) {
    const operationId = op.operationId;
    const outcome = at.outcomes.find((o) => o.operationId === operationId);
    if (!outcome || outcome.state === 'applied' || outcome.state === 'rejected') continue;
    if (outcome.state === 'possible-effect') {
      // Possibly sent by an earlier runner: applied only on evidence, never sent again.
      const evidence = await run.effects.observe(op, at);
      if (!evidence) {
        console.error(`Operation ${op.ordinal} of run ${run.runId} may have been sent and shows no effect; it is not sent again`);
        throw new BowerError('unknown', UNRESOLVED);
      }
      await resolve(op, { operationId, state: 'applied', evidence });
      continue;
    }
    // What it depends on must have happened; otherwise it is refused before anything is sent.
    if (op.dependsOn.some((id) => at.outcomes.find((o) => o.operationId === id)?.state !== 'applied')) {
      if (outcome.state === 'not-dispatched') await resolve(op, { operationId, state: 'before-effect-refused', failure: STAYED });
      await resolve(op, { operationId, state: 'rejected', failure: STAYED });
      continue;
    }
    await resolve(op, { operationId, state: 'possible-effect', dispatchId: run.newId() });
    const settled = await run.effects.apply(op, at, await run.batch());
    await resolve(op, settled.state === 'applied'
      ? { operationId, state: 'applied', evidence: settled.evidence }
      : { operationId, state: 'rejected', failure: settled.failure });
  }
  return { state: 'settled', chain, manifest, manifestHash };
}

/**
 * The plan of a new run from what it was admitted to take (TL-P3-21 point 1): the token route's manifest, each
 * item read again (`takeAdmitted`), then planned by `plan`. Asked only for a run whose folder holds no manifest.
 */
export function admittedPlan(token: Pick<RunnerToken, 'grant'>, drive: AdmittedReader, plan: (taken: Admitted) => Promise<RunManifest>): () => Promise<RunManifest> {
  return async () => {
    const grant = await token.grant();
    if (!grant.manifest) {
      console.error('The token route gave no admission manifest for a new run');
      throw new BowerError('unknown', "Bower's server didn't say what to tidy. Try again.");
    }
    return plan(await takeAdmitted(grant.manifest, drive));
  };
}
