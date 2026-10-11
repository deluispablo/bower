/**
 * The one apply engine (TL-P4-14 `c2-one-engine`; ARCHITECTURE, mechanism map): a run's operations, a batch at a time
 * between two checkpoints in `.bower/runs/<run_id>/` (TL-P3-21 points 2 and 3; TL-P4-05), over the shared run records
 * (`records.ts`) and a Drive adapter (`RunDrive`, ports and adapters: the runner's `RunnerDrive` on Google Drive, the
 * fake's `FakeRunDrive` on the pretend one). The runner on GitHub Actions and the fake run service of the demo and
 * the e2e suites both run it, so both keep the same protocol. It is a write-ahead log with redo by inspection, as in
 * ARIES and SQLite's WAL: the intent is stable before any effect, and recovery redoes only what the stored state shows
 * not done.
 *
 * - A new run writes its manifest record and its first checkpoint before any operation. Right before the first
 *   send, one opening checkpoint names every operation still to go as possibly sent (`possible-effect`).
 * - The effects then run in plan order (`schedule.ts`), each through the adapter's fenced writes and with the run's
 *   stamp. An operation refused before its send, or waiting on one that did not happen, is rejected.
 * - One closing checkpoint settles them all, with "effects done, report pending"; the barrier ends the run.
 * - A restarted runner, or a new attempt, reads only its run's folder, verifies the chain and goes on from its last
 *   checkpoint; it never plans again. A broken or unverifiable chain stops the run as failed with nothing written.
 * - An operation recorded as applied or rejected is never sent again. One named by a batch an earlier attempt opened
 *   is read back first, by its reserved id or its stamp (TL-P3-23, TL-P4-05 addendum): landed, it is applied on that evidence and never
 *   sent again; not landed, it is sent once if its checks still pass, under this attempt's fence; unreadable, the run
 *   stops there without a send, since sending it again could apply it twice.
 *
 * Each operation (`driveEffects`):
 * - Before a write, what the operation depends on is read again: its source by the name and place the plan saw
 *   (`stillAsSeen`), a pile folder's children (nothing new arrived), a runner file's or a note's stored bytes and
 *   modifiedTime, a made file's place (nothing there by that name). A refusal here is an honest rejection: nothing
 *   was sent.
 * - The write goes through the adapter's fenced writes, which read the target (or a create's folder) again right
 *   before it and send it only for this attempt (a fencing token: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html);
 *   a content write carries the modifiedTime it read.
 * - After it, the answer to the write shows the effect (its metadata, its stamp and the stored bytes' checksum,
 *   `write-once.ts`), with no read after it. A write sent whose answer shows no effect stops the run unresolved; it is
 *   never sent again blindly (TL-P2-16).
 * - A write whose answer never came (a network error, or a 5xx) is read back (`reconcile`, TL-P3-28): a create by the
 *   id Drive reserved for it, which the opening names, any other write by the run's stamp it carries (`write-once.ts`).
 *   Landed, it counts as applied; not there, it settles rejected, in the words of an outcome Bower could not confirm
 *   (never offline: a run's network is not the person's); unreadable, the run stops unresolved.
 *
 * Drive v3 offers no compare-and-swap on files: these are prechecks with a short window, not a lock (ARCHITECTURE,
 * "Safety at the actual storage boundary").
 */
import type { OwnershipContext } from '../contracts/ownership-format';
import { BowerError } from '../types';
import { sha256Hex } from '../contracts/hashes';
import type { Checkpoint, EffectEvidence, Failure, Outcome } from '../contracts/run-checkpoint';
import { keepRefused, recheckEdit, savedLinkKey } from '../contracts/note-edit';
import { RUNNER_WRITES } from '../vault/layout';
import { parseRunManifestV2, requestMoveKind, type Effect as ManifestEffect, type OperationV2, type SeenFile } from '../contracts/run-manifest';
import { notAsSeen, notAsSeenReason, notRead } from '../contracts/still-as-seen';
import { UNCONFIRMED_WRITE_MESSAGE, type DriveFile, type FencedDrive, type RunDrive, type StoredEvidence } from '../drive/drive-api';
import { isNoAnswer, isUnconfirmedWrite } from '../drive/transport';
import { savedTwins } from './duplicates';
import { canonical, checkpointName, firstCheckpoint, manifestName, nextCheckpoint, type AttemptMark, type CheckpointPatch, type RunManifest, type RunRecords } from './records';
import { SOURCE_NOT_AS_SEEN, UNCONFIRMED_CHANGED, UNCONFIRMED_GONE, keptOther, materialize } from './report';
import { conflicts, needsOf } from './schedule';
import { STAMP, confirms, createById, happened, reserveId, stampOf } from './write-once';
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
/** `unconfirmed`: nothing Drive keeps tells whether it landed (`message` says why, on the report's own line). */
export type ReadBack = { state: 'landed'; evidence: EffectEvidence } | { state: 'not-landed' } | { state: 'unconfirmed'; message: string } | { state: 'unreadable'; why: string };

