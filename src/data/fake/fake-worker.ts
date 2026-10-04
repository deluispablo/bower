/**
 * Bower's Worker, faked in the browser: who is signed in, the Bower folder
 * and the runs, over a FakeDrive. A tidy-up runs `runFake` on the scenario's
 * clock, the way GitHub Actions would run the real runner, and the run's
 * state is kept here the way the Worker keeps it.
 */
import type { FakeDrive } from '../drive/fake-drive';
import { ALEX } from '../demo/fixture';
import type { Scenario, TimeScale } from '../demo/scenario';
import { thingsIn } from '../piles';
import { BowerError, PARA_ROOTS, type RunReport } from '../types';
import { DriveVault } from '../vault/drive-vault';
import { BOWER_FOLDER, PROP, SYSTEM, type LastRunFile } from '../vault/layout';
import { serializeNote } from '../vault/note-format';
import { serializeRules } from '../vault/rules-format';
import type { Me, RunWire, WorkerApi } from '../worker/worker-api';
import { runFake } from './fake-runner';

export interface FakeWorkerOptions {
  drive: FakeDrive;
  scenario: Scenario;
  scale: TimeScale;
  rootId: string | null;
}

export class FakeWorker implements WorkerApi {
  private readonly drive: FakeDrive;
  private readonly scale: TimeScale;
  private rootId: string | null;
  private signedIn: boolean;
  private failOnce: boolean;
  private run: (RunWire & { report?: RunReport }) | null = null;
  private loaded: Promise<void>;
  private took = new Set<string>();
  private seq = 0;

  constructor(opts: FakeWorkerOptions) {
    this.drive = opts.drive;
    this.scale = opts.scale;
    this.rootId = opts.rootId;
    this.signedIn = opts.scenario !== 'signed-out';
    this.failOnce = opts.scenario === 'fail-run';
    this.loaded = this.load(opts.scenario);
  }

  /** The piles the tidy-up going now took; empty when none is going. */
  runningPiles(): ReadonlySet<string> {
    return this.run && !['done', 'failed'].includes(this.run.phase) ? this.took : new Set();
  }

  async me(): Promise<Me | null> {
    return this.signedIn ? { user: ALEX, folderId: this.rootId } : null;
  }

  async signIn(): Promise<void> {
    this.signedIn = true;
  }

  async signOut(): Promise<void> {
    this.signedIn = false;
  }

  async driveToken(): Promise<string> {
    if (!this.signedIn) throw new BowerError('auth', 'Sign in again to keep going.');
    return 'fake-token';
  }

  /** The template: the five main folders, Rules.md, About me.md and Bower's own folder. */
  async createFolder(): Promise<string> {
    if (this.rootId) return this.rootId;
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
    return root;
  }

  async process(scope: 'all' | 'instructions'): Promise<RunWire> {
    await this.loaded;
    if (this.run && !['done', 'failed'].includes(this.run.phase)) return this.wire();
    const root = this.rootId;
    if (!root) throw new BowerError('not-found', 'Your Bower folder is not there any more.');
    const vault = new DriveVault({ drive: this.drive, rootId: async () => root, runningPiles: () => new Set(), device: 'worker' });
    if (scope === 'all' && !(await vault.piles()).reduce((n, p) => n + thingsIn(p), 0)) throw new BowerError('conflict', 'Nothing is waiting in the inbox.');
    if (scope === 'instructions' && !(await vault.changes()).length) throw new BowerError('conflict', 'There is nothing new for Bower to read.');
    return this.start(root, scope, Date.now());
  }

  async status(): Promise<RunWire | null> {
    await this.loaded;
    return this.run ? this.wire() : null;
  }

  private start(root: string, scope: 'all' | 'instructions', at: number): RunWire {
    const run: RunWire & { report?: RunReport } = { id: `run-${Date.now().toString(36)}-${++this.seq}`, scope, phase: 'queued', requestedAt: at, phaseAt: Date.now() };
    this.run = run;
    this.took = new Set();
    const failOnce = this.failOnce;
    this.failOnce = false;
    void runFake(this.drive, root, {
      scope,
      scale: this.scale,
      failOnce,
      took: (ids) => (this.took = new Set(ids)),
      onPhase: (phase, total) => {
        run.phase = phase;
        run.phaseAt = Date.now();
        if (total !== undefined) run.total = total;
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
        await this.writeLastRun(root, end).catch((e: unknown) => console.error(e));
        Object.assign(run, end);
      });
    return this.wire();
  }

  private async writeLastRun(root: string, run: RunWire & { report?: RunReport }): Promise<void> {
    const body: LastRunFile = { v: 1, run: { ...run } };
    const text = `${JSON.stringify(body, null, 2)}\n`;
    const all = await this.drive.listAll(root);
    const sys = all.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === root);
    const file = sys && all.find((f) => f.name === 'last-run.json' && f.parents[0] === sys.id);
    if (file) await this.drive.writeText(file.id, text, file.modifiedTime);
    else await this.drive.createText(sys?.id ?? (await this.drive.createFolder(root, SYSTEM.dir)).id, 'last-run.json', text);
  }

  /** The last run, when the folder has one (the "back" scenario). The running scenario starts one. */
  private async load(scenario: Scenario): Promise<void> {
    const root = this.rootId;
    if (!root) return;
    const all = await this.drive.listAll(root);
    const sys = all.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === root);
    const file = sys && all.find((f) => f.name === 'last-run.json' && f.parents[0] === sys.id);
    if (file) {
      try {
        const v = JSON.parse(await this.drive.readText(file.id)) as Partial<LastRunFile>;
        if (v.v === 1 && v.run) this.run = { ...v.run };
      } catch (e) {
        console.error(e);
      }
    }
    if (scenario === 'running') this.start(root, 'all', Date.now() - 70_000);
  }

  private wire(): RunWire {
    const { report: _report, ...wire } = this.run ?? { id: '', scope: 'all', phase: 'done', requestedAt: 0, phaseAt: 0 };
    return { ...wire };
  }
}
