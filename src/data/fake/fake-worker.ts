/**
 * Bower's Worker, faked in the browser: who is signed in, the Bower folder
 * and the runs, over a FakeDrive. A tidy-up is planned once (`planRun`) and
 * admitted to the run service, which owns it on the B path the way the
 * Worker would, across reloads. A run view from before the run service (a
 * legacy `last-run.json`) is only read, and repaired when a reload cut it
 * off; nothing runs or writes outside the service (TL-P2-38).
 */
import type { FakeDrive } from '../drive/fake-drive';
import { ALEX } from '../demo/fixture';
import { keepSignedIn, keptSignedIn, type Scenario } from '../demo/scenario';
import { thingsIn } from '../piles';
import { BowerError, PARA_ROOTS } from '../types';
import { DriveVault } from '../vault/drive-vault';
import { BOWER_FOLDER, SYSTEM, isRunnerFile, type LastRunFile } from '../vault/layout';
import { serializeNote } from '../vault/note-format';
import { RULES_TEMPLATE } from '../vault/rules-format';
import type { Me, RunReply, RunWire, StatusReply, WorkerApi } from '../worker/worker-api';
import { planRun, type HubUpdate } from './fake-runner';
import type { Binding, FakeRunService } from './fake-run-service';
import type { FakeLease } from './fake-lease';
import { openElsewhere, type LeaseReply, type SessionAction } from '../session';
import type { ReportBody } from './ordered-reports.fixture';

export interface FakeWorkerOptions {
  drive: FakeDrive;
  scenario: Scenario;
  rootId: string | null;
  /** Every call fails as with no network (the offline scenario). */
  offline?: boolean;
  /** False after a reload, when the pretend Drive was kept: the running situation does not start a new run. */
  fresh?: boolean;
  /** The run service that owns every run, on the B path. */
  runs: FakeRunService;
  /** The synthetic account this client is signed in as. */
  account?: string;
  /** The person's session lease (TL-P2-14); without it this client is never fenced. */
  lease?: FakeLease;
  /** The hub notes a full B run brings up to date; the demo's two by default. */
  updates?: readonly HubUpdate[];
}

export class FakeWorker implements WorkerApi {
  private readonly drive: FakeDrive;
  private rootId: string | null;
  private signedIn: boolean;
  private failOnce: boolean;
  /** A run view from before the run service (a legacy `last-run.json`): read on load, never run or written by a run. */
  private record: RunWire | null = null;
  private loaded: Promise<void>;
  private loadFailure: { error: unknown } | null = null;
  private readonly offline: boolean;
  private readonly runs: FakeRunService;
  private readonly account: string;
  /** Whether the latest run here is the service's; false while the folder shows only a legacy record, or none. */
  private onB = false;
  private readonly lease: FakeLease | null;
  private readonly updates: readonly HubUpdate[] | undefined;
  /** The place this client last held the lease for, and its epoch: what the real Worker reads from the request. */
  private holder: { place: string; epoch: number } | null = null;

  constructor(opts: FakeWorkerOptions) {
    this.drive = opts.drive;
    this.rootId = opts.rootId;
    this.signedIn = keptSignedIn() ?? opts.scenario !== 'signed-out';
    this.failOnce = opts.scenario === 'fail-run';
    this.offline = !!opts.offline;
    this.runs = opts.runs;
    this.account = opts.account ?? ALEX.email;
    this.lease = opts.lease ?? null;
    this.updates = opts.updates;
    // Offline, the folder cannot be read now; every call says so on its own.
    this.loaded = this.offline ? Promise.resolve() : this.load(opts.scenario, opts.fresh ?? true).catch((e: unknown) => {
      console.error(e);
      this.loadFailure = { error: e };
    });
  }

  /** The piles the tidy-up going now took; empty when none is going. */
  runningPiles(): ReadonlySet<string> {
    return this.onB && this.rootId ? this.runs.runningPiles(this.binding(this.rootId)) : new Set();
  }

  async me(): Promise<Me | null> {
    this.online();
    return this.signedIn ? { user: ALEX, folderId: forgotten() ? null : this.rootId } : null;
  }

  async signIn(): Promise<void> {
    this.signedIn = true;
    keepSignedIn(true);
  }

  async signOut(): Promise<void> {
    this.signedIn = false;
    keepSignedIn(false);
  }

  /** The pretend Worker forgets the person; the pretend Drive keeps the folder, as Google would. */
  async deleteAccount(): Promise<void> {
    this.online();
    this.fenced();
    // The person is gone, and so is their lease (the real Worker's DELETE /me must do the same: P3).
    const holder = this.holder;
    if (this.lease && holder) await this.lease.session(holder.place, 'leave');
    this.holder = null;
    this.signedIn = false;
    keepSignedIn(false);
    // It forgets which folder was yours too: coming back starts at the folder step, which finds it again.
    forget(true);
  }

