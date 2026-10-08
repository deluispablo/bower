/**
 * The runner's operations, a batch at a time between two checkpoints in `.bower/runs/<run_id>/` (TL-P3-21 points 2
 * and 3; TL-P4-05), over the shared run records (`src/data/spine/records.ts`) and the adapter's fenced writes. It is
 * a write-ahead log with redo by inspection, as in ARIES and SQLite's WAL: the intent is stable before any effect,
 * and recovery redoes only what the stored state shows not done.
 *
 * - A new run writes its manifest record and its first checkpoint before any operation. Right before the first
 *   send, one opening checkpoint names every operation still to go as possibly sent (`possible-effect`).
 * - The effects then run in plan order, each through the fenced writes and with the run's stamp (`effects.ts`). An
 *   operation refused before its send, or waiting on one that did not happen, is rejected.
 * - One closing checkpoint settles them all, with "effects done, report pending"; the barrier (`barrier.ts`) ends
 *   the run. So a run writes four checkpoints, however many operations it has.
 * - A restarted runner, or a new attempt, reads only its run's folder, verifies the chain and goes on from its last
 *   checkpoint; it never plans again. A broken or unverifiable chain stops the run as failed with nothing written.
 * - An operation recorded as applied or rejected is never sent again. One named by a batch an earlier runner opened
 *   is read back first, by its stamp (TL-P3-23, TL-P4-05 addendum): landed, it is applied on that evidence and never
 *   sent again; not landed, it is sent once if its checks still pass, under this attempt's fence; unreadable, the run
 *   stops there without a send, since sending it again could apply it twice.
 */
import { BowerError } from '../../../src/data/types';
import type { FencedDrive } from '../../../src/data/drive/fake-drive';
import type { Checkpoint, EffectEvidence, Failure, Outcome } from '../../../src/data/contracts/run-checkpoint';
import { parseRunManifestV2, type OperationV2 } from '../../../src/data/contracts/run-manifest';
import { canonical, checkpointName, firstCheckpoint, manifestName, nextCheckpoint, type AttemptMark, type CheckpointPatch, type RunManifest, type RunRecords } from '../../../src/data/spine/records';
import { materialize } from '../../../src/data/spine/report';
import { takeAdmitted, type Admitted, type AdmittedReader } from './admitted';
import type { RunnerToken } from '../token';

/**
 * How one operation ended once sent: `rejected` only when its precondition refused it before anything was sent, or
 * when a send whose answer was lost reads back as not landed (the folder still as the plan saw it).
 */
export type Settled = { state: 'applied'; evidence: EffectEvidence } | { state: 'rejected'; failure: Failure };

/**
 * What reading an operation back says of a send whose answer was never kept (as the adapter's lost-reply read-back
 * does): it landed (with its stored evidence), it did not (the folder still shows what the plan saw), or neither can
 * be told (a read failed, or the folder shows something else).
 */
export type ReadBack = { state: 'landed'; evidence: EffectEvidence } | { state: 'not-landed' } | { state: 'unreadable'; why: string };

/** The effects of operations on the folder: the adapter's sends and evidence reads. */
export interface Effects {
  /**
   * Sends the operation once through these fenced writes; `manifest` is the run's, for what the operation relies on.
   * `sending` is awaited right before the send is attempted, after every read that may refuse it; an operation that
   * settles without it was refused before anything was sent.
   */
  apply(op: OperationV2, head: Checkpoint, w: FencedDrive, manifest: RunManifest, sending: () => Promise<void>): Promise<Settled>;
  /** Stored evidence that the operation's effect landed; null when none is found. */
  observe(op: OperationV2, head: Checkpoint): Promise<EffectEvidence | null>;
  /** An operation possibly sent by an earlier runner, read back: landed, not landed, or unreadable. */
  readBack(op: OperationV2, head: Checkpoint, manifest: RunManifest): Promise<ReadBack>;
}

