/**
 * Tidy-ups, from the Worker. The Worker knows a run's phase; the run's
 * report is in the Bower folder (`.bower/last-run.json`), read once when the
 * run ends. Whether this device has seen the result is kept on the device.
 * Screens hear about changes: the Worker is asked every 4 s while a run is
 * going, every 60 s otherwise, and when the app comes back into view.
 */
import type { RunSource, Unsubscribe } from '../sources';
import type { RunReport, RunState } from '../types';
import type { DriveVault } from '../vault/drive-vault';
import type { RunWire, WorkerApi } from '../worker/worker-api';

const FAST_MS = 4_000;
const SLOW_MS = 60_000;
const SEEN = 'bower:run-seen';

const finished = (r: RunWire | null): boolean => !!r && (r.phase === 'done' || r.phase === 'failed');

function seenId(): string | null {
  try {
    return localStorage.getItem(SEEN);
  } catch {
    return null;
  }
}

export class LiveRuns implements RunSource {
  private listeners = new Set<() => void>();
  private last: RunWire | null = null;
  /** Each ended run's report, read once (null when it left none, as a failed run does). */
  private reports = new Map<string, RunReport | null>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private took = new Set<string>();
  private readonly onVisible = (): void => {
    if (document.visibilityState === 'visible') void this.poll();
  };

  constructor(
    private readonly worker: WorkerApi,
    private readonly vault: DriveVault,
    /** How often to ask while a run is going; the pretend Worker answers at once, so it is asked more often. */
    private readonly fastMs = FAST_MS,
  ) {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
  }

  /** The piles a run going now took, when this device started it; `*` when another did. */
  runningPiles(): ReadonlySet<string> {
    if (!this.last || finished(this.last)) return new Set();
    return this.took.size ? this.took : new Set(['*']);
  }

  async start(scope: 'all' | 'instructions'): Promise<RunState> {
    const piles = scope === 'all' ? (await this.vault.piles()).map((p) => p.id) : [];
    const wire = await this.worker.process(scope);
    if (wire.id !== this.last?.id) this.took = new Set(piles);
    await this.take(wire);
    this.schedule();
    return this.state(wire);
  }

  async current(): Promise<RunState | null> {
    const wire = await this.worker.status();
    await this.take(wire);
    return wire ? this.state(wire) : null;
  }

  async markSeen(id: string): Promise<void> {
    try {
      localStorage.setItem(SEEN, id);
    } catch {
      // Without storage the replay is offered again next time.
    }
    this.emit();
  }

  subscribe(cb: () => void): Unsubscribe {
    this.listeners.add(cb);
    this.schedule();
    return () => {
      this.listeners.delete(cb);
      if (!this.listeners.size && this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    };
  }

  private async poll(): Promise<void> {
    try {
      await this.current();
    } catch (e) {
      // A missed answer is asked again on the next beat.
      console.error(e);
    }
    this.schedule();
  }

  private schedule(): void {
    if (!this.listeners.size) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.poll(), this.last && !finished(this.last) ? this.fastMs : SLOW_MS);
  }

  /** Takes in the Worker's answer; when a run has just ended, reads its report and lists the folder again. */
  private async take(wire: RunWire | null): Promise<void> {
    const before = this.last;
    const changed = JSON.stringify(before) !== JSON.stringify(wire);
    this.last = wire;
    if (wire && finished(wire) && !this.reports.has(wire.id)) {
      // The run changed the folder: list it again, then read the report it left there.
      if (before?.id !== wire.id || !finished(before)) await this.vault.refresh();
      const file = await this.vault.lastRun();
      const report = file?.run.id === wire.id ? file.run.report : undefined;
      this.reports.set(wire.id, report ?? null);
    }
    if (changed) {
      if (!wire || finished(wire)) this.took = new Set();
      // A run that starts or ends changes how often the Worker is asked.
      if (finished(before) !== finished(wire) || !before !== !wire) this.schedule();
      this.emit();
    }
  }

  private state(w: RunWire): RunState {
    const report = this.reports.get(w.id);
    return { ...w, ...(report ? { report } : {}), seen: seenId() === w.id };
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}