  /** The person's one active place (TL-P2-14); without a lease every place is active. */
  async session(place: string, action: SessionAction, gen?: number): Promise<LeaseReply> {
    this.online();
    if (!this.lease) return { active: action !== 'leave', epoch: 0 };
    const reply = await this.lease.session(place, action, gen);
    if (reply.active) this.holder = { place, epoch: reply.epoch };
    else if (this.holder?.place === place) this.holder = null;
    return reply;
  }

  /** The Worker's own fence on its endpoints: a place that does not hold the live lease gets one plain error. */
  private fenced(): void {
    if (this.lease && !this.lease.holds(this.holder?.place ?? null, this.holder?.epoch ?? null)) throw openElsewhere();
  }

  async driveToken(): Promise<string> {
    if (!this.signedIn) throw new BowerError('auth', 'Sign in again to keep going.');
    return 'fake-token';
  }

  /** The template: the five main folders, Rules.md, About me.md and Bower's own folder. */
  async createFolder(): Promise<{ id: string; found: boolean }> {
    this.fenced();
    // After a deleted account, the folder it had is found again, as the Worker finds it in the Drive.
    const found = forgotten();
    forget(false);
    if (this.rootId) return { id: this.rootId, found };
    const d = this.drive;
    const root = (await d.createFolder('root', BOWER_FOLDER)).id;
    for (const r of PARA_ROOTS) await d.createFolder(root, r);
    await d.createText(root, 'Rules.md', RULES_TEMPLATE.text, { ...RULES_TEMPLATE.appProperties });
    const about = serializeNote({ summary: 'What Bower knows about you. Change it whenever you like.', properties: [], tags: [], currentState: [], body: 'Write a few lines about yourself: where you live, what you do, who is in your life.', timeline: [], byBower: false });
    await d.createText(root, 'About me.md', about);
    const sys = (await d.createFolder(root, '.bower')).id;
    await d.createFolder(sys, 'changes');
    await d.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
    await d.createText(sys, 'suggestions.json', '{ "v": 1, "suggestions": [] }\n');
    await d.createText(sys, 'requests.json', '{ "v": 1, "done": [] }\n');
    await d.createText(sys, 'hashes.json', '{ "v": 1, "hashes": {} }\n');
    this.rootId = root;
    return { id: root, found: false };
  }

  /** What the last tidy-up was told about the web, for tests (the pretend runner never goes online). */
  lastAllowWeb = false;

  /** The revision the real Worker keeps with the run: it rises each time the run it shows changes, and never falls. */
  private revision = 0;
  private shown = 'null';

  private stamp<T extends RunWire | null>(run: T): { run: T; revision: number } {
    const now = JSON.stringify(run);
    if (now !== this.shown) {
      this.shown = now;
      this.revision++;
    }
    return { run, revision: this.revision };
  }

  async process(scope: 'all' | 'instructions', opts: { allowWeb?: boolean; requestId?: string } = {}): Promise<RunReply> {
    return this.stamp(await this.admit(scope, opts));
  }