/** The effects of operations on the folder: the adapter's sends and evidence reads. */
export interface Effects {
  /**
   * Sends the operation once through these fenced writes; `manifest` is the run's, for what the operation relies on.
   * `sending` is awaited right before the send is attempted, after every read that may refuse it; an operation that
   * settles without it was refused before anything was sent. It gives the id reserved for a create, when the chain
   * names one.
   */
  apply(op: OperationV2, head: Checkpoint, w: FencedDrive, manifest: RunManifest, sending: () => Promise<string | null>): Promise<Settled>;
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
  /** How many independent operations may be in flight together (`schedule.ts`); one when not given. */
  concurrency?: number;
  /** The run's manifest; asked only when its folder holds none (see `admittedPlan`). */
  plan(): Promise<RunManifest>;
  clock(): number;
  newId(): string;
  /**
   * Sees the chain once it is read (empty for a run whose folder holds none yet), then each time it grows; the runner
   * keeps it, to say truthfully how a run that stops ended. Not called when the folder cannot be read.
   */
  onChain?(chain: Checkpoint[]): void;
  /** The validated durable plan, new or recovered, before any effect is attempted. */
  onPlan?(manifest: RunManifest): Promise<void>;
}

/** Settled: every operation applied or rejected (or the run already ended), with its verified manifest. */
export type RunEnd = { state: 'settled'; chain: Checkpoint[]; manifest: RunManifest; manifestHash: string } | { state: 'failed'; why: string };

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
    const parsed = await parseRunManifestV2(m.bytes, run.rootId, RUNNER_WRITES);
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

  await run.onPlan?.(manifest);

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
  const commit = async (patch: CheckpointPatch, writes?: FencedDrive): Promise<void> => {
    const next = nextCheckpoint(at, atHash, mark, patch);
    const c = await canonical(next);
    await run.records.putNew(writes ?? run.fenced?.() ?? (await run.batch()), where, checkpointName(next.revision, c.hash), c.text);
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
    // Each create still to go is named with an id Drive reserved for it, so a lost answer is read back by that id.
    const creates = manifest.operations.filter((o) => (o.effect.kind === 'create-folder' || o.effect.kind === 'create-text'
      || o.effect.kind === 'write-runner-json' && o.effect.before === null) && unnamed(outcomes.find((x) => x.operationId === o.operationId))).map((o) => o.operationId);
    const w = run.fenced?.() ?? (await run.batch());
    const ids = creates.length ? await w.generateIds(creates.length) : [];
    const named = outcomes.map((o): Outcome => {
      if (!unnamed(o)) return writable(o);
      fresh.add(o.operationId);
      const fileId = ids[creates.indexOf(o.operationId)];
      return { operationId: o.operationId, state: 'possible-effect', dispatchId: run.newId(), ...(fileId ? { fileId } : {}) };
    });
    await commit({ phase: 'saving', phaseAt: run.clock(), outcomes: named }, w);
    outcomes = outcomes.map((o) => (unnamed(o) ? (named.find((n) => n.operationId === o.operationId) ?? o) : o));
  };

  // The opening is written once, by whichever operation sends first; the others wait for it.
  let opened: Promise<void> | null = null;
  const openOnce = (): Promise<void> => (opened ??= opening());

  /** One operation, once what it depends on has applied. */
  const runOne = async (op: OperationV2): Promise<void> => {
    const operationId = op.operationId;
    const outcome = outcomes.find((o) => o.operationId === operationId);
    if (!outcome) return;
    if (outcome.state === 'possible-effect' && !fresh.has(operationId)) {
      // Named by an earlier runner's batch: read back by its stamp before anything else, never sent again blindly.
      const back = await run.effects.readBack(op, working(), manifest);
      if (back.state === 'landed') {
        settle({ operationId, state: 'applied', evidence: back.evidence });
        return;
      }
      if (back.state === 'unconfirmed') {
        settle({ operationId, state: 'rejected', failure: { code: 'unknown', message: back.message } });
        return;
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
      if (!sent && unnamed(inChain(operationId))) await openOnce();
      sent = true;
      return reservedIn(at, operationId);
    });
    if (settled.state === 'applied' && !sent) {
      console.error(`Operation ${op.ordinal} of run ${run.runId} shows applied with no send attempted`);
      throw new BowerError('unknown', UNRESOLVED);
    }
    settle(settled.state === 'applied' ? { operationId, state: 'applied', evidence: settled.evidence } : { operationId, state: 'rejected', failure: settled.failure });
  };

  // Operations that do not depend on each other run together, up to `POOL`, in plan order otherwise (`schedule.ts`).
  // The first failure stops anything new; those in flight finish, and the run stops there as it did one at a time.
  const stateOf = (id: string): Outcome['state'] | undefined => outcomes.find((o) => o.operationId === id)?.state;
  const done = (id: string): boolean => stateOf(id) === 'applied' || stateOf(id) === 'rejected';
  const flying = new Map<string, Promise<void>>();
  let stopped: { error: unknown } | null = null;
  const start = (op: OperationV2): void => {
    const p = runOne(op)
      .catch((error: unknown) => {
        // expected: the first failure is kept and rethrown once those in flight finish.
        stopped ??= { error };
      })
      .finally(() => flying.delete(op.operationId));
    flying.set(op.operationId, p);
  };
  for (;;) {
    const left = manifest.operations.filter((o) => !done(o.operationId) && stateOf(o.operationId) !== undefined);
    if (!left.length) break;
    let moved = false;
    if (!stopped) {
      // One named by an earlier runner's batch is read back before anything is sent, alone and in plan order, so a
      // run that cannot read one back stops there with nothing sent after it.
      const solo = (o: OperationV2): boolean => stateOf(o.operationId) === 'possible-effect' && !fresh.has(o.operationId);
      const before: OperationV2[] = [];
      for (const op of left) {
        const ahead = before.filter((b) => solo(op) || solo(b) || conflicts(b, op));
        before.push(op);
        if (flying.has(op.operationId) || ahead.length) continue;
        // What it depends on must have happened; otherwise it was never sent, and is refused.
        const needs = needsOf(op);
        if (needs.some((id) => !done(id) && manifest.operations.some((o) => o.operationId === id))) continue;
        const pending = requestMoveKind(manifest, op) === 'pending';
        const clashedAppend = (id: string): boolean => {
          const dependency = manifest.operations.find((o) => o.operationId === id);
          const outcome = outcomes.find((o) => o.operationId === id);
          return pending && op.effect.kind === 'move' && dependency?.effect.kind === 'edit-text'
            && outcome?.state === 'rejected' && outcome.failure.code === 'conflict'
            && dependency.effect.changes.some((c) => c.kind === 'timeline-append' && c.consent
              && manifest.capture.journal.some((j) => j.recordId === c.consent?.requestId && op.effect.kind === 'move'
                && j.fileIds.includes(op.effect.before.fileId)));
        };
        if (needs.some((id) => stateOf(id) !== 'applied' && !clashedAppend(id))) {
          settle({ operationId: op.operationId, state: 'rejected', failure: STAYED });
          moved = true;
          continue;
        }
        if (flying.size >= (run.concurrency ?? 1)) break;
        start(op);
        moved = true;
      }
    }
    if (flying.size) await Promise.race(flying.values());
    else if (!moved) {
      // Nothing can start: what is left waits on something that never happens (or the run has stopped), so it is refused.
      if (stopped) break;
      for (const op of left) settle({ operationId: op.operationId, state: 'rejected', failure: STAYED });
    }
  }
  if (stopped) throw (stopped as { error: unknown }).error;

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

