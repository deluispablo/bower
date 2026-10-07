/**
 * Tidy-ups, from the Worker. The Worker knows a run's phase; the run's
 * report is in the Bower folder (`.bower/last-run.json`), read once when the
 * run ends. Whether this device has seen the result is kept on the device.
 * Screens hear about changes: the Worker is asked every 4 s while a run is
 * going, every 60 s otherwise, and when the app comes back into view. A
 * client error (a 4xx: the Worker has no such route, or refuses) is not
 * asked again until the app comes back into view or a tidy-up starts; offline
 * and server errors keep the beat (retry only what can change: Google Cloud
 * retry strategy, https://cloud.google.com/storage/docs/retry-strategy).
 */
import type { RunSource, Unsubscribe } from '../sources';
import { BowerError, type RunReport, type RunState } from '../types';
import type { DriveVault } from '../vault/drive-vault';
import { httpStatusOf, type RunWire, type WorkerApi } from '../worker/worker-api';

const FAST_MS = 4_000;
const SLOW_MS = 60_000;
const SEEN = 'bower:run-seen';
const ACTIVE: readonly RunWire['phase'][] = ['queued', 'reading', 'writing', 'saving'];

const clientError = (e: unknown): e is BowerError => {
  if (!(e instanceof BowerError)) return false;
  if (e.code === 'not-found' || e.code === 'conflict') return true;
  const status = httpStatusOf(e);
  return status !== null && status >= 400 && status < 500 && status !== 401 && status !== 429;
};

const finished = (r: RunWire | null): boolean => !!r && (r.phase === 'done' || r.phase === 'failed');

function seenId(): string | null {
  try {
    return localStorage.getItem(SEEN);
  } catch {
    // expected: storage may be blocked (a private window); the default holds.
    return null;
  }
}

export class LiveRuns implements RunSource {
  private listeners = new Set<() => void>();
  private last: RunWire | null = null;
  /** Each ended run's report, read once (null when it left none, as a failed run does). */
  private reports = new Map<string, RunReport | null>();
  private loading = new Map<string, Promise<void>>();
  private retired = new Set<string>();
  private generation = 0;
  private issued = 0;
  private accepted = 0;
  private starts: Promise<unknown> = Promise.resolve();
  private foreground: Promise<void> | null = null;
  private refreshing: Promise<void> | null = null;
  private refreshIssued = 0;
  private refreshed = 0;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private took = new Set<string>();
  /** The 4xx the Worker last answered the status with; while set, it is not asked. */
  private refused: BowerError | null = null;
  private readonly onVisible = (): void => {
    if (document.visibilityState === 'visible') void this.returnToForeground();
  };

