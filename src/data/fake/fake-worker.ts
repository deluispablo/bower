/**
 * Bower's Worker, faked in the browser: who is signed in, the Bower folder
 * and the runs, over a FakeDrive. A tidy-up runs `runFake` on the scenario's
 * clock, the way GitHub Actions would run the real runner, and the run's
 * state is kept here the way the Worker keeps it.
 */
import type { FakeDrive } from '../drive/fake-drive';
import { ALEX } from '../demo/fixture';
import { keepSignedIn, keptSignedIn, type Scenario, type TimeScale } from '../demo/scenario';
import { thingsIn } from '../piles';
import { BowerError, PARA_ROOTS, type RunReport } from '../types';
import { DriveVault } from '../vault/drive-vault';
import { BOWER_FOLDER, PROP, SYSTEM, isRunnerFile, type LastRunFile } from '../vault/layout';
import { serializeNote } from '../vault/note-format';
import { serializeRules } from '../vault/rules-format';
import type { Me, RunWire, WorkerApi } from '../worker/worker-api';
import { planRun, runFake } from './fake-runner';
import type { Binding, FakeRunService } from './fake-run-service';
import type { FakeLease } from './fake-lease';
import { openElsewhere, type LeaseReply, type SessionAction } from '../session';

export interface FakeWorkerOptions {
  drive: FakeDrive;
  scenario: Scenario;
  scale: TimeScale;
  rootId: string | null;
  /** Every call fails as with no network (the offline scenario). */
  offline?: boolean;
  /** False after a reload, when the pretend Drive was kept: the running situation does not start a new run. */
  fresh?: boolean;
  /** The run service that owns runs on the B path; without it every run is legacy. */
  runs?: FakeRunService;
  /** The synthetic account this client is signed in as. */
  account?: string;
  /** The person's session lease (TL-P2-14); without it this client is never fenced. */
  lease?: FakeLease;
}

export class FakeWorker implements WorkerApi {
  private readonly drive: FakeDrive;
  private readonly scale: TimeScale;
  private rootId: string | null;
  private signedIn: boolean;
  private failOnce: boolean;
  private run: (RunWire & { report?: RunReport }) | null = null;
  /**
   * A finished run whose end view could not be saved, kept to save this very object again; it is never
   * planned or filed again. A done run stays saving until then; a failed one shows its failure at once.
   */
  private unsaved: { root: string; run: RunWire & { report?: RunReport }; end: RunWire & { report?: RunReport }; nextAt: number } | null = null;
  private retrying: Promise<void> | null = null;
  private loaded: Promise<void>;
  private loadFailure: { error: unknown } | null = null;
  private took = new Set<string>();
  private seq = 0;
  private readonly offline: boolean;
  private readonly runs: FakeRunService | null;
  private readonly account: string;
  /** Which path the latest run here took: the service's B path, or the legacy runner in this page. */
  private via: 'b' | 'legacy' | null = null;
  private readonly lease: FakeLease | null;
  /** The place this client last held the lease for, and its epoch: what the real Worker reads from the request. */
  private holder: { place: string; epoch: number } | null = null;

  constructor(opts: FakeWorkerOptions) {
    this.drive = opts.drive;
    this.scale = opts.scale;
    this.rootId = opts.rootId;
    this.signedIn = keptSignedIn() ?? opts.scenario !== 'signed-out';
    this.failOnce = opts.scenario === 'fail-run';
    this.offline = !!opts.offline;
    this.runs = opts.runs ?? null;
    this.account = opts.account ?? ALEX.email;
    this.lease = opts.lease ?? null;
    // Offline, the folder cannot be read now; every call says so on its own.
    this.loaded = this.offline ? Promise.resolve() : this.load(opts.scenario, opts.fresh ?? true).catch((e: unknown) => {
      console.error(e);
      this.loadFailure = { error: e };
    });
  }