/** The sentences for a refused operation. */
const NOT_AS_SEEN = SOURCE_NOT_AS_SEEN;
const NO_FOLDER = 'The folder for it could not be made.';
const NOTE_NOT_AS_SEEN = 'The note it goes beside is not where Bower left it.';
const NOTE_CHANGED = 'The note changed before Bower could add to it.';
const NOTE_THERE = 'A note with that name was already there, so Bower did not write it.';
const NAME_TAKEN = 'Something else has that name there, so Bower left it as it was.';
const ARRIVED = 'Something new arrived in it, so it stays in your inbox.';
/** A thing already saved whose copy left, or which changed, since the plan: it stays, and the next tidy-up looks again. */
const NOT_SAVED = 'It changed, or the copy Bower found was moved, so it stays in your inbox for now.';
const LIST_CHANGED = "Bower's list of your files changed meanwhile.";
const UNRESOLVED = 'Bower could not check one of the things it moved. It will look again later.';

type Effect = Exclude<OperationV2['effect'], { kind: 'maintain' } | { kind: 'write-runner-json'; before: null }>;

/** Expected absence uses the same reserved-id create, checks and recovery as other runner files. */
function executable(e: OperationV2['effect']): Exclude<OperationV2['effect'], { kind: 'write-runner-json'; before: null }> {
  return e.kind === 'write-runner-json' && e.before === null
    ? { kind: 'create-text', parent: e.parent, name: e.path.slice('.bower/'.length), createKey: e.createKey,
      text: e.text, content: e.content, purpose: 'runner-json' } : e;
}