  constructor(
    private readonly worker: WorkerApi,
    private readonly vault: DriveVault,
    /** How often to ask while a run is going; the pretend Worker answers at once, so it is asked more often. */
    private readonly fastMs = FAST_MS,
    /** A replaced session starts idle; its first accepted status tells stable subscribers. */
    private announceIdle = false,
  ) {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible);
  }

  dispose(reset = false): void {
    this.disposed = true;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
    if (reset) {
      this.last = null;
      this.took.clear();
      this.reports.clear();
      this.retired.clear();
      this.loading.clear();
    }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
  }

  /** The piles a run going now took, when this device started it; `*` when another did. */
  runningPiles(): ReadonlySet<string> {
    if (!this.last || finished(this.last)) return new Set();
    return this.took.size ? this.took : new Set(['*']);
  }

  start(scope: 'all' | 'instructions', opts: { allowWeb?: boolean } = {}): Promise<RunState> {
    // One per press (TL-P3-15): a UUID is lowercase letters, digits and dashes, 36 characters.
    const requestId = crypto.randomUUID().toLowerCase();
    const work = () => this.startNow(scope, { ...opts, requestId });
    const next = this.starts.then(work);
    // expected: the caller receives next's failure; only the queue recovers so another admission can be tried.
    this.starts = next.catch(() => undefined);
    return next;
  }

  private async startNow(scope: 'all' | 'instructions', opts: { allowWeb?: boolean; requestId: string }): Promise<RunState> {
    this.checkOpen();
    // What you did while Drive was out of reach goes first, so this tidy-up knows it.
    await this.vault.flushJournal();
    this.checkOpen();
    const piles = scope === 'all' ? (await this.vault.piles()).map((p) => p.id) : [];
    this.checkOpen();
    const wire = await this.worker.process(scope, opts);
    this.checkOpen();
    // Successful admission supersedes even status requests issued while process waited.
    this.generation++;
    this.refused = null;
    this.accepted = ++this.issued;
    this.take(wire, piles);
    await this.hydrate();
    this.checkOpen();
    if (!this.last) throw new BowerError('conflict', 'The tidy-up status changed; try again.');
    this.schedule();
    return this.state(this.last);
  }

  private checkOpen(): void {
    if (this.disposed) throw new BowerError('unknown', 'Bower is no longer open on this page.');
  }

  async current(opts: { again?: boolean } = {}): Promise<RunState | null> {
    if (this.disposed) return this.last ? this.state(this.last) : null;
    if (this.refused && !opts.again) throw this.refused;
    const generation = this.generation;
    const ticket = ++this.issued;
    let wire: RunWire | null;
    try {
      wire = await this.worker.status();
    } catch (e) {
      // 401 is the session's to handle and 429 can pass; any other 4xx is a client error that asking again cannot fix.
      if (clientError(e) && !this.disposed && generation === this.generation && ticket > this.accepted) this.refused = e;
      else if (opts.again) this.refused = null;
      throw e;
    }
    const wasRefused = this.refused;
    this.refused = null;
    if (!this.disposed && generation === this.generation && ticket > this.accepted) {
      this.accepted = ticket;
      this.take(wire);
      if (wasRefused) this.schedule();
    }
    await this.hydrate();
    return this.last ? this.state(this.last) : null;
  }

  async markSeen(id: string): Promise<void> {
    try {
      localStorage.setItem(SEEN, id);
    } catch {
      // expected: Without storage the replay is offered again next time.
    }
    this.emit();
  }

  subscribe(cb: () => void): Unsubscribe {
    if (this.disposed) return () => undefined;
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

  /** A visible return discovers idle external changes; ordinary status polling stays lightweight. */
  private returnToForeground(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.refused = null;
    if (this.foreground) return this.foreground;
    const before = this.refreshIssued;
    const work = (async () => {
      try {
        await this.current();
        // A pre-return listing may settle during this wave, but only one begun in it discovers this return's changes.
        while (this.refreshed <= before) {
          if (this.disposed || (this.last && !finished(this.last))) return;
          await this.refreshFolder();
        }
      } catch (e) {
        // This event has no awaiting caller; keep the failure visible and allow the next return to retry.
        console.error(e);
      }
    })();
    this.foreground = work.finally(() => {
      this.foreground = null;
      this.schedule();
    });
    return this.foreground;
  }

  /** Coalesce foreground and completion listings without replacing local pending work. */
  private refreshFolder(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.refreshing) {
      const ticket = ++this.refreshIssued;
      this.refreshing = this.vault.refresh().then(() => {
        if (!this.disposed) this.refreshed = ticket;
      }).finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  private schedule(): void {
    if (this.disposed || !this.listeners.size) return;
    if (this.timer) clearTimeout(this.timer);
    if (this.refused) {
      this.timer = null;
      return;
    }
    this.timer = setTimeout(() => void this.poll(), this.last && !finished(this.last) ? this.fastMs : SLOW_MS);
  }

  /** Commits accepted state without awaiting I/O; old hydration cannot undo its locks or cadence. */
  private take(wire: RunWire | null, piles?: string[]): void {
    const before = this.last;
    // Eligible idle replies retain their API meaning; request tickets and admission generations reject stale ones.
    if (!wire) {
      this.last = null;
      this.took = new Set();
      if (before || this.announceIdle) {
        this.announceIdle = false;
        this.schedule();
        this.emit();
      }
      return;
    }
    if (this.retired.has(wire.id)) return;
    this.announceIdle = false;
    if (before?.id === wire.id) {
      if (finished(before) && wire.phase !== before.phase) {
        if (finished(wire)) console.error(new Error(`Conflicting terminal status for run ${wire.id}`));
        return;
      }
      if (!finished(wire) && ACTIVE.indexOf(wire.phase) < ACTIVE.indexOf(before.phase)) return;
    }
    const changed = JSON.stringify(before) !== JSON.stringify(wire);
    if (before && before.id !== wire.id) this.retired.add(before.id);
    this.last = wire;
    if (finished(wire)) this.took = new Set();
    else if (before?.id !== wire.id) this.took = new Set(piles ?? []);
    if (changed) {
      // A run that starts or ends changes how often the Worker is asked.
      if (finished(before) !== finished(wire) || !before !== !wire) this.schedule();
      if (!finished(wire) || this.reports.has(wire.id)) this.emit();
    }
  }

  /** Share report reads, recheck after each await, and return only the current accepted run. */
  private async hydrate(): Promise<void> {
    while (!this.disposed && this.last && finished(this.last) && !this.reports.has(this.last.id)) {
      const wire = this.last;
      const generation = this.generation;
      let pending = this.loading.get(wire.id);
      if (!pending) {
        pending = this.loadReport(wire, generation).finally(() => this.loading.delete(wire.id));
        this.loading.set(wire.id, pending);
      }
      await pending;
    }
  }

  private async loadReport(wire: RunWire, generation: number): Promise<void> {
    const current = () => !this.disposed && generation === this.generation && this.last?.id === wire.id;
    try { await this.refreshFolder(); }
    catch (e) {
      // Expected: disposal stops the listing; current() can still return its last no-effect state.
      if (this.disposed) return;
      throw e;
    }
    if (!current()) return;
    const file = await this.vault.lastRun();
    if (!current()) return;
    const report = file?.run.id === wire.id ? file.run.report : undefined;
    this.reports.set(wire.id, report ?? null);
    this.emit();
  }

  private state(w: RunWire): RunState {
    const report = this.reports.get(w.id);
    return { ...w, ...(report ? { report } : {}), seen: seenId() === w.id };
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}
