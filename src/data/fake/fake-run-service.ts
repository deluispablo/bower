/**
 * The fake run service: the backend's side of a tidy-up on the B path, owned
 * independently of any client page (TL-P2-06 §2, contract B "Trusted scope").
 * One control row per account and folder holds the admitted run, its committed
 * checkpoint head, the current claim with its epoch and the outstanding
 * dispatch. A run is admitted only after its manifest and first checkpoint are
 * confirmed in the folder; then one attempt at a time, under an unexpired
 * claim, commits each effect's intent before dispatching it through the fake
 * Drive's fenced boundary, where a stale epoch or a revoked session is refused
 * in the same step as the change. Recovery belongs to the service: `status()`
 * (and so `process()`) issues a new claim with a greater epoch when no live
 * attempt holds one, reconciles possible effects from stored evidence, never
 * plans again, and rebuilds the report from the durable plan. Public `done`
 * and `failed` are derived: only once the head is terminal and the
 * `.bower/last-run.json` view matches its exact body (TL-P2-06 §3, TL-P2-10 §2).
 *
 * Fake only: the control store is this object (kept by the pretend source in
 * sessionStorage), the fence is the fake Drive's, and a fenced change applies
 * at the instant it passes the check. It proves no real Drive CAS or
 * exactly-once delivery.
 */
import type { FakeDrive, FencedDrive, Peek } from '../drive/fake-drive';
import { canonicalRecordJson } from '../contracts/record-json';
import type { Checkpoint, EffectEvidence, Outcome } from '../contracts/run-checkpoint';
import { readBackEdit, recheckEdit, savedLinkKey } from '../contracts/note-edit';
import type { EditText, OperationV2, SeenFile } from '../contracts/run-manifest';
import { PHASE_MS, type TimeScale } from '../demo/scenario';
import { BowerError, type RunReport } from '../types';
import { SYSTEM, isRunnerFile, type LastRunFile } from '../vault/layout';
import type { RunWire } from '../worker/worker-api';
import { RunRecords, canonical, checkpointName, dispositionsFor, manifestName, materialize, reportName, reusedNoteOf, shows, SOURCE_NOT_AS_SEEN, textHash, toEvidence, type RunManifest } from './fake-run-records';

/** Who asks: the synthetic account slot and the folder it is bound to. */
export interface Binding {
  account: string;
  rootId: string;
}

/** Contract B's control row, exactly. */
export type Control = {
  runId: string; requestId: string; scope: { rootId: string }; manifestHash: string; head: string;
  statusRevision: number;
  claim: null | { attemptId: string; epoch: number; expiresAt: number };
  outstandingDispatch: null | { operationId: string; dispatchId: string; epoch: number };
};

export interface DispatchAt {
  runId: string;
  attemptId: string;
  epoch: number;
  ordinal: number;
  effect: OperationV2['effect'];
}

export interface FakeRunServiceOptions {
  drive: FakeDrive;
  clock?: () => number;
  scale?: TimeScale;
  /** Test seam: awaited after an effect's intent is committed and before it is dispatched. */
  hooks?: { beforeDispatch?: (at: DispatchAt) => Promise<void> };
  /** Test seam: how the admitting attempt waits out each phase's pace (a timer by default). */
  sleep?: (ms: number) => Promise<void>;
  /** Makes the rows and the Drive durable together; an admission is acknowledged only after it. */
  persist?: () => Promise<void>;
}

/** A B run that failed: the honest-phase rule guarantees no effect applied. */
export const B_FAILURE = 'The tidy-up stopped before changing anything. Try again.';

/** How long an attempt's claim lasts without progress: longer than any phase of the slowest clock. */
export const CLAIM_MS = 300_000;
/** How long to wait before recovering again after an attempt failed. */
export const RETRY_MS = 5_000;

/** The service's row for one binding, kept across a reload. */
interface Row {
  binding: Binding;
  control: Control;
  /** The highest epoch ever issued here: a new claim is always greater. */
  lastEpoch: number;
  /** SHA-256 of the view text the folder showed at admission (null: none); the only view a publication may replace. */
  viewBefore: string | null;
  /**
   * Dispatches that passed the boundary, recorded in the same synchronous step
   * as the change and before it, and kept across a reload. One that never
   * passed can be sent again (same dispatch id) once its epoch is superseded;
   * one that passed and shows no effect stays unresolved. A trusted no-effect
   * proof of the FAKE boundary only (TL-P2-16): it does not carry to P3, where
   * a real Drive call can still land after any check.
   */
  crossed: string[];
  /** This binding's run ids in admission order (the latest last): a view of an earlier one may be replaced. */
  admitted: string[];
}

/** What this instance knows besides the row; never authority. */
interface Cache {
  manifest: RunManifest;
  chain: Checkpoint[];
  /** The view was read back with this run's exact terminal body. */
  confirmed: boolean;
  notBefore: number;
  /** Attempts in a row that ended without finishing; after MAX_TRIES this instance stops trying. */
  failures: number;
}

/** A note a filing move goes beside, as captured, and the key it must still carry for that move's file. */
interface Reused {
  file: SeenFile;
  key: string;
}

interface Attempt {
  key: string;
  attemptId: string;
  epoch: number;
  /** The admitting attempt walks the phases on the clock; a recovery goes straight on. */
  original: boolean;
}

const TERMINAL: readonly string[] = ['done', 'failed'];
const STALE = 'Bower is finishing this tidy-up elsewhere.';
const SIGNED_OUT = 'Sign in again to keep going.';
const NOT_YOURS = 'This tidy-up belongs to another account or folder.';
const UNRESOLVED = 'Bower could not check one of the things it moved. It will look again later.';
const SAVE_FAILED = 'Bower could not save what it did. Try again later.';
const NOT_AS_SEEN = SOURCE_NOT_AS_SEEN;
/** A reused note no longer where, or what, the plan saw: not the thing's own cause (TL-P2-34). */
const NOTE_NOT_AS_SEEN = 'The note it goes beside is not where Bower left it.';
const NOTE_CHANGED = 'The note changed before Bower could add to it.';
const NOTE_THERE = 'A note with that name was already there, so Bower did not write it.';
const NAME_TAKEN = 'Something else has that name there, so Bower left it as it was.';
/** Attempts in a row before this instance stops retrying a run that keeps failing; it stays saving. */
const MAX_TRIES = 5;