  private async admit(scope: 'all' | 'instructions', opts: { allowWeb?: boolean; requestId?: string }): Promise<RunWire> {
    this.online();
    this.fenced();
    await this.loaded;
    if (this.loadFailure) throw this.loadFailure.error;
    // A repeat of a press answers that press's run, ended or not, and changes nothing (TL-P3-15).
    const repeat = opts.requestId === undefined ? null : await this.pressed(opts.requestId);
    if (repeat) return repeat;
    this.lastAllowWeb = !!opts.allowWeb;
    // A run on the B path that is not over is the run, whichever client asked for it: nothing new is admitted.
    const going = await this.goingOnB();
    if (going) return going;
    // Quick repeated asks share one admission.
    this.starting ??= this.begin(scope, opts).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private starting: Promise<RunWire> | null = null;
  /** Each press's run, by its requestId, as last seen (the real Worker keeps this in the person object). */
  private readonly presses = new Map<string, RunWire>();

  /** The run a press admitted, brought up to date while it is still the service's current one; null for a new press. */
  private async pressed(requestId: string): Promise<RunWire | null> {
    const known = this.presses.get(requestId);
    if (!known) return null;
    const now = this.rootId ? await this.runs.status(this.binding(this.rootId)) : null;
    const run = now?.id === known.id ? now : known;
    this.presses.set(requestId, run);
    return { ...run };
  }

  /** The service's run for this folder while it is not over, or null. */
  private async goingOnB(): Promise<RunWire | null> {
    if (!this.rootId) return null;
    const run = await this.runs.status(this.binding(this.rootId));
    if (!run || ['done', 'failed'].includes(run.phase)) return null;
    this.onB = true;
    return run;
  }

  private async begin(scope: 'all' | 'instructions', opts: { allowWeb?: boolean; requestId?: string }): Promise<RunWire> {
    const root = this.rootId;
    if (!root) throw new BowerError('not-found', 'Your Bower folder is not there any more.');
    const vault = new DriveVault({ drive: this.drive, rootId: async () => root, runningPiles: () => new Set(), device: 'worker' });
    if (scope === 'all' && !(await vault.piles()).reduce((n, p) => n + thingsIn(p), 0)) throw new BowerError('conflict', 'Nothing is waiting in the inbox.');
    // Planned once, before any effect, and admitted whole on the B path, the only one (TL-P2-38): planning holds the
    // piles it cannot take and refuses, before admission, what Bower's own checks refuse.
    const minted = this.runs.ids();
    const runId = minted.runId;
    const requestId = opts.requestId ?? minted.requestId;
    const plan = await planRun(this.drive, root, { scope, allowWeb: !!opts.allowWeb, runId, requestId, requestedAt: Date.now(), ...(this.updates ? { updates: this.updates } : {}) });
    const failAt = this.failOnce;
    this.failOnce = false;
    const wire = await this.runs.admit(this.binding(root), plan.manifest, failAt ? { failAt: 'writing' } : {});
    this.onB = true;
    if (opts.requestId !== undefined) this.presses.set(opts.requestId, { ...wire });
    return wire;
  }

  async status(): Promise<StatusReply> {
    return this.stamp(await this.latest());
  }

  private async latest(): Promise<RunWire | null> {
    this.online();
    await this.loaded;
    if (this.loadFailure) throw this.loadFailure.error;
    if (this.onB && this.rootId) return this.runs.status(this.binding(this.rootId));
    return this.record ? { ...this.record } : null;
  }

  private binding(rootId: string): Binding {
    return { account: this.account, rootId };
  }

  /** Writes a repaired legacy view back to the folder: only a run a reload cut off, now failed. */
  private async writeLastRun(root: string, run: RunWire): Promise<void> {
    const text = lastRunText(run);
    const all = await this.drive.listAll(root);
    const sys = all.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === root);
    const file = sys && all.find((f) => f.name === 'last-run.json' && f.parents[0] === sys.id);
    if (file) await this.drive.writeText(file.id, text, file.modifiedTime);
    else await this.drive.createText(sys?.id ?? (await this.drive.createFolder(root, SYSTEM.dir)).id, 'last-run.json', text);
  }

  /**
   * The last run, when the folder has one (the "back" scenario): the service's, or a legacy record, read and, when a
   * reload cut it off, repaired as failed. The running situation admits its run on the B path.
   */
  private async load(scenario: Scenario, fresh: boolean): Promise<void> {
    const root = this.rootId;
    if (!root) return;
    const all = await this.drive.listAll(root);
    const sys = all.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === root);
    const file = sys && all.find((f) => f.name === 'last-run.json' && f.parents[0] === sys.id);
    // The service's run is the latest when the folder shows no view yet, its own, or the one it found at admission.
    if (await this.runs.shows(this.binding(root), file ? await this.drive.readText(file.id) : null)) {
      this.onB = true;
      return;
    }
    if (file) {
      let value: unknown;
      try {
        value = JSON.parse(await this.drive.readText(file.id));
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
        console.error(e);
        throw new BowerError('unknown', 'Bower could not read its latest update. Try again.');
      }
      if (!isRunnerFile(SYSTEM.lastRun, value)) {
        console.error(`${SYSTEM.lastRun} has an unsupported shape`);
        throw new BowerError('unknown', 'Bower could not read its latest update. Try again.');
      }
      const { report: _report, ...run } = value.run;
      this.record = run;
      // A run still going in the folder was cut short by a reload: the runner that ran it is gone.
      if (!['done', 'failed'].includes(run.phase)) {
        const now = Date.now();
        // Filing happens while saving: cut there, some things may have moved already.
        const failure =
          run.phase === 'saving'
            ? 'The tidy-up stopped when the page was reloaded, while it was putting things away. Some things may be in their new places already; the rest is still in your inbox. Tidy up again.'
            : 'The tidy-up stopped when the page was reloaded. Nothing was moved; tidy up again.';
        const repaired: RunWire = { ...run, phase: 'failed', phaseAt: now, finishedAt: now, failure };
        await this.writeLastRun(root, { ...value.run, ...repaired });
        this.record = repaired;
      }
    }
    if (scenario === 'running' && fresh) await this.startRunning(root);
  }

  /**
   * The running situation's run (TL-P2-37): asked for 70 s ago, as on the demo, and admitted on the B path like any
   * other, so it recovers like any other. A plan that cannot be admitted starts no run; it is logged.
   */
  private async startRunning(root: string): Promise<void> {
    try {
      const { runId, requestId } = this.runs.ids();
      const plan = await planRun(this.drive, root, { scope: 'all', allowWeb: false, runId, requestId, requestedAt: Date.now() - 70_000, ...(this.updates ? { updates: this.updates } : {}) });
      await this.runs.admit(this.binding(root), plan.manifest);
      this.onB = true;
    } catch (e) {
      // The situation starts with no run going; the person can still tidy up.
      console.error(e);
    }
  }

  private online(): void {
    if (this.offline) throw new BowerError('offline', "You're offline.");
  }
}

