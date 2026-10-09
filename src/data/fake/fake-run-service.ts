/**
 * The fake run service: the backend's side of a tidy-up on the B path, owned
 * independently of any client page (TL-P2-06 §2, contract B "Trusted scope").
 * One control row per account and folder holds the admitted run, its committed
 * checkpoint head, the current claim with its epoch and the outstanding
 * dispatch. A run is admitted only after its manifest and first checkpoint are
 * confirmed in the folder; then one attempt at a time, under an unexpired
 * claim, applies it with the runner's engine (`spine/engine.ts`) over the fake
 * Drive's adapter (`FakeRunDrive`): one opening and one closing checkpoint per
 * batch, every effect stamped with its operation, and each write fenced, so a
 * stale epoch or a revoked session is refused in the same step as the change.
 * Recovery belongs to the service: `status()` (and so `process()`) issues a
 * new claim with a greater epoch when no live attempt holds one; the engine
 * reads back what an earlier attempt may have sent by its stamp, never plans
 * again, and the report is rebuilt from the durable plan. Public `done`
 * and `failed` are derived: only once the head is terminal and the
 * `.bower/last-run.json` view matches its exact body (TL-P2-06 §3, TL-P2-10 §2).
 *
 * Fake only: the control store is this object (kept by the pretend source in
 * sessionStorage), the fence is the fake Drive's, and a fenced change applies
 * at the instant it passes the check. It proves no real Drive CAS or
 * exactly-once delivery.
 */
import type { FakeDrive, FencedDrive } from '../drive/fake-drive';
import type { Checkpoint } from '../contracts/run-checkpoint';
import type { OperationV2 } from '../contracts/run-manifest';
import { PHASE_MS, type TimeScale } from '../demo/scenario';
import { BowerError, type RunReport } from '../types';
import { SYSTEM, isRunnerFile, type LastRunFile } from '../vault/layout';
import type { RunWire } from '../worker/worker-api';
import { textHash } from '../spine/grounded';
import { RunRecords, canonical, checkpointName, manifestName, type RunManifest } from '../spine/records';
import { firstCheckpoint, nextCheckpoint, type CheckpointPatch } from '../spine/records';
import { driveEffects, runOperations, type Effects } from '../spine/engine';
import { FakeRunDrive } from './fake-run-drive';
import { finishRun, fixedReport, lastRunText, sameView, saveReport } from '../spine/barrier';
import { checksumOf, md5Hex } from '../contracts/hashes';
import { PHASE_RANK, isRunPhase } from '../contracts/run-phases';
import { B_FAILURE } from '../spine/scripted';

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
  /** Test seam: awaited after an effect's checks and its batch's opening, right before it is sent. */
  hooks?: { beforeDispatch?: (at: DispatchAt) => Promise<void> };
  /** Test seam: how the admitting attempt waits out each phase's pace (a timer by default). */
  sleep?: (ms: number) => Promise<void>;
  /** Makes the rows and the Drive durable together; an admission is acknowledged only after it. */
  persist?: () => Promise<void>;
}

