/**
 * Bower's Worker, faked in the browser: who is signed in, the Bower folder
 * and the runs, over a FakeDrive. A tidy-up is planned once (`planRun`) and
 * admitted to the run service, which owns it on the B path the way the
 * Worker would, across reloads. A run view from before the run service (a
 * legacy `last-run.json`) is only read, and repaired when a reload cut it
 * off; nothing runs or writes outside the service (TL-P2-38).
 */
import { createOwnershipContext } from '../contracts/ownership-format';
import type { FakeDrive } from '../drive/fake-drive';
import { ALEX } from '../demo/fixture';
import { keepSignedIn, keptSignedIn, type Scenario } from '../demo/scenario';
import { thingsIn } from '../piles';
import { NOTHING } from '../spine/admission';
import { planAdmission } from '../spine/plan';
import { fakeRead } from '../spine/read';
import { FOLDER_TEMPLATE, PLACEHOLDER_FILE } from '../contracts/folder-template';
import { PHASE_RANK as RANK } from '../contracts/run-phases';
import { BowerError } from '../types';
import { DriveVault } from '../vault/drive-vault';
import { makeFolder, makeText, updateByStamp } from '../spine/write-once';
import { BOWER_FOLDER, SYSTEM, isRunnerFile, type LastRunFile } from '../vault/layout';
import type { Me, ProcessOptions, RunReply, RunWire, StatusReply, WorkerApi } from '../worker/worker-api';
import { planRun, type HubUpdate } from './fake-runner';
import type { AuthoredState } from '../spine/scripted';
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
  /** The Current states the scripted reply updates; none by default. */
  states?: readonly AuthoredState[];
}

export class FakeWorker implements WorkerApi {
  private readonly drive: FakeDrive;
  private rootId: string | null;
  private signedIn: boolean;
  private failOnce: boolean;
  /** The Worker answers 500 to the first press (the start-fails situation); the next press works. */
  private startFails: boolean;
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
  private readonly states: readonly AuthoredState[] | undefined;
  /** The place this client last held the lease for, and its epoch: what the real Worker reads from the request. */
  private holder: { place: string; epoch: number } | null = null;
  /** The ids reserved for a template still being made: a retry reuses them, so what landed is found again, not made twice. */
  private templateIds: string[] | null = null;

  constructor(opts: FakeWorkerOptions) {
    this.drive = opts.drive;
    this.rootId = opts.rootId;
    this.signedIn = keptSignedIn() ?? opts.scenario !== 'signed-out';
    this.failOnce = opts.scenario === 'fail-run';
    this.startFails = opts.scenario === 'start-fails';
    this.offline = !!opts.offline;
    this.runs = opts.runs;
    this.account = opts.account ?? ALEX.email;
    this.lease = opts.lease ?? null;
    this.updates = opts.updates;
    this.states = opts.states;
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

  /** The contracts' folder template: the five main folders, Rules.md, About me.md and Bower's own folder. */
  async createFolder(): Promise<{ id: string; found: boolean }> {
    this.fenced();
    // After a deleted account, the folder it had is found again, as the Worker finds it in the Drive.
    const found = forgotten();
    forget(false);
    if (this.rootId) return { id: this.rootId, found };
    const d = this.drive;
    // The contracts' template, as the real Worker creates it: one call reserves the folder's id and one per template
    // folder and file, and each is made by its id (`write-once.ts`), so a lost answer is found again, never made twice.
    const files = FOLDER_TEMPLATE.filter((f) => !f.path.endsWith(`/${PLACEHOLDER_FILE}`) && f.path !== PLACEHOLDER_FILE);
    const paths = [...new Set(FOLDER_TEMPLATE.flatMap((f) => f.path.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))))];
    // shortcut: kept in memory only, a reload mid-creation reserves new ids (honest limit, no recovery UI).
    this.templateIds ??= await d.generateIds(1 + paths.length + files.length);
    const [rootId, ...rest] = this.templateIds;
    const ids = new Map([...paths, ...files.map((f) => f.path)].map((p, i) => [p, rest[i]]));
    const root = (await makeFolder(d, d, { parent: 'root', name: BOWER_FOLDER, ...(rootId ? { id: rootId } : {}) })).id;
    const folders = new Map<string, string>([['', root]]);
    const folder = async (path: string): Promise<string> => {
      const known = folders.get(path);
      if (known !== undefined) return known;
      const cut = path.lastIndexOf('/');
      const id = ids.get(path);
      const made = await makeFolder(d, d, { parent: await folder(cut < 0 ? '' : path.slice(0, cut)), name: path.slice(cut + 1), ...(id ? { id } : {}) });
      folders.set(path, made.id);
      return made.id;
    };
    for (const file of FOLDER_TEMPLATE) {
      const cut = file.path.lastIndexOf('/');
      const parent = await folder(cut < 0 ? '' : file.path.slice(0, cut));
      const id = ids.get(file.path);
      if (file.path.slice(cut + 1) !== PLACEHOLDER_FILE) await makeText(d, d, { parent, name: file.path.slice(cut + 1), ...(file.appProperties ? { props: file.appProperties } : {}), ...(id ? { id } : {}) }, file.content);
    }
    this.rootId = root;
    this.templateIds = null;
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

