/**
 * The pretend Drive for this tab: kept in sessionStorage after every change,
 * so a reload finds what you did, as a real Drive would. A new situation
 * (or "Start again" in the demo panel) starts from Alex's folder.
 */
import { FakeDrive } from '../drive/fake-drive';
import type { Scenario, TimeScale } from '../demo/scenario';
import { BOWER_FOLDER } from '../vault/layout';
import { FakeRunService } from './fake-run-service';
import { seedFakeDrive } from './seed';

const FAKE_KEY = (scenario: Scenario): string => `bower:fake:${scenario}`;

export async function pretendDrive(scenario: Scenario): Promise<{ drive: FakeDrive; rootId: string | null; fresh: boolean }> {
  let drive: FakeDrive | null = null;
  try {
    const kept = sessionStorage.getItem(FAKE_KEY(scenario));
    if (kept) drive = FakeDrive.restore(kept);
  } catch (e) {
    console.error(e);
  }
  let rootId: string | null;
  const fresh = !drive;
  if (drive) {
    rootId = (await drive.listAll('root')).find((f) => f.folder && f.name === BOWER_FOLDER && f.parents[0] === 'root')?.id ?? null;
  } else {
    drive = new FakeDrive();
    rootId = await seedFakeDrive(drive, scenario, Date.now());
    // The live folder's shape, for the situation that measures Home on it.
    if (scenario === 'slow-report' && rootId) await (await import('./live-shape')).liveShape(drive, rootId);
    // Answers whose subjects went since (TL-P4-19 addendum 10), for the rows a tidy-up gives them.
    if (scenario === 'gone-answers' && rootId) await (await import('./gone-answers')).goneAnswers(drive, rootId);
  }
  const d = drive;
  const saver = new Saver(scenario, d);
  savers.set(d, saver);
  d.onChange = () => saver.schedule();
  d.persist = () => saver.flush();
  saver.schedule();
  return { drive: d, rootId, fresh };
}

const RUNS_KEY = (scenario: Scenario): string => `bower:fake:${scenario}:runs`;

/**
 * Keeps one pretend Drive, and the run service over it, in this tab: both in
 * one snapshot taken at one instant, so a reload never finds runs that point
 * at records the kept Drive lacks, nor effects the kept runs do not know of.
 * Saves follow each other in order; a later one never lands before an earlier one.
 */
class Saver {
  runs: FakeRunService | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly scenario: Scenario,
    private readonly drive: FakeDrive,
  ) {}

  /** Soon, once changes settle. */
  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.write(), 250);
  }

  /** Now: resolves once the tab holds everything up to this instant. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    return this.write();
  }

  private write(): Promise<void> {
    this.chain = this.chain.then(async () => {
      const { snapshot, alongside } = await this.drive.snapshotWith(() => this.runs?.toJSON() ?? null);
      this.store(snapshot, alongside);
    }).catch((e: unknown) => console.error(e));
    return this.chain;
  }

  /**
   * Stores the pair in one synchronous step, so a reload sees both from one
   * instant. When either write fails (the tab's storage is full), the pair
   * kept before goes back; if even that fails, both go, and the next reload
   * starts again rather than pairing a Drive with runs of another instant.
   */
  private store(snapshot: string, runs: string | null): void {
    const driveKey = FAKE_KEY(this.scenario);
    const runsKey = RUNS_KEY(this.scenario);
    const before = { drive: sessionStorage.getItem(driveKey), runs: sessionStorage.getItem(runsKey) };
    const put = (key: string, value: string | null): void => {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    };
    try {
      put(driveKey, snapshot);
      put(runsKey, runs);
    } catch (e) {
      console.error(e);
      try {
        put(driveKey, before.drive);
        put(runsKey, before.runs);
      } catch (again) {
        console.error(again);
        sessionStorage.removeItem(driveKey);
        sessionStorage.removeItem(runsKey);
      }
    }
  }
}
const savers = new WeakMap<FakeDrive, Saver>();

/**
 * The pretend run service for this tab, over its pretend Drive, kept in the
 * same snapshot as the Drive. An admission is acknowledged only once that
 * snapshot holds it. A fresh pretend Drive starts with no runs.
 */
export function pretendRuns(scenario: Scenario, drive: FakeDrive, fresh: boolean, scale: TimeScale): FakeRunService {
  const saver = savers.get(drive) ?? new Saver(scenario, drive);
  savers.set(drive, saver);
  const opts = { drive, scale, persist: () => saver.flush() };
  let runs: FakeRunService | null = null;
  try {
    const kept = fresh ? null : sessionStorage.getItem(RUNS_KEY(scenario));
    if (kept) runs = FakeRunService.restore(kept, opts);
  } catch (e) {
    // Unreadable kept runs start again empty; the folder still has every record.
    console.error(e);
  }
  const service = runs ?? new FakeRunService(opts);
  saver.runs = service;
  drive.onChange = () => saver.schedule();
  drive.persist = () => saver.flush();
  service.onChange = () => saver.schedule();
  saver.schedule();
  return service;
}

/** Forgets every pretend Drive of this tab, so the next start is Alex's folder again. */
export function forgetPretendDrive(): void {
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('bower:fake:')) sessionStorage.removeItem(k);
  } catch {
    // expected: Nothing kept, nothing to forget.
  }
}