/** Whether stored evidence shows exactly this effect applied under `parentId` (null when the effect has no parent). */
export function shows(effect: ManifestEffect, ev: StoredEvidence, parentId: string | null): boolean {
  const f = ev.file;
  switch (effect.kind) {
    case 'move':
      return !ev.trashed && f.parents.length === 1 && f.parents[0] === parentId && f.name === effect.name
        && Object.entries(effect.properties).every(([key, value]) => (value === null ? f.appProperties?.[key] === undefined : f.appProperties?.[key] === value));
    case 'create-folder':
      return !ev.trashed && f.folder && f.parents.length === 1 && f.parents[0] === parentId && f.name === effect.name && f.appProperties?.bowerItem === effect.createKey;
    case 'bin':
      return ev.trashed;
    case 'write-runner-json':
      if (effect.before === null) {
        const create = executable(effect);
        return create.kind === 'create-text' && shows(create, ev, parentId);
      }
      return !ev.trashed && ev.content?.size === effect.content.size && ev.content.sha256 === effect.content.sha256;
    case 'create-text':
      // A made file, a generated note or a runner file (TL-P2-17, TL-P2-33 §2a): its create key, place, name and exact
      // bytes. The "new" mark is not evidence: it may be cleared (the note opened) between a lost reply and recovery.
      return !ev.trashed && !f.folder && f.parents.length === 1 && f.parents[0] === parentId
        && f.name === effect.name && ev.content?.size === effect.content.size && ev.content.sha256 === effect.content.sha256
        && f.appProperties?.bowerItem === effect.createKey;
  }
}

/**
 * The note a filing move files beside without creating it (TL-P2-20 R4-2): the captured place its applied row
 * names when no create-text in that row writes it. The move's dispatch checks it again, in the same step.
 */
export function reusedNoteOf(manifest: RunManifest, op: OperationV2): { file: SeenFile; path: string } | null {
  if (op.effect.kind !== 'move') return null;
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  for (const c of manifest.reportPlan) {
    if (c.when !== 'applied' || !c.requires.includes(op.operationId)) continue;
    const note = c.value.filed[0]?.note;
    if (note === undefined || c.requires.some((id) => ops.get(id)?.effect.kind === 'create-text')) continue;
    if (c.requires.some((id) => ops.get(id)?.effect.kind === 'edit-text')) continue;
    return manifest.capture.places.find((p) => p.path === note) ?? null;
  }
  return null;
}

const refused = (code: Failure['code'], message: string): Settled => ({ state: 'rejected', failure: { code, message } });

/** What a send gives: its write's answer, or, for a create met again by its reserved id, what was read back. */
type Sent = { answer: DriveFile } | { landed: EffectEvidence };

/** Still by the name and place the plan saw (`notAsSeen`, the one check; the caller has it out of the Bin). */
const inPlace = (f: DriveFile, seen: SeenFile): boolean => notAsSeen({ id: seen.fileId, name: seen.name, parents: seen.parents }, { ...f, trashed: false }) === null;

/** Stored evidence in the record shape, as the adapter read it (`provenance`). */
function asEvidence(ev: StoredEvidence, encoding: 'utf8' | 'blob', provenance: EffectEvidence['provenance']): EffectEvidence {
  const f = ev.file;
  return {
    file: { fileId: f.id, name: f.name, parents: [...f.parents], folder: f.folder, modifiedTime: f.modifiedTime },
    trashed: ev.trashed,
    content: ev.content ? { encoding, size: ev.content.size, sha256: ev.content.sha256, provenance, observedModifiedTime: f.modifiedTime } : null,
    provenance,
  };
}

/** The id the chain names for a create, reserved before it was possibly sent; null when it names none. */
const reservedIn = (head: Checkpoint, operationId: string): string | null => {
  const o = head.outcomes.find((x) => x.operationId === operationId);
  return o?.state === 'possible-effect' ? (o.fileId ?? null) : null;
};

/** The id of an operation's parent: a captured folder, or the folder an applied earlier operation made. */
function parentOf(head: Checkpoint, e: Effect): string | null {
  if (e.kind === 'bin' || e.kind === 'write-runner-json' || e.kind === 'edit-text') return null;
  if ('fileId' in e.parent) return e.parent.fileId;
  const by = e.parent.createdBy;
  const made = head.outcomes.find((o) => o.operationId === by);
  return made?.state === 'applied' ? made.evidence.file.fileId : null;
}

/** Still out of the Bin, by the name, place and version the plan read: nothing has written to it since. */
const asSeen = (ev: StoredEvidence, seen: SeenFile): boolean => !ev.trashed && ev.file.modifiedTime === seen.modifiedTime && inPlace(ev.file, seen);