export interface SpineRun {
  rootId: string;
  runId: string;
  /** This runner's attempt, from its dispatch; it is the epoch of the checkpoints it writes. */
  attempt: number;
  records: RunRecords;
  /** The fenced writes of the next batch (the adapter's `batch()`, which checks the attempt first). */
  batch(): Promise<FencedDrive>;
  /**
   * The fenced writes with no attempt read of their own, for a checkpoint: it is a write, and the adapter reads the
   * attempt right before every write anyway, so a batch read just before it only repeats that one. Without it, `batch`.
   */
  fenced?(): FencedDrive;
  effects: Effects;
  /** The run's manifest; asked only when its folder holds none (see `admittedPlan`). */
  plan(): Promise<RunManifest>;
  clock(): number;
  newId(): string;
  /**
   * Sees the chain once it is read (empty for a run whose folder holds none yet), then each time it grows; the runner
   * keeps it, to say truthfully how a run that stops ended. Not called when the folder cannot be read.
   */
  onChain?(chain: Checkpoint[]): void;
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
    run.onChain?.(chain);
  } else {
    run.onChain?.([]);
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
    run.onChain?.(chain);
  }
  if (ended(head)) return { state: 'settled', chain, manifest, manifestHash };

  let at: Checkpoint = head;
  let atHash: string = headHash;
  const commit = async (patch: CheckpointPatch): Promise<void> => {
    const next = nextCheckpoint(at, atHash, mark, patch);
    const c = await canonical(next);
    await run.records.putNew(run.fenced?.() ?? (await run.batch()), where, checkpointName(next.revision, c.hash), c.text);
    at = next;
    atHash = c.hash;
    chain = [...chain, next];
    run.onChain?.(chain);
  };

  // The batch is settled in memory, in plan order; the chain changes only at its opening and its closing.
  let outcomes = [...at.outcomes];
  const working = (): Checkpoint => ({ ...at, outcomes });
  const settle = (outcome: Outcome): void => {
    outcomes = outcomes.map((o) => (o.operationId === outcome.operationId ? outcome : o));
  };
  const unnamed = (o: Outcome | undefined): boolean => o?.state === 'not-dispatched' || o?.state === 'before-effect-refused';
  const inChain = (id: string): Outcome | undefined => at.outcomes.find((o) => o.operationId === id);
  /**
   * What the chain may say now of what is settled in memory: a refusal of an operation the chain has never named is
   * written as refused before its effect (it becomes rejected only after that, as the record's transitions require).
   */
  const writable = (o: Outcome): Outcome =>
    o.state === 'rejected' && inChain(o.operationId)?.state === 'not-dispatched' ? { operationId: o.operationId, state: 'before-effect-refused', failure: o.failure } : o;
  // Named by the opening this runner wrote: never sent by an earlier runner, so never read back first.
  const fresh = new Set<string>();
  /**
   * The opening, right before the first send of an operation the chain has not named: every operation still to go is
   * named as possibly sent, in one checkpoint, before any of them is. A run that sends nothing writes none, so a
   * check that cannot read before the first send never counts as a change.
   */
  const opening = async (): Promise<void> => {
    const named = outcomes.map((o): Outcome => {
      if (!unnamed(o)) return writable(o);
      fresh.add(o.operationId);
      return { operationId: o.operationId, state: 'possible-effect', dispatchId: run.newId() };
    });
    await commit({ phase: 'saving', phaseAt: run.clock(), outcomes: named });
    outcomes = outcomes.map((o) => (unnamed(o) ? (named.find((n) => n.operationId === o.operationId) ?? o) : o));
  };

  for (const op of manifest.operations) {
    const operationId = op.operationId;
    const outcome = outcomes.find((o) => o.operationId === operationId);
    if (!outcome || outcome.state === 'applied' || outcome.state === 'rejected') continue;
    // What it depends on must have happened; otherwise it was never sent, and is refused.
    if (op.dependsOn.some((id) => outcomes.find((o) => o.operationId === id)?.state !== 'applied')) {
      settle({ operationId, state: 'rejected', failure: STAYED });
      continue;
    }
    if (outcome.state === 'possible-effect' && !fresh.has(operationId)) {
      // Named by an earlier runner's batch: read back by its stamp before anything else, never sent again blindly.
      const back = await run.effects.readBack(op, working(), manifest);
      if (back.state === 'landed') {
        settle({ operationId, state: 'applied', evidence: back.evidence });
        continue;
      }
      if (back.state === 'unreadable') {
        console.error(`Operation ${op.ordinal} of run ${run.runId} may have been sent and cannot be read back (${back.why}); it is not sent again`);
        throw new BowerError('unknown', UNRESOLVED);
      }
    }
    // Sent once, under this attempt's fence (the adapter reads the attempt again right before the write), and only
    // once the chain names it.
    let sent = false;
    const settled = await run.effects.apply(op, working(), run.fenced?.() ?? (await run.batch()), manifest, async () => {
      if (sent) return;
      if (unnamed(inChain(operationId))) await opening();
      sent = true;
    });
    if (settled.state === 'applied' && !sent) {
      console.error(`Operation ${op.ordinal} of run ${run.runId} shows applied with no send attempted`);
      throw new BowerError('unknown', UNRESOLVED);
    }
    settle(settled.state === 'applied' ? { operationId, state: 'applied', evidence: settled.evidence } : { operationId, state: 'rejected', failure: settled.failure });
  }

  // Refusals of operations the chain never named (nothing at all was sent): written as such first.
  if (outcomes.some((o) => writable(o) !== o)) await commit({ phase: 'saving', phaseAt: run.clock(), outcomes: outcomes.map(writable) });
  // The closing checkpoint: every operation settled, with "effects done, report pending" (the barrier's first step).
  if (at.report.state === 'not-ready') {
    const body = materialize(manifest, manifestHash, outcomes);
    if (!body) {
      console.error(`Run ${run.runId} has an operation not settled at its closing checkpoint`);
      throw new BowerError('unknown', UNRESOLVED);
    }
    await commit({ outcomes, phase: 'saving', phaseAt: run.clock(), report: { state: 'pending', reportHash: (await canonical(body)).hash, body } });
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