/** A B run that failed: the honest-phase rule guarantees no effect applied (said by the scripted plan's refusal too). */
export { B_FAILURE };

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
const SAVE_FAILED = 'Bower could not save what it did. Try again later.';
const READ_FAILED = 'Bower could not read what it did. Try again later.';
/** Attempts in a row before this instance stops retrying a run that keeps failing; it stays saving. */
const MAX_TRIES = 5;

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
    const first = firstCheckpoint(manifest, m.hash, attempt, this.clock());
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
        statusRevision: 0, claim: { attemptId: attempt.attemptId, epoch: attempt.epoch, expiresAt: this.clock() + CLAIM_MS },
      },
      lastEpoch: attempt.epoch,
      viewBefore,
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
    // A new attempt under a strictly greater epoch: from now on the old one is refused at the boundary.
    const attempt: Attempt = { key, attemptId: this.mint('attempt'), epoch: row.lastEpoch + 1, original: false };
    row.lastEpoch = attempt.epoch;
    row.control.claim = { attemptId: attempt.attemptId, epoch: attempt.epoch, expiresAt: this.clock() + CLAIM_MS };
    row.control.statusRevision++;
    this.changed();
    await this.launch(attempt);
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
      if (head.report.state === 'not-ready') await this.apply(attempt, manifest);
      await pace;
      await this.finish(attempt, manifest);
    } else if (TERMINAL.includes(head.phase)) await this.publish(attempt);
  }

  /**
   * The report barrier the runner ends a run with (`finishRun`): the report record, the dispositions, the report
   * files and the view, each read back, then done in the chain. The view replaces only one this service may replace.
   */
  private async finish(attempt: Attempt, manifest: RunManifest): Promise<void> {
    const row = this.row(attempt.key);
    const { chain } = await this.loaded(attempt.key, false);
    const finished = await finishRun({
      rootId: row.binding.rootId,
      runId: manifest.runId,
      attempt: attempt.epoch,
      records: this.records(attempt.key),
      reads: this.drive,
      checksum: { stored: async (id) => md5Hex(await this.drive.readBytes(id)), of: checksumOf },
      batch: async () => this.fence(attempt),
      admission: null,
      clock: this.clock,
      newId: () => this.mint('attempt'),
      mayReplace: (stored) => this.replaceable(row, stored),
    }, manifest, row.control.manifestHash, chain);
    const head = finished.chain.at(-1);
    if (!head) throw new BowerError('unknown', SAVE_FAILED);
    await this.advance(attempt, head, this.clock());
    const cache = this.cache.get(attempt.key);
    if (cache) {
      cache.chain = finished.chain;
      cache.confirmed = true;
    }
  }

  /**
   * The run's operations, applied by the runner's engine (`runOperations`, `driveEffects`) over the fake Drive's
   * adapter, under this attempt's claim: it reads the chain from the folder and goes on from it, one opening and one
   * closing checkpoint per batch, each effect stamped and read back by that stamp after an interrupted attempt.
   */
  private async apply(attempt: Attempt, manifest: RunManifest): Promise<void> {
    const row = this.row(attempt.key);
    const drive = new FakeRunDrive(this.drive, () => this.check(attempt));
    const effects = driveEffects(drive);
    const hooked: Effects = {
      ...effects,
      apply: (op, head, w, m, sending) => effects.apply(op, head, w, m, async () => {
        await sending();
        await this.hooks?.beforeDispatch?.({ runId: manifest.runId, attemptId: attempt.attemptId, epoch: attempt.epoch, ordinal: op.ordinal, effect: op.effect });
      }),
    };
    // The control row follows the chain as it grows, in order: a recovery reads it from the folder all the same.
    let heads = Promise.resolve();
    const end = await runOperations({
      rootId: row.binding.rootId,
      runId: manifest.runId,
      attempt: attempt.epoch,
      records: new RunRecords(drive.reads(), row.binding.rootId, this.placed),
      batch: async () => drive.fenced(),
      fenced: () => drive.fenced(),
      effects: hooked,
      plan: () => Promise.reject(new BowerError('unknown', SAVE_FAILED)),
      clock: this.clock,
      newId: () => this.mint('attempt'),
      onChain: (chain) => {
        const cache = this.cache.get(attempt.key);
        if (cache) cache.chain = chain;
        const last = chain.at(-1);
        const at = this.clock();
        if (last) heads = heads.then(() => this.advance(attempt, last, at));
      },
    });
    await heads;
    if (end.state === 'failed') {
      console.error(end.why);
      throw new BowerError('unknown', SAVE_FAILED);
    }
  }

  /** The control row's head moves to a checkpoint the engine wrote at `at`, while this attempt holds the claim. */
  private async advance(attempt: Attempt, head: Checkpoint, at: number): Promise<void> {
    const hash = (await canonical(head)).hash;
    const row = this.rows.get(attempt.key);
    if (row?.control.claim?.attemptId !== attempt.attemptId || row.control.head === hash) return;
    row.control.head = hash;
    row.control.statusRevision++;
    row.control.claim.expiresAt = at + CLAIM_MS;
    this.changed();
  }

  /**
   * Publishes the next checkpoint: written through the boundary while this
   * attempt still holds the claim and the head it read, then the control head
   * advances in the same step as a last check. A refused or failed write
   * leaves the head where it was.
   */
  private async commit(attempt: Attempt, head: Checkpoint, patch: CheckpointPatch): Promise<Checkpoint> {
    const row = this.row(attempt.key);
    const expected = row.control.head;
    const next = nextCheckpoint(head, expected, attempt, patch);
    const c = await canonical(next);
    const cache = this.cache.get(attempt.key);
    if (!cache) throw new BowerError('unknown', SAVE_FAILED);
    await this.records(attempt.key).putNew(this.fence(attempt, expected), { runId: next.runId }, checkpointName(next.revision, c.hash), c.text);
    this.check(attempt, expected);
    row.control.head = c.hash;
    row.control.statusRevision++;
    if (row.control.claim) row.control.claim.expiresAt = this.clock() + CLAIM_MS;
    cache.chain = [...cache.chain, next];
    this.changed();
    return next;
  }

  /**
   * The report barrier (`spine/barrier.ts`, shared with the runner): the report files the run changes, then the v1
   * view, each with the modified time it read and read back. It replaces only the view the folder showed at
   * admission; another run's view is never written over, and a mismatch is never taken as confirmation.
   */
  private async publish(attempt: Attempt): Promise<void> {
    const key = attempt.key;
    const row = this.row(key);
    const { text, report } = await this.viewOf(key);
    await saveReport({
      rootId: row.binding.rootId,
      reads: this.drive,
      checksum: { stored: async (id) => md5Hex(await this.drive.readBytes(id)), of: checksumOf },
      batch: async () => this.fence(attempt),
      report,
      view: text,
      mayReplace: (stored) => this.replaceable(row, stored),
    });
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
    return (await this.viewOf(key)).text;
  }

  /** The terminal view's text, and the report it holds (null for a failed run). */
  private async viewOf(key: string): Promise<{ text: string; report: RunReport | null }> {
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
    return { text: lastRunText(body), report };
  }

  /** The manifest and committed chain: cached, or read and verified from the folder (always, for a recovery). */
  private async loaded(key: string, fresh: boolean): Promise<{ manifest: RunManifest; chain: Checkpoint[] }> {
    const row = this.row(key);
    const cache = this.cache.get(key);
    if (cache && !fresh && cache.manifest.runId === row.control.runId) return cache;
    const records = this.records(key);
    const manifest = await records.manifest(row.control.runId, row.control.manifestHash);
    // The folder is the authority (as for the runner): the chain up to its last checkpoint, whoever wrote it.
    const found = await records.found(row.control.runId);
    if (found.kind !== 'run' || found.manifestHash !== row.control.manifestHash || found.head === null) {
      console.error(found.kind === 'broken' ? found.why : `Run ${row.control.runId} has no chain of its own`);
      throw new BowerError('unknown', READ_FAILED);
    }
    const { chain } = found;
    row.control.head = found.head;
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

/** How many admitted run ids a row remembers for the view order. */
const ADMITTED_KEPT = 50;

const rank = (phase: string): number => (isRunPhase(phase) ? PHASE_RANK[phase] : 0);

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
      && (r.admitted === undefined || (Array.isArray(r.admitted) && r.admitted.every(text)));
  };
  return s.v === 1 && count(s.seq) && Array.isArray(s.revoked) && s.revoked.every(text)
    && !!s.rows && typeof s.rows === 'object' && Object.values(s.rows as Record<string, unknown>).every(row);
}