/** A file as it is now, for a check; null when it is gone or in the Bin (`RunDrive.recheck`). */
const now = (drive: RunDrive, id: string): Promise<DriveFile | null> => drive.recheck(id);

/** Whether `from` waits on `to`, through `dependsOn`. */
function waitsOn(manifest: RunManifest, from: string, to: string): boolean {
  const byId = new Map(manifest.operations.map((o) => [o.operationId, o]));
  const seen = new Set<string>();
  const next = [...(byId.get(from)?.dependsOn ?? [])];
  for (let id = next.pop(); id !== undefined; id = next.pop()) {
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(...(byId.get(id)?.dependsOn ?? []));
  }
  return false;
}

/**
 * What the stamp found on a thing says of `op`, by write-once's `happened` (TL-P4-24 addenda 9 and 10), never `landed`:
 * what the person did with it since is kept, so a write that ran is not sent again. `landed`: it is `op`'s own, or that
 * of an operation of the same run waiting on `op`, which is only ever sent once `op` applied (the note an edit changes
 * and then moves carries the move's stamp). `not-landed`: none, or that of an operation `op` waits on (sent before
 * it). `foreign`: another writer's (the app's, another run's). `unknown`: another operation of this run, unrelated to it.
 */
function stampSays(file: DriveFile, runId: string, op: OperationV2, manifest: RunManifest): 'landed' | 'not-landed' | 'foreign' | 'unknown' {
  if (file.appProperties?.[STAMP] === undefined) return 'not-landed';
  const id = manifest.operations.find((o) => happened({ stamp: stampOf(runId, o.operationId) }, file))?.operationId;
  if (id === undefined) return 'foreign';
  if (id === op.operationId || waitsOn(manifest, id, op.operationId)) return 'landed';
  return waitsOn(manifest, op.operationId, id) ? 'not-landed' : 'unknown';
}