/** A source no longer as the plan saw it, found inside the boundary before anything was sent. */
class NotAsSeen extends BowerError {
  constructor(readonly failure: { code: 'conflict' | 'not-found'; message: string }) {
    super(failure.code, failure.message);
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const keyOf = (b: Binding): string => `${b.account}:${b.rootId}`;

export class FakeRunService {
  /** Told after every change to the rows, so the pretend source can keep them across reloads. */
  onChange: (() => void) | null = null;
  private readonly drive: FakeDrive;
  private readonly clock: () => number;
  private readonly scale: TimeScale;
  private readonly hooks: FakeRunServiceOptions['hooks'];
  /** How the admitting attempt waits out each phase's pace. */
  private readonly pace: (ms: number) => Promise<void>;
  /** Where each run's records were last written: a cache only, never authority (`RunRecords.putNew`). */
  private readonly placed = new Map<string, string>();
  private readonly persist: FakeRunServiceOptions['persist'];
  private rows = new Map<string, Row>();
  private revoked = new Set<string>();
  private seq = 0;
  private cache = new Map<string, Cache>();
  /** Attempts running in this instance, by attempt id. */
  private live = new Set<string>();
  private running = new Set<Promise<void>>();
  private recovering = new Map<string, Promise<void>>();
  private admitting = new Map<string, Promise<RunWire>>();
  private failing = new Set<string>();

  constructor(opts: FakeRunServiceOptions) {
    this.drive = opts.drive;
    this.clock = opts.clock ?? Date.now;
    this.scale = opts.scale ?? 'instant';
    this.hooks = opts.hooks;
    this.pace = opts.sleep ?? sleep;
    this.persist = opts.persist;
  }

  /**
   * The service back from `toJSON()`. Its attempts ran in the page that is
   * gone, so no claim survives: a possible effect is reconciled from evidence.
   */
  static restore(json: string, opts: FakeRunServiceOptions): FakeRunService {
    const data = JSON.parse(json) as unknown;
    if (!isState(data)) throw new BowerError('unknown', 'Bower could not read how its tidy-ups stand.');
    const s = new FakeRunService(opts);
    s.seq = data.seq;
    s.revoked = new Set(data.revoked);
    for (const [key, row] of Object.entries(data.rows)) s.rows.set(key, { ...row, admitted: row.admitted ?? [row.control.runId], control: { ...row.control, claim: null } });
    return s;
  }

  toJSON(): string {
    return JSON.stringify({ v: 1, seq: this.seq, revoked: [...this.revoked], rows: Object.fromEntries(this.rows) });
  }

  /** A run's identities, minted once before it is planned. */
  ids(): { runId: string; requestId: string } {
    return { runId: this.mint('run'), requestId: this.mint('request') };
  }

  /**
   * Admits a fixed manifest: its record and first checkpoint are confirmed in
   * the folder before the row exists and before anything is acknowledged.
   * The run then goes on here, whatever the client does.
   */
  async admit(binding: Binding, manifest: RunManifest, opts: { failAt?: 'writing' } = {}): Promise<RunWire> {
    this.authorize(binding);
    const key = keyOf(binding);
    if (manifest.scope.rootId !== binding.rootId) throw new BowerError('auth', NOT_YOURS);
    // One run at a time: a quick second ask gets the run being admitted, or the one going.
    const starting = this.admitting.get(key);
    if (starting) return starting;
    const work = this.admitNow(binding, key, manifest, opts);
    this.admitting.set(key, work);
    try {
      return await work;
    } finally {
      this.admitting.delete(key);
    }
  }

  private async admitNow(binding: Binding, key: string, manifest: RunManifest, opts: { failAt?: 'writing' }): Promise<RunWire> {
    const before = this.rows.get(key);
    if (before) {
      const now = await this.publicPhase(key);
      if (now.going) return now.wire;
    }
    const m = await canonical(manifest);
    const records = new RunRecords(this.drive, binding.rootId, this.placed);
    const attempt: Attempt = { key, attemptId: this.mint('attempt'), epoch: (before?.lastEpoch ?? 0) + 1, original: true };
    const first: Checkpoint = {
      v: 1, kind: 'run-checkpoint', scope: { rootId: binding.rootId }, runId: manifest.runId, manifestHash: m.hash,
      revision: 0, previous: null, attemptId: attempt.attemptId, epoch: attempt.epoch, phase: 'queued', phaseAt: this.clock(),
      outcomes: manifest.operations.map((o): Outcome => ({ operationId: o.operationId, state: 'not-dispatched' })),
      report: { state: 'not-ready' }, retainedPileIds: [],
    };
    const c = await canonical(first);
    const viewBefore = await this.viewHash(binding.rootId);
    // Admission writes only while this binding is authorized and no other run took the row meanwhile.
    const w = this.drive.fenced(() => {
      this.authorizeAtBoundary(key);
      if (this.rows.get(key) !== before) throw new BowerError('conflict', STALE);
    });
    await records.put(w, { runId: manifest.runId }, manifestName(m.hash), m.text);
    await records.put(w, { runId: manifest.runId }, checkpointName(0, c.hash), c.text);
    if (this.rows.get(key) !== before) throw new BowerError('conflict', STALE);
    this.rows.set(key, {
      binding: { ...binding },
      control: {
        runId: manifest.runId, requestId: manifest.requestId, scope: { rootId: binding.rootId }, manifestHash: m.hash, head: c.hash,
        statusRevision: 0, claim: { attemptId: attempt.attemptId, epoch: attempt.epoch, expiresAt: this.clock() + CLAIM_MS }, outstandingDispatch: null,
      },
      lastEpoch: attempt.epoch,
      viewBefore,
      crossed: [],
      admitted: [...(before?.admitted ?? []), manifest.runId].slice(-ADMITTED_KEPT),
    });
    this.cache.set(key, { manifest, chain: [first], confirmed: false, notBefore: 0, failures: 0 });
    if (opts.failAt) this.failing.add(manifest.runId);
    this.changed();
    // Acknowledged only once durable: an admitted run survives the client that asked for it.
    await this.persist?.();
    this.launch(attempt);
    return (await this.publicPhase(key)).wire;
  }

  /**
   * The binding's latest run as the person sees it now. Asking lets the
   * service start recovering it when it needs to, without waiting for that.
   */
  async status(binding: Binding): Promise<RunWire | null> {
    this.authorize(binding);
    const key = keyOf(binding);
    if (!this.rows.has(key)) return null;
    this.kick(key);
    return (await this.publicPhase(key)).wire;
  }

  /** Starts a recovery in the background when none is being decided; its failures are logged. */
  private kick(key: string): Promise<void> {
    const going = this.recovering.get(key);
    if (going) return going;
    const work: Promise<void> = this.maybeRecover(key)
      .catch((e: unknown) => console.error(e))
      .finally(() => {
        this.recovering.delete(key);
        this.running.delete(work);
      });
    this.recovering.set(key, work);
    this.running.add(work);
    return work;
  }

  /**
   * Whether the binding's latest run is the B run a reloaded client should
   * show, given the view text the folder holds now: none yet, this run's own,
   * or still the view it found at admission.
   */
  async shows(binding: Binding, view: string | null): Promise<boolean> {
    const row = this.rows.get(keyOf(binding));
    if (!row) return false;
    if (view === null) return true;
    if ((await textHash(view)) === row.viewBefore) return true;
    try {
      return (JSON.parse(view) as Partial<LastRunFile>).run?.id === row.control.runId;
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(e);
      return false;
    }
  }

  /** The piles the binding's run took, while it goes. */
  runningPiles(binding: Binding): ReadonlySet<string> {
    const key = keyOf(binding);
    const cache = this.cache.get(key);
    const head = cache?.chain.at(-1);
    if (!cache || !head || (TERMINAL.includes(head.phase) && cache.confirmed)) return new Set();
    return new Set(cache.manifest.capture.piles.map((p) => p.pileId));
  }

  /**
   * Internal seam (not WorkerApi): lets the service continue this run when no
   * live attempt holds an unexpired claim. Another account or folder is refused.
   */
  async recover(binding: Binding, runId: string): Promise<void> {
    this.authorize(binding);
    const key = keyOf(binding);
    const row = this.rows.get(key);
    if (!row || row.control.runId !== runId) throw new BowerError('auth', NOT_YOURS);
    await this.kick(key);
  }

  /** Test seam: the person's session for this binding ends; nothing more takes effect for it. */
  revoke(binding: Binding): void {
    this.revoked.add(keyOf(binding));
    this.changed();
  }

  /** Resolves when no attempt is running here. */
  async settled(): Promise<void> {
    while (this.running.size) await Promise.all([...this.running]);
  }

  private async maybeRecover(key: string): Promise<void> {
    const row = this.rows.get(key);
    if (!row) return;
    const phase = await this.publicPhase(key);
    if (phase.settled) return;
    const claim = row.control.claim;
    if (claim && claim.expiresAt >= this.clock() && this.live.has(claim.attemptId)) return;
    if ((this.cache.get(key)?.notBefore ?? 0) > this.clock()) return;
    if (!(await this.quiescent(key))) return;
    // A new attempt under a strictly greater epoch: from now on the old one is refused at the boundary.
    const attempt: Attempt = { key, attemptId: this.mint('attempt'), epoch: row.lastEpoch + 1, original: false };
    row.lastEpoch = attempt.epoch;
    row.control.claim = { attemptId: attempt.attemptId, epoch: attempt.epoch, expiresAt: this.clock() + CLAIM_MS };
    row.control.statusRevision++;
    this.changed();
    await this.launch(attempt);
  }

  /**
   * Whether the outstanding dispatch allows a new claim: none; one that never
   * passed the boundary (the new epoch keeps it from ever passing); or one that
   * passed and whose effect the stored evidence shows. Otherwise it stays
   * unresolved and no claim is issued.
   */
  private async quiescent(key: string): Promise<boolean> {
    const row = this.row(key);
    const out = row.control.outstandingDispatch;
    if (!out || !row.crossed.includes(out.dispatchId)) return true;
    const { manifest, chain } = await this.loaded(key, true);
    const head = chain.at(-1);
    const op = manifest.operations.find((o) => o.operationId === out.operationId);
    if (head && op && (await this.observe(head, op))) return true;
    console.error(new BowerError('unknown', UNRESOLVED), `dispatch ${out.dispatchId} of run ${row.control.runId} passed the boundary and shows no effect`);
    this.failed(key);
    return false;
  }

  private launch(attempt: Attempt): Promise<void> {
    this.live.add(attempt.attemptId);
    const work = this.execute(attempt)
      .then(() => {
        const cache = this.cache.get(attempt.key);
        if (cache) cache.failures = 0;
      })
      .catch((e: unknown) => {
        console.error(e);
        if (this.rows.get(attempt.key)?.control.claim?.attemptId === attempt.attemptId) this.failed(attempt.key);
      })
      .finally(() => {
        this.live.delete(attempt.attemptId);
        const row = this.rows.get(attempt.key);
        if (row?.control.claim?.attemptId === attempt.attemptId) {
          row.control.claim = null;
          this.changed();
        }
        this.running.delete(work);
      });
    this.running.add(work);
    return work;
  }

  /**
   * Waits before the next try; after MAX_TRIES in a row this instance stops
   * trying (the run stays saving, its records intact) and says so once.
   */
  private failed(key: string): void {
    const cache = this.cache.get(key);
    if (!cache) return;
    cache.failures++;
    if (cache.failures < MAX_TRIES) {
      cache.notBefore = this.clock() + RETRY_MS;
      return;
    }
    cache.notBefore = Number.POSITIVE_INFINITY;
    console.error(new BowerError('unknown', 'Bower stopped trying to finish this tidy-up for now.'), `run ${this.rows.get(key)?.control.runId ?? ''} stopped after ${MAX_TRIES} attempts`);
  }

  /** One attempt: from the committed head to the terminal view, never planning again. */
  private async execute(attempt: Attempt): Promise<void> {
    const { manifest, chain } = await this.loaded(attempt.key, !attempt.original);
    const records = this.records(attempt.key);
    let head = chain.at(-1);
    if (!head) throw new BowerError('unknown', SAVE_FAILED);
    const ms = PHASE_MS[this.scale];
    // The pace a person watches, on the scenario's clock. A run waits in the queue from when it was asked for, so the
    // time it took to plan counts; the effects take their own time inside the putting-away pace, never after it.
    const queued = Math.min(ms.queued, Math.max(0, ms.queued - (this.clock() - manifest.requestedAt)));
    const walk: Array<['reading' | 'writing' | 'saving', number]> = [['reading', queued], ['writing', ms.reading], ['saving', ms.writing]];
    for (const [phase, wait] of walk) {
      if (!['queued', 'reading', 'writing'].includes(head.phase) || rank(head.phase) >= rank(phase)) continue;
      if (attempt.original) await this.pace(wait);
      if (phase === 'saving' && this.failing.delete(manifest.runId)) {
        // The runner stops before any effect: an honest failure (nothing was dispatched).
        head = await this.commit(attempt, head, { phase: 'failed', phaseAt: this.clock() });
        break;
      }
      head = await this.commit(attempt, head, { phase, phaseAt: this.clock() });
    }
    if (head.phase === 'saving') {
      const pace = attempt.original ? this.pace(ms.saving) : Promise.resolve();
      for (const op of manifest.operations) head = await this.settle(attempt, manifest, head, op);
      await pace;
      const manifestHash = this.row(attempt.key).control.manifestHash;
      if (head.report.state === 'not-ready') {
        const body = materialize(manifest, manifestHash, head.outcomes);
        if (!body) throw new BowerError('unknown', UNRESOLVED);
        head = await this.commit(attempt, head, { report: { state: 'pending', reportHash: (await canonical(body)).hash, body } });
      }
      if (head.report.state === 'pending') {
        const r = await canonical(head.report.body);
        if (r.hash !== head.report.reportHash) throw new BowerError('unknown', SAVE_FAILED);
        await records.put(this.fence(attempt), { runId: manifest.runId }, reportName(r.hash), r.text);
        await records.report(manifest, manifestHash, r.hash);
        head = await this.commit(attempt, head, { report: { state: 'published', reportHash: r.hash } });
      }
      if (head.report.state === 'published') {
        for (const d of dispositionsFor(manifest, head.outcomes, head.report.reportHash)) await records.putDisposition(this.fence(attempt), d);
        const retained = manifest.operations.flatMap((o, i) => {
          const e = o.effect;
          return e.kind === 'bin' && head?.outcomes[i]?.state === 'rejected' ? manifest.capture.piles.filter((p) => p.anchor?.fileId === e.before.fileId).map((p) => p.pileId) : [];
        });
        head = await this.commit(attempt, head, { phase: 'done', phaseAt: this.clock(), retainedPileIds: retained });
      }
    }
    if (TERMINAL.includes(head.phase)) await this.publish(attempt);
  }

  /**
   * One operation to a final outcome: its intent is committed before it is
   * dispatched; a possible effect is reconciled from stored evidence; one that
   * never passed the boundary is sent again under the same dispatch id; one
   * that passed and shows no effect stays unresolved.
   */
  private async settle(attempt: Attempt, manifest: RunManifest, head: Checkpoint, op: OperationV2): Promise<Checkpoint> {
    const outcome = head.outcomes[op.ordinal];
    if (!outcome || outcome.state === 'applied' || outcome.state === 'rejected') return head;
    const row = this.row(attempt.key);
    let dispatchId: string;
    if (outcome.state === 'possible-effect') {
      const seen = await this.observe(head, op);
      if (seen) return this.resolve(attempt, head, op, { operationId: op.operationId, state: 'applied', evidence: seen });
      if (row.crossed.includes(outcome.dispatchId)) {
        console.error(`Operation ${op.ordinal} of run ${manifest.runId} passed the boundary and shows no effect`);
        throw new BowerError('unknown', UNRESOLVED);
      }
      // It never passed the boundary, and its epoch is superseded: it never will. The same dispatch goes again.
      // This no-effect proof holds for the FAKE boundary only (TL-P2-16); it does not carry to P3.
      const out = row.control.outstandingDispatch;
      if (out?.dispatchId !== outcome.dispatchId || out.epoch >= attempt.epoch) {
        console.error(`Operation ${op.ordinal} of run ${manifest.runId} is not superseded; it is not sent again`);
        throw new BowerError('unknown', UNRESOLVED);
      }
      dispatchId = outcome.dispatchId;
      row.control.outstandingDispatch = { operationId: op.operationId, dispatchId, epoch: attempt.epoch };
      this.changed();
    } else {
      dispatchId = this.mint('dispatch');
      head = await this.resolve(attempt, head, op, { operationId: op.operationId, state: 'possible-effect', dispatchId });
    }
    const pre = await this.precheck(head, op);
    if ('failure' in pre) return this.resolve(attempt, head, op, { operationId: op.operationId, state: 'rejected', failure: pre.failure });
    const reused = await this.reused(manifest, op);
    await this.hooks?.beforeDispatch?.({ runId: manifest.runId, attemptId: attempt.attemptId, epoch: attempt.epoch, ordinal: op.ordinal, effect: op.effect });
    try {
      await this.dispatch(attempt, head, op, dispatchId, pre.modifiedTime, reused);
    } catch (e) {
      // Refused inside the boundary before it passed: nothing was sent, so the outcome is an honest rejection.
      if (e instanceof NotAsSeen) return this.resolve(attempt, head, op, { operationId: op.operationId, state: 'rejected', failure: e.failure });
      throw e;
    }
    const seen = await this.observe(head, op);
    if (!seen) {
      console.error(`Operation ${op.ordinal} of run ${manifest.runId} was sent and shows no effect`);
      throw new BowerError('unknown', UNRESOLVED);
    }
    return this.resolve(attempt, head, op, { operationId: op.operationId, state: 'applied', evidence: seen });
  }

  /**
   * A note a filing move goes beside without creating it (TL-P2-20 R4-2, Ratification 6): the place as captured
   * and the key recomputed from the move's own file, checked again inside the boundary in the move's step.
   */
  private async reused(manifest: RunManifest, op: OperationV2): Promise<Reused | null> {
    const place = reusedNoteOf(manifest, op);
    if (!place || op.effect.kind !== 'move') return null;
    return { file: place.file, key: await savedLinkKey(op.effect.before.fileId) };
  }

  private resolve(attempt: Attempt, head: Checkpoint, op: OperationV2, outcome: Outcome): Promise<Checkpoint> {
    return this.commit(attempt, head, { outcomes: head.outcomes.map((o, i) => (i === op.ordinal ? outcome : o)) });
  }

  /** The id of an operation's parent: a captured folder, or the folder an applied earlier operation made. */
  private parentOf(head: Checkpoint, op: OperationV2): string | null {
    const e = op.effect;
    if (e.kind === 'bin' || e.kind === 'write-runner-json' || e.kind === 'edit-text') return null;
    if ('fileId' in e.parent) return e.parent.fileId;
    const by = e.parent.createdBy;
    const made = head.outcomes.find((o) => o.operationId === by);
    return made?.state === 'applied' ? made.evidence.file.fileId : null;
  }

  /** Stored evidence that this very effect applied, or null. A lookalike without the create key never counts. */
  private async observe(head: Checkpoint, op: OperationV2): Promise<EffectEvidence | null> {
    const e = op.effect;
    const parentId = this.parentOf(head, op);
    if (e.kind === 'create-folder') {
      if (!parentId) return null;
      const made = (await this.drive.listAll(parentId)).filter((f) => f.parents[0] === parentId && f.folder && f.name === e.name && f.appProperties?.bowerItem === e.createKey);
      const [only, ...more] = made;
      if (!only || more.length) return null;
      const ev = await this.drive.evidence(only.id);
      return ev && shows(e, ev, parentId) ? toEvidence(ev) : null;
    }
    if (e.kind === 'create-text') {
      // Ours only with its create key (TL-P2-17): a lookalike at that path never counts as this operation.
      if (!parentId) return null;
      const made = (await this.drive.listAll(parentId)).filter((f) => f.parents[0] === parentId && !f.folder && f.name === e.name && f.appProperties?.bowerItem === e.createKey);
      const [only, ...more] = made;
      if (!only || more.length) return null;
      const ev = await this.drive.evidence(only.id);
      return ev && shows(e, ev, parentId) ? toEvidence(ev, 'utf8') : null;
    }
    if (e.kind === 'edit-text') return this.readBack(e);
    const ev = await this.drive.evidence(e.before.fileId);
    if (!ev || !shows(e, ev, parentId)) return null;
    return toEvidence(ev, e.kind === 'write-runner-json' ? 'utf8' : 'blob');
  }

  /**
   * An edit read back (TL-P2-20 rule 5): the same file, out of the Bin, with
   * exactly the edit's text is applied. The bytes it was planned on stay a
   * possible effect, and anything else stays unresolved: neither is evidence.
   */
  private async readBack(e: EditText): Promise<EffectEvidence | null> {
    const ev = await this.drive.evidence(e.before.fileId);
    if (!ev) return null;
    const bytes = ev.trashed ? new Uint8Array() : await this.drive.readBytes(e.before.fileId);
    const read = await readBackEdit(e, { fileId: ev.file.id, name: ev.file.name, parents: ev.file.parents, trashed: ev.trashed, bytes });
    if (read === 'applied' && ev.content?.size === e.content.size && ev.content.sha256 === e.content.sha256) return toEvidence(ev, 'utf8');
    console.error(`The edit of ${e.path} reads back as ${read === 'applied' ? 'unresolved' : read}`);
    return null;
  }

  /**
   * What can be checked ahead of the boundary: what it depends on happened,
   * its parent folder exists, and for the hashes the content it read (with
   * the modified time that content was read at, checked again inside the
   * boundary). Whether the source is still as seen is checked inside.
   */
  private async precheck(head: Checkpoint, op: OperationV2): Promise<{ failure: { code: 'conflict' | 'not-found'; message: string } } | { modifiedTime: string | null }> {
    const e = op.effect;
    // What it depends on must have happened: a pile folder whose things did not all go stays, and so do the hashes.
    if (op.dependsOn.some((id) => head.outcomes.find((o) => o.operationId === id)?.state !== 'applied')) return { failure: { code: 'conflict', message: 'Some of its things stayed where they were, so it stays too.' } };
    if (e.kind !== 'bin' && e.kind !== 'write-runner-json' && e.kind !== 'edit-text' && !this.parentOf(head, op)) return { failure: { code: 'not-found', message: 'The folder for it could not be made.' } };
    if (e.kind === 'edit-text') return this.precheckEdit(e);
    if (e.kind !== 'write-runner-json') return { modifiedTime: null };
    const ev = await this.drive.evidence(e.before.fileId);
    if (!ev || ev.trashed || ev.content?.sha256 !== e.beforeContent.sha256) return { failure: { code: 'conflict', message: 'Bower\'s list of your files changed meanwhile.' } };
    return { modifiedTime: ev.file.modifiedTime };
  }

  /**
   * An edit's precondition (TL-P2-20 rules 1 and 4): one read gives the
   * stored bytes' hash with their modifiedTime; the bytes must be the ones
   * planned on, by the same name in the same place and out of the Bin, and
   * `applyChanges` on them must give the edit's text again. The write then
   * carries that read's modifiedTime, so a newer time with the same bytes
   * before the read is no clash, and any change after it is refused inside
   * the boundary.
   */
  private async precheckEdit(e: EditText): Promise<{ failure: { code: 'conflict' | 'not-found'; message: string } } | { modifiedTime: string }> {
    const ev = await this.drive.evidence(e.before.fileId);
    const same = !!ev && !ev.trashed && ev.file.name === e.before.name && ev.file.parents.length === e.before.parents.length && ev.file.parents.every((p, i) => p === e.before.parents[i]);
    if (!ev || !same) return { failure: { code: 'conflict', message: NOT_AS_SEEN } };
    if (ev.content?.size !== e.beforeContent.size || ev.content.sha256 !== e.beforeContent.sha256) return { failure: { code: 'conflict', message: NOTE_CHANGED } };
    if ((await recheckEdit(e, await this.drive.readBytes(e.before.fileId))) !== 'ok') return { failure: { code: 'conflict', message: NOTE_CHANGED } };
    return { modifiedTime: ev.file.modifiedTime };
  }

  /** Whether the stored source is still as the plan saw it, at the instant of the change; null when it is. */
  private stillAsSeen(op: OperationV2, parentId: string, modifiedTime: string | null, peek: Peek, reused: Reused | null): { code: 'conflict' | 'not-found'; message: string } | null {
    const e = op.effect;
    if (e.kind === 'create-folder' || e.kind === 'move' || e.kind === 'create-text') {
      const parent = peek(parentId);
      if (!parent || parent.trashed) return { code: 'not-found', message: 'The folder for it could not be made.' };
      if (e.kind === 'create-folder') return null;
      // Any file or folder already at a made file's path is a lookalike, never overwritten (TL-P2-17).
      if (e.kind === 'create-text') {
        const taken = parent.children.some((id) => peek(id)?.file.name.toLowerCase() === e.name.toLowerCase());
        return taken ? { code: 'conflict', message: e.purpose === 'generated' ? NOTE_THERE : NAME_TAKEN } : null;
      }
    }
    if (reused) {
      // The note it is filed beside: still where and as it was captured, and still the note for this very link.
      const note = peek(reused.file.fileId);
      const there = !!note && !note.trashed && note.file.name === reused.file.name && note.file.parents.length === reused.file.parents.length
        && note.file.parents.every((p, i) => p === reused.file.parents[i]) && note.file.appProperties?.bowerItem === reused.key;
      if (!there) return { code: 'conflict', message: NOTE_NOT_AS_SEEN };
    }
    const now = peek(e.before.fileId);
    const same = !!now && !now.trashed && now.file.name === e.before.name && now.file.parents.length === e.before.parents.length && now.file.parents.every((p, i) => p === e.before.parents[i]);
    if (!now || !same) return { code: 'conflict', message: NOT_AS_SEEN };
    if (e.kind === 'bin' && now.children.some((id) => !e.capturedChildIds.includes(id))) return { code: 'conflict', message: 'Something new arrived in it, so it stays in your inbox.' };
    if (e.kind === 'write-runner-json' && now.file.modifiedTime !== modifiedTime) return { code: 'conflict', message: 'Bower\'s list of your files changed meanwhile.' };
    if (e.kind === 'edit-text' && now.file.modifiedTime !== modifiedTime) return { code: 'conflict', message: NOTE_CHANGED };
    return null;
  }

  /**
   * Sends one effect through the boundary. Inside it, in one step with the
   * change: the claim, the source still as seen, then the dispatch is marked
   * as passed (kept with the rows) and only then applied.
   */
  private async dispatch(attempt: Attempt, head: Checkpoint, op: OperationV2, dispatchId: string, modifiedTime: string | null, reused: Reused | null): Promise<void> {
    const row = this.row(attempt.key);
    const e = op.effect;
    const parentId = this.parentOf(head, op) ?? '';
    const w = this.drive.fenced((peek) => {
      this.check(attempt);
      const failure = this.stillAsSeen(op, parentId, modifiedTime, peek, reused);
      if (failure) throw new NotAsSeen(failure);
      if (!row.crossed.includes(dispatchId)) row.crossed.push(dispatchId);
      this.changed();
    });
    switch (e.kind) {
      case 'move': {
        const from = e.before.parents[0];
        await w.update(e.before.fileId, {
          ...(e.name !== e.before.name ? { name: e.name } : {}),
          ...(parentId !== from ? { addParent: parentId, ...(from ? { removeParent: from } : {}) } : {}),
          appProperties: { ...e.properties },
        });
        return;
      }
      case 'create-folder':
        await w.createFolder(parentId, e.name, { bowerItem: e.createKey });
        return;
      case 'bin':
        await w.trash(e.before.fileId);
        return;
      case 'write-runner-json':
        await w.writeText(e.before.fileId, e.text, modifiedTime ?? e.before.modifiedTime);
        return;
      case 'edit-text':
        // Only after precheckEdit, with the modifiedTime of the read it checked.
        if (modifiedTime === null) throw new BowerError('unknown', UNRESOLVED);
        await w.writeText(e.before.fileId, e.text, modifiedTime);
        return;
      case 'create-text':
        // A generated note is stamped as Bower's, new, and with its create key at creation (TL-P2-17); a runner file
        // made again (TL-P2-33 §2a) only with its create key. Either way a lost reply is found again by that key.
        await w.createText(parentId, e.name, e.text, e.purpose === 'generated' ? { by: 'bower', bowerNew: '1', bowerItem: e.createKey } : { bowerItem: e.createKey });
        return;
    }
  }

  /**
   * Publishes the next checkpoint: written through the boundary while this
   * attempt still holds the claim and the head it read, then the control head
   * advances in the same step as a last check. A refused or failed write
   * leaves the head where it was.
   */
  private async commit(attempt: Attempt, head: Checkpoint, patch: Partial<Pick<Checkpoint, 'phase' | 'phaseAt' | 'outcomes' | 'report' | 'retainedPileIds'>>): Promise<Checkpoint> {
    const row = this.row(attempt.key);
    const expected = row.control.head;
    const next: Checkpoint = { ...head, ...patch, revision: head.revision + 1, previous: expected, attemptId: attempt.attemptId, epoch: attempt.epoch };
    const c = await canonical(next);
    const cache = this.cache.get(attempt.key);
    if (!cache) throw new BowerError('unknown', SAVE_FAILED);
    await this.records(attempt.key).putNew(this.fence(attempt, expected), { runId: next.runId }, checkpointName(next.revision, c.hash), c.text);
    this.check(attempt, expected);
    const pending = next.outcomes.find((o) => o.state === 'possible-effect');
    row.control.head = c.hash;
    row.control.statusRevision++;
    row.control.outstandingDispatch = pending?.state === 'possible-effect' ? { operationId: pending.operationId, dispatchId: pending.dispatchId, epoch: attempt.epoch } : null;
    if (row.control.claim) row.control.claim.expiresAt = this.clock() + CLAIM_MS;
    cache.chain = [...cache.chain, next];
    this.changed();
    return next;
  }

  /**
   * Writes the v1 view with the modified time it read and reads it back. It
   * replaces only the view the folder showed at admission; another run's view
   * is never written over, and a mismatch is never taken as confirmation.
   */
  private async publish(attempt: Attempt): Promise<void> {
    const key = attempt.key;
    const row = this.row(key);
    const text = await this.viewTextOf(key);
    const stored = await this.storedView(row.binding.rootId);
    if (!sameView(stored?.text ?? null, text)) {
      if (!(await this.replaceable(row, stored?.text ?? null))) {
        console.error(`${SYSTEM.lastRun} shows another run; run ${row.control.runId} is not saved over it`);
        throw new BowerError('conflict', SAVE_FAILED);
      }
      const w = this.fence(attempt);
      try {
        if (stored) await w.writeText(stored.file, text, stored.modifiedTime);
        else await w.createText(await this.systemFolder(attempt), 'last-run.json', text);
      } catch (e) {
        // A reply lost after the view landed: the exact body is there.
        if (!sameView((await this.storedView(row.binding.rootId))?.text ?? null, text)) throw e;
        console.error(e);
      }
      if (!sameView((await this.storedView(row.binding.rootId))?.text ?? null, text)) {
        console.error(`${SYSTEM.lastRun} could not be read back for run ${row.control.runId}`);
        throw new BowerError('unknown', SAVE_FAILED);
      }
    }
    const cache = this.cache.get(key);
    if (cache) cache.confirmed = true;
  }

  /**
   * Whether a publication may replace the stored view: the one recorded at
   * admission, or a view of a run admitted before this one (by this service's
   * admission order, or an earlier request time for a run it never admitted,
   * such as a late legacy retry). Never a later run's, this run's own with
   * another body, or one it cannot read.
   */
  private async replaceable(row: Row, view: string | null): Promise<boolean> {
    if ((view === null ? null : await textHash(view)) === row.viewBefore) return true;
    if (view === null) return false;
    let value: unknown;
    try {
      value = JSON.parse(view);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(e);
      return false;
    }
    if (!isRunnerFile(SYSTEM.lastRun, value)) return false;
    const other = value.run;
    if (other.id === row.control.runId) return false;
    const order = row.admitted.indexOf(other.id);
    if (order >= 0) return order < row.admitted.indexOf(row.control.runId);
    const { manifest } = await this.loaded(keyOf(row.binding), false);
    return other.requestedAt < manifest.requestedAt;
  }

  /**
   * The public run, derived: a terminal head shows as done or failed only
   * when the view matches its exact body; until then the last confirmed
   * non-terminal phase, with no finish time.
   */
  private async publicPhase(key: string): Promise<{ wire: RunWire; settled: boolean; going: boolean }> {
    const { manifest, chain } = await this.loaded(key, false);
    const cache = this.cache.get(key);
    const head = chain.at(-1);
    if (!head || !cache) throw new BowerError('unknown', SAVE_FAILED);
    const base = { id: manifest.runId, scope: manifest.runScope, requestedAt: manifest.requestedAt };
    const total = manifest.capture.members.length;
    if (TERMINAL.includes(head.phase)) {
      if (!cache.confirmed) {
        const stored = await this.storedView(manifest.scope.rootId);
        cache.confirmed = sameView(stored?.text ?? null, await this.viewTextOf(key));
      }
      if (cache.confirmed) return { wire: this.viewRun(manifest, head, null), settled: true, going: false };
      const last = [...chain].reverse().find((c) => !TERMINAL.includes(c.phase)) ?? head;
      return { wire: { ...base, phase: last.phase, phaseAt: last.phaseAt, total }, settled: false, going: true };
    }
    return { wire: { ...base, phase: head.phase, phaseAt: head.phaseAt, total }, settled: false, going: true };
  }

  /**
   * The terminal view's run: deterministic in every session, so a rewrite is
   * byte-identical, whether the report came from memory or from a record
   * parsed back. `finishedAt` is the terminal checkpoint's `phaseAt`.
   */
  private viewRun(manifest: RunManifest, head: Checkpoint, report: RunReport | null): RunWire & { report?: RunReport } {
    const run = { id: manifest.runId, scope: manifest.runScope, phase: head.phase, requestedAt: manifest.requestedAt, phaseAt: head.phaseAt, total: manifest.capture.members.length, finishedAt: head.phaseAt };
    if (head.phase === 'failed') return { ...run, failure: B_FAILURE };
    return report ? { ...run, report } : run;
  }

  private async viewTextOf(key: string): Promise<string> {
    const { manifest, chain } = await this.loaded(key, false);
    const head = chain.at(-1);
    if (!head) throw new BowerError('unknown', SAVE_FAILED);
    let report: RunReport | null = null;
    if (head.phase === 'done') {
      const reportHash = head.report.state === 'published' ? head.report.reportHash : null;
      const pending = chain.find((c) => c.report.state === 'pending' && c.report.reportHash === reportHash);
      if (pending?.report.state !== 'pending') throw new BowerError('unknown', SAVE_FAILED);
      report = fixedReport(pending.report.body.report);
    }
    const body: LastRunFile = { v: 1, run: this.viewRun(manifest, head, report) };
    return `${JSON.stringify(body, null, 2)}\n`;
  }

  /** The manifest and committed chain: cached, or read and verified from the folder (always, for a recovery). */
  private async loaded(key: string, fresh: boolean): Promise<{ manifest: RunManifest; chain: Checkpoint[] }> {
    const row = this.row(key);
    const cache = this.cache.get(key);
    if (cache && !fresh && cache.manifest.runId === row.control.runId) return cache;
    const records = this.records(key);
    const manifest = await records.manifest(row.control.runId, row.control.manifestHash);
    const chain = await records.chain(manifest, row.control.manifestHash, row.control.head);
    const kept = this.cache.get(key);
    const same = kept?.manifest.runId === row.control.runId;
    this.cache.set(key, { manifest, chain, confirmed: same ? kept.confirmed : false, notBefore: same ? kept.notBefore : 0, failures: same ? kept.failures : 0 });
    return { manifest, chain };
  }

  private async storedView(rootId: string): Promise<{ file: string; modifiedTime: string; text: string } | null> {
    const all = await this.drive.listAll(rootId);
    const sys = all.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === rootId);
    const file = sys && all.find((f) => !f.folder && f.name === 'last-run.json' && f.parents[0] === sys.id);
    return file ? { file: file.id, modifiedTime: file.modifiedTime, text: await this.drive.readText(file.id) } : null;
  }

  private async viewHash(rootId: string): Promise<string | null> {
    const stored = await this.storedView(rootId);
    return stored ? textHash(stored.text) : null;
  }

  private async systemFolder(attempt: Attempt): Promise<string> {
    const rootId = this.row(attempt.key).binding.rootId;
    const sys = (await this.drive.listAll(rootId)).find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === rootId);
    return sys?.id ?? (await this.fence(attempt).createFolder(rootId, SYSTEM.dir)).id;
  }