  async process(scope: 'all' | 'instructions', opts: ProcessOptions = {}): Promise<RunReply> {
    const run = await this.admit(scope, opts);
    // An answer kept for the end of the run going (TL-P4-13 addendum), as the real Worker answers it.
    const waits = opts.requestId !== undefined && (this.waiting?.requestIds.includes(opts.requestId) ?? false);
    return waits ? { ...this.stamp(run), waits: true } : this.stamp(run);
  }

  /**
   * The answers that came while a run was going (TL-P4-13 addendum): the real Worker's person object starts their one
   * run at that run's end, from its alarm; here the first status after the end does.
   */
  private waiting: { requestIds: string[]; subjects: string[]; allowWeb: boolean } | null = null;

  private async admit(scope: 'all' | 'instructions', opts: ProcessOptions): Promise<RunWire> {
    this.online();
    this.fenced();
    await this.loaded;
    if (this.loadFailure) throw this.loadFailure.error;
    if (this.startFails) {
      this.startFails = false;
      console.error('Worker answered 500 for POST /process');
      throw new BowerError('unknown', "Something went wrong on Bower's side. Try again later.");
    }
    // A repeat of a press answers that press's run, ended or not, and changes nothing (TL-P3-15).
    const repeat = opts.requestId === undefined ? null : await this.pressed(opts.requestId);
    if (repeat) return repeat;
    this.lastAllowWeb = !!opts.allowWeb;
    // A run on the B path that is not over is the run, whichever client asked for it: nothing new is admitted.
    const going = await this.goingOnB();
    if (going && opts.answer && opts.requestId !== undefined) {
      const w = this.waiting ?? { requestIds: [], subjects: [], allowWeb: false };
      if (!w.requestIds.includes(opts.requestId)) {
        this.waiting = { requestIds: [...w.requestIds, opts.requestId], subjects: opts.subject === undefined || w.subjects.includes(opts.subject) ? w.subjects : [...w.subjects, opts.subject], allowWeb: !!opts.allowWeb };
      }
    }
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

  private async begin(scope: 'all' | 'instructions', opts: ProcessOptions & { subjects?: readonly string[] }): Promise<RunWire> {
    const root = this.rootId;
    if (!root) throw new BowerError('not-found', 'Your Bower folder is not there any more.');
    const context = createOwnershipContext();
    const vault = new DriveVault({ drive: this.drive, rootId: async () => root, runningPiles: () => new Set(), device: 'worker' });
    if (scope === 'all' && !(await vault.piles(context)).reduce((n, p) => n + thingsIn(p), 0)) throw new BowerError('conflict', 'Nothing is waiting in the inbox.');
    // Planned once, before any effect, and admitted whole on the B path, the only one (TL-P2-38): planning holds the
    // piles it cannot take and refuses, before admission, what Bower's own checks refuse.
    const minted = this.runs.ids();
    const runId = minted.runId;
    const requestId = opts.requestId ?? minted.requestId;
    // An answer's run takes only the pile that holds its subject (TL-P4-08 addendum 8), admitted as the Worker does.
    const subjects = [...(opts.subject !== undefined ? [opts.subject] : []), ...(opts.subjects ?? [])];
    const scoped = !subjects.length ? null : await planAdmission(fakeRead(this.drive), root, { context, scope, subjects, clock: () => Date.now(), newId: () => requestId });
    if (scoped?.kind === 'nothing') throw new BowerError('conflict', NOTHING[scoped.cause]);
    const plan = await planRun(this.drive, root, { context, scope, allowWeb: !!opts.allowWeb, runId, requestId, requestedAt: Date.now(), ...(scoped ? { taken: scoped.manifest } : {}), ...(this.updates ? { updates: this.updates } : {}), ...(this.states ? { states: this.states } : {}) });
    const failAt = this.failOnce;
    this.failOnce = false;
    const wire = await this.runs.admit(this.binding(root), plan.manifest, { context, ...(failAt ? { failAt: 'writing' as const } : {}) });
    this.onB = true;
    if (opts.requestId !== undefined) this.presses.set(opts.requestId, { ...wire });
    // A press on the whole inbox takes the answers that waited too.
    if (this.waiting && scope === 'all' && !subjects.length && !opts.answer) {
      for (const id of this.waiting.requestIds) this.presses.set(id, { ...wire });
      this.waiting = null;
    }
    return wire;
  }

  async status(): Promise<StatusReply> {
    const run = await this.latest();
    // A run that ended with a granted answer still in your changes (its write refused at the write itself): it waits
    // as an answer that came during the run, so its run starts now, with no press (TL-P4-19 addendum 15).
    if (run?.phase === 'done' && this.onB && this.rootId && this.runs.stayed(this.binding(this.rootId), run.id)) {
      this.waiting ??= { requestIds: [], subjects: [], allowWeb: false };
    }
    if (this.waiting && (!run || ['done', 'failed'].includes(run.phase))) {
      const next = await this.startWaiting(this.waiting);
      if (next) return this.stamp(next);
    }
    return this.stamp(run);
  }

  /** The one run of the answers that waited, scoped to their subjects (your changes alone when none has one). */
  private async startWaiting(w: { requestIds: string[]; subjects: string[]; allowWeb: boolean }): Promise<RunWire | null> {
    this.waiting = null;
    try {
      const wire = await this.begin(w.subjects.length ? 'all' : 'instructions', { allowWeb: w.allowWeb, subjects: w.subjects });
      for (const id of w.requestIds) this.presses.set(id, { ...wire });
      return wire;
    } catch (e) {
      // The answers stay in your changes for the next tidy-up; the reason is logged, as the Worker logs it.
      console.error('the answers that waited could not start their tidy-up', e);
      return null;
    }
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
    const d = this.drive;
    if (file) await updateByStamp(d, file, { text }, (op) => d.writeText(file.id, text, file.modifiedTime, op));
    else await makeText(d, d, { parent: sys?.id ?? (await makeFolder(d, d, { parent: root, name: SYSTEM.dir })).id, name: 'last-run.json' }, text);
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
      const context = createOwnershipContext();
      const plan = await planRun(this.drive, root, { context, scope: 'all', allowWeb: false, runId, requestId, requestedAt: Date.now() - 70_000, ...(this.updates ? { updates: this.updates } : {}), ...(this.states ? { states: this.states } : {}) });
      await this.runs.admit(this.binding(root), plan.manifest, { context });
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