  /** The piles the tidy-up going now took; empty when none is going. */
  runningPiles(): ReadonlySet<string> {
    if (this.via === 'b' && this.runs && this.rootId) return this.runs.runningPiles(this.binding(this.rootId));
    return this.run && !['done', 'failed'].includes(this.run.phase) ? this.took : new Set();
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
  async session(place: string, action: SessionAction): Promise<LeaseReply> {
    this.online();
    if (!this.lease) return { active: action !== 'leave', epoch: 0 };
    const reply = await this.lease.session(place, action);
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
    await d.createText(root, 'Rules.md', serializeRules([]), { [PROP.by]: 'bower' });
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

  async process(scope: 'all' | 'instructions', opts: { allowWeb?: boolean } = {}): Promise<RunWire> {
    this.online();
    this.fenced();
    await this.loaded;
    if (this.loadFailure) throw this.loadFailure.error;
    this.lastAllowWeb = !!opts.allowWeb;
    await this.saveUnsaved();
    if (this.via !== 'b' && this.run && !['done', 'failed'].includes(this.run.phase)) return this.wire();
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

  /** The service's run for this folder while it is not over, or null. */
  private async goingOnB(): Promise<RunWire | null> {
    if (!this.runs || !this.rootId) return null;
    const run = await this.runs.status(this.binding(this.rootId));
    if (!run || ['done', 'failed'].includes(run.phase)) return null;
    this.via = 'b';
    return run;
  }

  private async begin(scope: 'all' | 'instructions', opts: { allowWeb?: boolean }): Promise<RunWire> {
    const root = this.rootId;
    if (!root) throw new BowerError('not-found', 'Your Bower folder is not there any more.');
    const vault = new DriveVault({ drive: this.drive, rootId: async () => root, runningPiles: () => new Set(), device: 'worker' });
    if (scope === 'all' && !(await vault.piles()).reduce((n, p) => n + thingsIn(p), 0)) throw new BowerError('conflict', 'Nothing is waiting in the inbox.');
    if (scope === 'instructions' && !(await vault.changes()).length) throw new BowerError('conflict', 'There is nothing new for Bower to read.');
    if (this.runs) {
      // Classified once, before any effect: the whole run is B or the whole run is legacy.
      const { runId, requestId } = this.runs.ids();
      const plan = await planRun(this.drive, root, { scope, allowWeb: !!opts.allowWeb, runId, requestId, requestedAt: Date.now() });
      if (plan.path === 'b') {
        const failAt = this.failOnce;
        this.failOnce = false;
        const wire = await this.runs.admit(this.binding(root), plan.manifest, failAt ? { failAt: 'writing' } : {});
        this.via = 'b';
        return wire;
      }
      // Another client's run may have been admitted while this one planned.
      const going = await this.goingOnB();
      if (going) return going;
    }
    this.via = 'legacy';
    return this.start(root, scope, Date.now());
  }

  async status(): Promise<RunWire | null> {
    this.online();
    await this.loaded;
    if (this.loadFailure) throw this.loadFailure.error;
    await this.saveUnsaved();
    if (this.via === 'b' && this.runs && this.rootId) return this.runs.status(this.binding(this.rootId));
    return this.run ? this.wire() : null;
  }

  private binding(rootId: string): Binding {
    return { account: this.account, rootId };
  }

  private start(root: string, scope: 'all' | 'instructions', at: number, readingFor?: number): RunWire {
    this.via = 'legacy';
    const run: RunWire & { report?: RunReport } = { id: `run-${Date.now().toString(36)}-${++this.seq}`, scope, phase: 'queued', requestedAt: at, phaseAt: Date.now() };
    this.run = run;
    this.unsaved = null;
    this.took = new Set();
    const failOnce = this.failOnce;
    this.failOnce = false;
    void runFake(this.drive, root, {
      scope,
      scale: this.scale,
      failOnce,
      took: (ids) => (this.took = new Set(ids)),
      ...(readingFor !== undefined ? { readingFor } : {}),
      onPhase: async (phase, total) => {
        run.phase = phase;
        run.phaseAt = Date.now();
        if (total !== undefined) run.total = total;
        // Each phase is in the folder too, so a reload knows a run was going.
        await this.writeLastRun(root, run).catch((e: unknown) => console.error(e));
      },
    })
      .then(
        (out): RunWire & { report?: RunReport } => {
          const now = Date.now();
          const end = { ...run, phase: out.phase, phaseAt: now, finishedAt: now };
          return out.phase === 'done' ? { ...end, report: out.report } : { ...end, failure: out.failure };
        },
        (e: unknown): RunWire => {
          console.error(e);
          const now = Date.now();
          return { ...run, phase: 'failed', failure: 'Bower stopped before it could finish. Nothing was lost; try again.', phaseAt: now, finishedAt: now };
        },
      )
      // The report is in the folder before the run says it is done, as the real runner does it.
      .then(async (end) => {
        try {
          await this.writeLastRun(root, end);
        } catch (e) {
          console.error(e);
          // Keep this exact end to save again. Things are filed but the report is not saved: a done run stays saving.
          this.unsaved = { root, run, end, nextAt: 0 };
          if (end.phase === 'done') return;
        }
        Object.assign(run, end);
      });
    return this.wire();
  }

  /**
   * Saves an end view whose first save failed: the same object, never a new run, and at most once every
   * RETRY_MS while it keeps failing. Only while the folder still shows this run going, or already shows this
   * exact view (a write whose answer was lost). A failure is logged and never rejects the caller.
   */
  private async saveUnsaved(): Promise<void> {
    if (this.retrying) return this.retrying;
    const unsaved = this.unsaved;
    if (!unsaved || unsaved.run !== this.run || Date.now() < unsaved.nextAt) return;
    this.retrying = (async () => {
      try {
        const stored = await this.storedView(unsaved.root);
        if (stored?.text !== lastRunText(unsaved.end)) {
          if (stored?.run.id !== unsaved.end.id || ['done', 'failed'].includes(stored.run.phase)) {
            console.error(`${SYSTEM.lastRun} no longer shows run ${unsaved.end.id} going; its end is not saved over it`);
            throw new BowerError('conflict', 'Bower could not save what it did. Try again later.');
          }
          await this.writeLastRun(unsaved.root, unsaved.end);
        }
        if (this.unsaved === unsaved) this.unsaved = null;
        Object.assign(unsaved.run, unsaved.end);
      } catch (e) {
        console.error(e);
        unsaved.nextAt = Date.now() + RETRY_MS;
      } finally {
        this.retrying = null;
      }
    })();
    return this.retrying;
  }

  /** The run the folder shows now and its exact text, or null when it shows none. */
  private async storedView(root: string): Promise<{ run: RunWire; text: string } | null> {
    const all = await this.drive.listAll(root);
    const sys = all.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === root);
    const file = sys && all.find((f) => f.name === 'last-run.json' && f.parents[0] === sys.id);
    if (!file) return null;
    const text = await this.drive.readText(file.id);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(e);
      throw new BowerError('unknown', 'Bower could not read its latest update. Try again.');
    }
    if (!isRunnerFile(SYSTEM.lastRun, value)) {
      console.error(`${SYSTEM.lastRun} has an unsupported shape`);
      throw new BowerError('unknown', 'Bower could not read its latest update. Try again.');
    }
    return { run: value.run, text };
  }

  private async writeLastRun(root: string, run: RunWire & { report?: RunReport }): Promise<void> {
    const text = lastRunText(run);
    const all = await this.drive.listAll(root);
    const sys = all.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === root);
    const file = sys && all.find((f) => f.name === 'last-run.json' && f.parents[0] === sys.id);
    if (file) await this.drive.writeText(file.id, text, file.modifiedTime);
    else await this.drive.createText(sys?.id ?? (await this.drive.createFolder(root, SYSTEM.dir)).id, 'last-run.json', text);
  }