  private records(key: string): RunRecords {
    return new RunRecords(this.drive, this.row(key).binding.rootId, this.placed);
  }

  private row(key: string): Row {
    const row = this.rows.get(key);
    if (!row) throw new BowerError('auth', NOT_YOURS);
    return row;
  }

  /** Writes allowed only while this attempt holds the claim (and, for a checkpoint, the head it read). */
  private fence(attempt: Attempt, head?: string): FencedDrive {
    return this.drive.fenced(() => this.check(attempt, head));
  }

  private check(attempt: Attempt, head?: string): void {
    this.authorizeAtBoundary(attempt.key);
    const c = this.rows.get(attempt.key)?.control;
    if (!c?.claim || c.claim.attemptId !== attempt.attemptId || c.claim.epoch !== attempt.epoch || c.claim.expiresAt < this.clock() || (head !== undefined && c.head !== head)) {
      throw new BowerError('conflict', STALE);
    }
  }

  private authorize(binding: Binding): void {
    if (this.revoked.has(keyOf(binding))) throw new BowerError('auth', SIGNED_OUT);
  }

  private authorizeAtBoundary(key: string): void {
    if (this.revoked.has(key)) throw new BowerError('auth', SIGNED_OUT);
  }

  private mint(kind: string): string {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return `${kind}-${this.clock().toString(36)}-${++this.seq}${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  private changed(): void {
    this.onChange?.();
  }
}

/**
 * A report with its keys in one fixed order, whatever object it came from (in
 * memory, or parsed back from a canonical record with its keys sorted).
 */
function fixedReport(r: RunReport): RunReport {
  const out: RunReport = {
    filed: r.filed.map((f) => ({ name: f.name, title: f.title, kind: f.kind, to: f.to, ...(f.note !== undefined ? { note: f.note } : {}) })),
    created: r.created.map((c) => ({ path: c.path, what: c.what })),
    updated: r.updated.map((u) => ({ path: u.path, what: u.what })),
    setAside: r.setAside.map((a) => ({ name: a.name, why: a.why })),
    questions: r.questions.map((q) => ({ id: q.id, text: q.text, yes: q.yes, no: q.no, ...(q.about !== undefined ? { about: q.about } : {}), askedAt: q.askedAt })),
  };
  if (r.yourChanges !== undefined) out.yourChanges = r.yourChanges;
  if (r.requests !== undefined) out.requests = [...r.requests];
  if (r.rulesWorded !== undefined) out.rulesWorded = r.rulesWorded;
  return out;
}

/** Whether two view texts hold the same body, compared in canonical form (key order and spacing aside). */
function sameView(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  const canon = (text: string): string | null => {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(e);
      return null;
    }
    const bytes = canonicalRecordJson(value);
    return bytes.ok ? new TextDecoder().decode(bytes.value) : null;
  };
  const x = canon(a);
  return x !== null && x === canon(b);
}

/** How many admitted run ids a row remembers for the view order. */
const ADMITTED_KEPT = 50;

const RANK: Record<string, number> = { queued: 0, reading: 1, writing: 2, saving: 3, done: 4, failed: 4 };
const rank = (phase: string): number => RANK[phase] ?? 0;

/** A persisted service state, checked before it is trusted. */
function isState(v: unknown): v is { v: 1; seq: number; revoked: string[]; rows: Record<string, Omit<Row, 'admitted'> & { admitted?: string[] }> } {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
  const count = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
  const row = (x: unknown): boolean => {
    if (!x || typeof x !== 'object') return false;
    const r = x as Record<string, unknown>;
    const b = r.binding as Record<string, unknown> | null;
    const c = r.control as Record<string, unknown> | null;
    return !!b && text(b.account) && text(b.rootId) && !!c && text(c.runId) && text(c.requestId) && text(c.manifestHash) && text(c.head)
      && count(c.statusRevision) && count(r.lastEpoch) && (r.viewBefore === null || text(r.viewBefore))
      && Array.isArray(r.crossed) && r.crossed.every(text)
      && (r.admitted === undefined || (Array.isArray(r.admitted) && r.admitted.every(text)));
  };
  return s.v === 1 && count(s.seq) && Array.isArray(s.revoked) && s.revoked.every(text)
    && !!s.rows && typeof s.rows === 'object' && Object.values(s.rows as Record<string, unknown>).every(row);
}