export function driveEffects(drive: RunDrive, context?: OwnershipContext, maintenance?: Effects): Effects {
  const toEvidence = (ev: StoredEvidence, encoding: 'utf8' | 'blob' = 'blob'): EffectEvidence => asEvidence(ev, encoding, drive.provenance);

  /** A dependent write uses the identity and version confirmed by the earlier create or move. */
  const afterMove = (op: OperationV2, head: Checkpoint, manifest: RunManifest): OperationV2 => {
    if (op.effect.kind === 'edit-text' && op.effect.createdBy) {
      const createdBy = op.effect.createdBy;
      const create = head.outcomes.find((outcome) => outcome.operationId === createdBy);
      if (create?.state !== 'applied' || !create.evidence.content) throw new BowerError('unknown', UNRESOLVED);
      // Recovery may find the created file moved or edited; only its id and version come from that evidence.
      const before = { ...op.effect.before, fileId: create.evidence.file.fileId, modifiedTime: create.evidence.file.modifiedTime };
      return { ...op, effect: { ...op.effect, before,
        beforeContent: { ...op.effect.beforeContent, observedModifiedTime: before.modifiedTime } } };
    }
    if (op.effect.kind !== 'move') return op;
    const fileId = op.effect.before.fileId;
    const previous = manifest.operations.filter((o) => o.ordinal < op.ordinal && o.effect.kind === 'move'
      && o.effect.before.fileId === fileId && waitsOn(manifest, op.operationId, o.operationId)).reverse()
      .map((o) => head.outcomes.find((r) => r.operationId === o.operationId)).find((r) => r?.state === 'applied');
    return previous?.state === 'applied' ? { ...op, effect: { ...op.effect, before: previous.evidence.file } } : op;
  };

  /**
   * Whether the operation may be sent: its parent there, its source as the plan saw it, and for a content write the
   * stored bytes it was planned on. Gives the modifiedTime a content write must carry, or why it is refused.
   */
  const check = async (op: OperationV2, head: Checkpoint, manifest: RunManifest): Promise<{ refused: Settled } | { parentId: string; modifiedTime: string | null }> => {
    const e = executable(afterMove(op, head, manifest).effect);
    if (e.kind === 'maintain') throw new BowerError('unknown', UNRESOLVED);
    const parentId = parentOf(head, e) ?? '';
    if (e.kind === 'create-folder' || e.kind === 'create-text' || e.kind === 'move') {
      if (!parentId) return { refused: refused('not-found', NO_FOLDER) };
      // A create's folder is read by the fence right before the send (there and out of the Bin): that read is the check.
      if (e.kind === 'create-folder') return { parentId, modifiedTime: null };
      if (e.kind === 'create-text') {
        // Any file or folder already at a made file's path is a lookalike, never overwritten (TL-P2-17).
        const taken = (await drive.list(parentId)).some((f) => f.name.toLowerCase() === e.name.toLowerCase());
        return taken ? { refused: refused('conflict', e.purpose === 'generated' ? NOTE_THERE : NAME_TAKEN) } : { parentId, modifiedTime: null };
      }
      // A move's folder is read by the fence with the thing moved, right before the send: that read is its check.
      // The note a saved link goes beside (TL-P2-20 R4-2): still where it was captured, and still that link's note.
      const reused = reusedNoteOf(manifest, op);
      if (reused) {
        const note = await now(drive, reused.file.fileId);
        if (!note || !inPlace(note, reused.file) || note.appProperties?.bowerItem !== (await savedLinkKey(e.before.fileId))) return { refused: refused('conflict', NOTE_NOT_AS_SEEN) };
      }
    }
    if (e.kind === 'edit-text') {
      // The bytes read must be the planned ones (size and hash), and recompute to the planned text.
      let bytes: Uint8Array;
      try {
        bytes = await drive.readBytes(e.before.fileId);
      } catch (err) {
        if (err instanceof BowerError && err.code === 'not-found') return { refused: refused('conflict', NOT_AS_SEEN) };
        throw err;
      }
      if ((await sha256Hex(bytes)) !== e.beforeContent.sha256) return { refused: refused('conflict', NOTE_CHANGED) };
      if ((await recheckEdit(e, bytes, context ? { fileId: e.before.fileId, context } : undefined)) !== 'ok') return { refused: refused('conflict', NOTE_CHANGED) };
      // The write carries the modifiedTime the plan saw, and the fence reads the file right before the send and refuses
      // it if its name, place or modifiedTime differ: that read is the check, with no earlier one to go stale.
      drive.expectSeen(e.before, true);
      return { parentId, modifiedTime: e.before.modifiedTime };
    }
    if (e.kind === 'write-runner-json') {
      const ev = await drive.evidence(e.before.fileId);
      if (!ev || ev.trashed || ev.content?.sha256 !== e.beforeContent.sha256 || ev.file.modifiedTime !== e.before.modifiedTime) return { refused: refused('conflict', LIST_CHANGED) };
      drive.expectSeen(e.before, true);
      return inPlace(ev.file, e.before) ? { parentId, modifiedTime: e.before.modifiedTime } : { refused: refused('conflict', LIST_CHANGED) };
    }
    // A thing already saved (review P4-17 I1, I2): decided by its content, so its Bin is sent only while it is still the
    // bytes the plan read, and the copy it stands on is still there, in its place, with those same bytes. The fence then
    // reads it again right before the send, with its modifiedTime too.
    const member = e.kind === 'bin' ? manifest.capture.members.find((m) => m.file.fileId === e.before.fileId) : undefined;
    if (e.kind === 'bin' && member) {
      const same = (ev: StoredEvidence | null, seen: SeenFile): boolean => !!ev && !ev.trashed && inPlace(ev.file, seen) && ev.content?.sha256 === member.content.sha256;
      const twins = savedTwins(manifest, op, head);
      const copyStands = same(await drive.evidence(e.before.fileId), e.before);
      let twinStands = false;
      for (const twin of twins) if (copyStands && !twinStands) twinStands = same(await drive.evidence(twin.fileId), twin);
      if (!copyStands || !twinStands) return { refused: refused('conflict', NOT_SAVED) };
      drive.expectSeen(e.before, true);
      return (await drive.list(e.before.fileId)).length ? { refused: refused('conflict', ARRIVED) } : { parentId, modifiedTime: null };
    }
    // The other note of two kept as one (C05): a note captured as a place, binned only while it is still as the plan
    // read it, its modifiedTime too, so a line the person added since is never binned unread (P4-19 I1).
    if (keptOther(op, manifest)) {
      drive.expectSeen(e.before, true);
      return (await drive.list(e.before.fileId)).length ? { refused: refused('conflict', ARRIVED) } : { parentId, modifiedTime: null };
    }
    // A consumed item's Bin also checks the version read, so unread words stay in the inbox.
    drive.expectSeen(e.before, e.kind === 'bin' && !e.before.folder);
    if (e.kind === 'bin' && (await drive.list(e.before.fileId)).some((f) => !e.capturedChildIds.includes(f.id))) return { refused: refused('conflict', ARRIVED) };
    return { parentId, modifiedTime: null };
  };

  /** Sends the effect once through the fenced writes; a create with the id reserved for it. */
  const send = async (e: Effect, w: FencedDrive, parentId: string, modifiedTime: string | null, stamp: string, id: string): Promise<DriveFile> => {
    const op = { [STAMP]: stamp };
    switch (e.kind) {
      case 'move': {
        const from = e.before.parents[0];
        return w.update(e.before.fileId, {
          ...(e.name !== e.before.name ? { name: e.name } : {}),
          ...(parentId !== from ? { addParent: parentId, ...(from ? { removeParent: from } : {}) } : {}),
          appProperties: { ...e.properties, ...op },
        });
      }
      case 'create-folder':
        return w.createFolder(parentId, e.name, { bowerItem: e.createKey, ...op }, id);
      case 'bin':
        return w.trash(e.before.fileId, op);
      case 'write-runner-json':
      case 'edit-text':
        if (modifiedTime === null) throw new BowerError('unknown', UNRESOLVED);
        return w.writeText(e.before.fileId, e.text, modifiedTime, op);
      case 'create-text':
        // A generated note is marked as Bower's and new, with its create key, at creation (TL-P2-17); a runner file with its create key.
        return w.createText(parentId, e.name, e.text, e.purpose === 'generated' ? { by: 'bower', bowerNew: '1', bowerItem: e.createKey, ...op } : { bowerItem: e.createKey, ...op }, id);
    }
  };

  /**
   * The effect read from the answer of its own write (`write-once.ts`): the file as stored (name, place, properties and
   * the stamp sent) and, for text, the checksum of the very bytes sent. Null when the answer does not show it.
   */
  const answered = async (op: OperationV2, parentId: string, answer: DriveFile, stamp: string): Promise<EffectEvidence | null> => {
    const e = executable(op.effect);
    if (e.kind === 'maintain') throw new BowerError('unknown', UNRESOLVED);
    if (answer.appProperties?.[STAMP] !== stamp) return null;
    if (e.kind === 'bin' || e.kind === 'create-folder' || e.kind === 'move') {
      // A move or a Bin changes no bytes: the checksum the answer gives, if any, is the content's evidence.
      const content = !answer.folder && answer.sha256 !== undefined && answer.size !== undefined ? { size: answer.size, sha256: answer.sha256 } : null;
      const ev: StoredEvidence = { file: answer, trashed: e.kind === 'bin', content };
      return shows(e, ev, e.kind === 'bin' ? null : parentId) ? toEvidence(ev, 'blob') : null;
    }
    const bytes = new TextEncoder().encode(e.text);
    if (!confirms(answer, bytes)) return null;
    const ev: StoredEvidence = { file: answer, trashed: false, content: { size: bytes.byteLength, sha256: await sha256Hex(bytes) } };
    // An edit is the same file by the name and place it was read with, holding the bytes sent.
    if (e.kind === 'edit-text') return inPlace(answer, e.before) && ev.content?.size === e.content.size && ev.content.sha256 === e.content.sha256 ? toEvidence(ev, 'utf8') : null;
    return shows(e, ev, e.kind === 'create-text' ? parentId : null) ? toEvidence(ev, 'utf8') : null;
  };

  /**
   * An operation possibly sent, read back by the run's stamp first (TL-P4-05 addendum, strengthening TL-P3-23):
   * - the stamp is there: it landed. What the person changed since (a rename, a move back, the Bin) is kept, and the
   *   evidence is what Drive stores now;
   * - no stamp: it never landed. The caller sends it only if its checks still pass, so a thing the person changed
   *   meanwhile is set aside with the same words an uninterrupted run would use;
   * - a thing it changes is gone from Drive (purged): gone. Drive keeps nothing to tell a change that landed before
   *   the purge from one never sent, so it is reported as not confirmed (TL-P4-14 addendum 7), never sent again;
   * - a create is read by the id reserved for it: there (wherever the person put it since, in the Bin or not), it
   *   landed; not there, it did not;
   * - a read fails, or a create the chain names no id for: unreadable, since making it again could make it twice.
   */
  const reconcile = async (op: OperationV2, head: Checkpoint, manifest: RunManifest, reserved = reservedIn(head, op.operationId)): Promise<ReadBack> => {
    const e = executable(afterMove(op, head, manifest).effect);
    if (e.kind === 'maintain') {
      if (!maintenance) throw new BowerError('unknown', UNRESOLVED);
      return maintenance.readBack(op, head, manifest);
    }
    const encoding = e.kind === 'create-folder' || e.kind === 'move' || e.kind === 'bin' ? 'blob' : 'utf8';
    try {
      if (e.kind === 'create-folder' || e.kind === 'create-text') {
        // Only this create can have made a file with its reserved id: it `happened`, and what the person did with it
        // since is kept (write-once's `happened`, never `landed`).
        if (reserved === null) return { state: 'unreadable', why: `Operation ${op.ordinal} names no reserved id` };
        const ev = await drive.evidence(reserved);
        return ev && happened({ id: reserved }, ev.file) ? { state: 'landed', evidence: toEvidence(ev, encoding) } : { state: 'not-landed' };
      }
      // Gone from Drive (the person emptied the Bin): no stamp to read, and nothing left to send to.
      const ev = await drive.evidence(e.before.fileId);
      if (!ev) return { state: 'unconfirmed', message: UNCONFIRMED_GONE };
      const says = stampSays(ev.file, head.runId, op, manifest);
      if (says === 'landed') return { state: 'landed', evidence: toEvidence(ev, encoding) };
      if (says === 'unknown') return { state: 'unreadable', why: `Operation ${op.ordinal} shows another operation's stamp` };
      // Another writer's stamp (the app's Bin or restore, another run) on a thing changed since the plan read it: that
      // write may have come after this one or instead of it, so whether this one landed is not known.
      return says === 'foreign' && !asSeen(ev, e.before) ? { state: 'unconfirmed', message: UNCONFIRMED_CHANGED } : { state: 'not-landed' };
    } catch (err) {
      console.error(err);
      return { state: 'unreadable', why: `Operation ${op.ordinal} could not be read back` };
    }
  };

  return {
    readBack: reconcile,
    async apply(op, head, w, manifest, sending) {
      if (op.effect.kind === 'maintain') {
        if (!maintenance) throw new BowerError('unknown', UNRESOLVED);
        return maintenance.apply(op, head, w, manifest, sending);
      }
      const stamp = stampOf(head.runId, op.operationId);
      const ok = await check(op, head, manifest);
      if ('refused' in ok) return ok.refused;
      // Possibly sent from here on: everything before it only read.
      const reserved = await sending();
      // A create is sent with its reserved id (one the chain names, or, from an earlier build's opening, one now); with
      // its answer lost it is read back by that id once (`createById`), and that read stands.
      let back: ReadBack | null = null;
      let sent: Sent;
      try {
        const kind = executable(op.effect).kind;
        const go = async (id: string): Promise<Sent> => ({ answer: await send(executable(afterMove(op, head, manifest).effect) as Effect, w, ok.parentId, ok.modifiedTime, stamp, id) });
        sent = kind !== 'create-folder' && kind !== 'create-text' ? await go('') : await createById(reserved ?? (await reserveId(w)), go, async (id) => {
          back = await reconcile(op, head, manifest, id);
          return back.state === 'landed' ? { landed: back.evidence } : null;
        });
      } catch (e) {
        // The fence could not read before anything was sent: no change found, so no refusal and no read-back. The
        // attempt stops; recovery reads it back by its stamp and sends it once (TL-P4-14 addendum 8).
        if (notRead(e)) throw e;
        // Refused by the fence's own read before anything was sent: an honest rejection.
        const k = op.effect.kind;
        if (e instanceof BowerError && (notAsSeenReason(e) !== null || (e.code === 'conflict' && (k === 'write-runner-json' || k === 'edit-text' || k === 'bin')))) {
          console.error(e);
          // The folder it goes into is gone (a create's, or a move's, told by its code).
          if (k === 'create-folder' || k === 'create-text' || (k === 'move' && e.code === 'not-found')) return refused('not-found', NO_FOLDER);
          // The other note of two kept as one says what the person did to it meanwhile, never that both stay when one
          // went to the Bin (P4-19b): its reason, from the fence's own read.
          if (keptOther(op, manifest)) {
            const reason = notAsSeenReason(e);
            return refused('conflict', keepRefused(reason === 'gone' ? 'gone' : reason === 'name' || reason === 'parents' ? 'moved' : 'changed'));
          }
          return refused('conflict', k === 'edit-text' ? NOTE_CHANGED : k === 'write-runner-json' ? LIST_CHANGED : NOT_AS_SEEN);
        }
        // No answer kept (a network error, or Google's 5xx): read back once, never sent again blindly (TL-P3-28).
        if (isNoAnswer(e) || isUnconfirmedWrite(e)) {
          console.error(e);
          const read: ReadBack = back ?? (await reconcile(op, head, manifest, reserved));
          if (read.state === 'landed') return { state: 'applied', evidence: read.evidence };
          if (read.state === 'not-landed') return refused('unknown', UNCONFIRMED_WRITE_MESSAGE);
          if (read.state === 'unconfirmed') return refused('unknown', read.message);
          console.error(read.why);
        }
        throw e;
      }
      if ('landed' in sent) return { state: 'applied', evidence: sent.landed };
      // The answer to the write shows the effect: no read follows it.
      const seen = await answered(afterMove(op, head, manifest), ok.parentId, sent.answer, stamp);
      if (!seen) {
        console.error(`Operation ${op.ordinal} was sent and shows no effect`);
        throw new BowerError('unknown', UNRESOLVED);
      }
      return { state: 'applied', evidence: seen };
    },
  };
}