  /** The last run, when the folder has one (the "back" scenario). The running scenario starts one. */
  private async load(scenario: Scenario, fresh: boolean): Promise<void> {
    const root = this.rootId;
    if (!root) return;
    const all = await this.drive.listAll(root);
    const sys = all.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === root);
    const file = sys && all.find((f) => f.name === 'last-run.json' && f.parents[0] === sys.id);
    // The service's run is the latest when the folder shows no view yet, its own, or the one it found at admission.
    if (this.runs && (await this.runs.shows(this.binding(root), file ? await this.drive.readText(file.id) : null))) {
      this.via = 'b';
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
      this.run = { ...value.run };
      this.via = 'legacy';
      // A run still going in the folder was cut short by a reload: the runner (this page) is gone.
      if (!['done', 'failed'].includes(this.run.phase)) {
        const now = Date.now();
        // Filing happens while saving: cut there, some things may have moved already.
        const failure =
          this.run.phase === 'saving'
            ? 'The tidy-up stopped when the page was reloaded, while it was putting things away. Some things may be in their new places already; the rest is still in your inbox. Tidy up again.'
            : 'The tidy-up stopped when the page was reloaded. Nothing was moved; tidy up again.';
        this.run = { ...this.run, phase: 'failed', phaseAt: now, finishedAt: now, failure };
        await this.writeLastRun(root, this.run);
      }
    }
    // As on the demo: a run asked for 70 s ago, 20 s into reading.
    if (scenario === 'running' && fresh) this.start(root, 'all', Date.now() - 70_000, 20_000);
  }

  private online(): void {
    if (this.offline) throw new BowerError('offline', "You're offline.");
  }

  private wire(): RunWire {
    const { report: _report, ...wire } = this.run ?? { id: '', scope: 'all', phase: 'done', requestedAt: 0, phaseAt: 0 };
    return { ...wire };
  }
}

/** How long to wait before trying again to save a run's end view that keeps failing. */
const RETRY_MS = 5_000;

/** The exact text of the run's view in the folder; the same run always gives the same bytes. */
function lastRunText(run: RunWire & { report?: RunReport }): string {
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