/** The exact text of the run's view in the folder; the same run always gives the same bytes. */
function lastRunText(run: LastRunFile['run']): string {
  const body: LastRunFile = { v: 1, run: { ...run } };
  return `${JSON.stringify(body, null, 2)}\n`;
}

/** Kept with the pretend Drive (a new one forgets it): the pretend Worker deleted the account. */
const FORGOT = 'bower:fake:forgot-folder';
function forgotten(): boolean {
  try {
    return sessionStorage.getItem(FORGOT) === '1';
  } catch {
    // expected: no storage; the account was never deleted in this tab.
    return false;
  }
}
function forget(yes: boolean): void {
  try {
    if (yes) sessionStorage.setItem(FORGOT, '1');
    else sessionStorage.removeItem(FORGOT);
  } catch (e) {
    console.error(e);
  }
}

const RANK: Record<RunWire['phase'], number> = { queued: 0, reading: 1, writing: 2, saving: 3, done: 4, failed: 4 };

/** What a report answers: the run and revision when taken, or the refusal the Worker would give. */
export type LedgerAnswer = { status: 200; reply: RunReply } | { status: 409; code: 'stale-report' | 'stale-attempt'; reply: RunReply };

/**
 * The Worker's report ordering (worker contract, "Runner wire"), kept for a run's reports in the fake: what a runner's
 * reports do to the run a person sees and to its revision.
 */
export class ReportLedger {
  private run: RunWire;
  private revision = 1;
  private attempt = 1;
  private lastSeq: number | null = null;
  private lastPhase: RunWire['phase'] | null = null;

  constructor(run: RunWire) {
    this.run = { ...run };
  }

  /** A new attempt: from now on the older one is refused, and the new one counts its own reports from the start. */
  takeover(attempt: number): void {
    this.attempt = attempt;
    this.lastSeq = null;
    this.lastPhase = null;
  }

  /**
   * As the Worker's `runnerReport`: an older attempt, a lower `seq`, a phase behind the attempt's own last one or an
   * ended run is refused; a phase behind the run's own (a later attempt starting over) is kept and shows nothing;
   * otherwise the run takes it, and the revision rises only when the run shows something new.
   */
  report(r: ReportBody): LedgerAnswer {
    const now = (): RunReply => ({ run: { ...this.run }, revision: this.revision });
    if (r.attempt !== this.attempt) return { status: 409, code: 'stale-attempt', reply: now() };
    if (r.seq === this.lastSeq) return { status: 200, reply: now() };
    const late = this.lastSeq !== null && r.seq < this.lastSeq;
    const behindItself = this.lastPhase !== null && RANK[r.phase] < RANK[this.lastPhase];
    if (late || behindItself || ['done', 'failed'].includes(this.run.phase)) return { status: 409, code: 'stale-report', reply: now() };
    this.lastSeq = r.seq;
    this.lastPhase = r.phase;
    if (RANK[r.phase] < RANK[this.run.phase]) return { status: 200, reply: now() };
    const total = r.total ?? this.run.total;
    const shows = r.phase !== this.run.phase || total !== this.run.total || r.failure !== this.run.failure;
    if (!shows) return { status: 200, reply: now() };
    const at = this.run.phaseAt + 1;
    const { total: _total, failure: _failure, ...rest } = this.run;
    this.run = {
      ...rest,
      phase: r.phase,
      phaseAt: r.phase === this.run.phase ? this.run.phaseAt : at,
      ...(total === undefined ? {} : { total }),
      ...(r.failure === undefined ? {} : { failure: r.failure }),
      ...(r.phase === 'done' || r.phase === 'failed' ? { finishedAt: at } : {}),
    };
    this.revision++;
    return { status: 200, reply: now() };
  }
}
