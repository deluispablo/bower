import { BowerError } from '../../src/data/types';

/**
 * One timing line per run (TL-P4-01 addendum, `docs/harness/p4-speed-baseline.md`), as the original's `agent stats`
 * line and `agent_seconds`: where a tidy-up's time went, phase by phase, with the model's own numbers. Numbers and
 * phase names only: no path, no content, no credential.
 *
 * Each phase's time is its own: a phase timed inside another (a checkpoint written while operations apply, the model
 * while the plan is read) is taken out of the outer one, so the phases add up to the run's time.
 */
export const PHASES = ['token', 'reads', 'model', 'apply', 'checkpoints', 'report', 'status'] as const;
export type Phase = (typeof PHASES)[number] | 'runner';

/** The model step as Claude Code's JSON result reports it (`duration_ms`, `duration_api_ms`, `num_turns`, `usage`). */
export interface ModelStats {
  wallMs: number;
  apiMs: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The Drive calls a phase made, and the bytes they sent and got. */
interface Traffic {
  calls: number;
  bytes: number;
}

/** The size of a request body, in bytes (0 for none). */
function sentBytes(body: RequestInit["body"]): number {
  if (typeof body === 'string') return new TextEncoder().encode(body).length;
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body.byteLength;
  return 0;
}

export interface SectionHashes {
  prompt?: string;
  tree?: string;
  things?: string;
  notes?: string;
  rules?: string;
}

export class LedgerExhausted extends BowerError {
  constructor(readonly count: number) { super('unknown', 'These items will be handled on the next run.'); }
}

export class RunTiming {
  private readonly spent = new Map<Phase, number>();
  private readonly stack: Array<{ phase: Phase; since: number }> = [];
  private checkpointWrites = 0;
  private readonly began: number;
  model: ModelStats | null = null;
  private inputFingerprint: string | null = null;
  private sectionHashes: SectionHashes | null = null;
  private readonly traffic = new Map<Phase, Traffic>();
  private region = 'unknown';

  /** `startMs`: how long the job took to start this process (Node's uptime when the runner began). */
  constructor(
    private readonly startMs = 0,
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.began = clock();
  }

  /** Both semantic steps and retries spend the same 80% allowance. */
  remainingModelMs(): number { return Math.max(0, 900_000 * 0.8 - (this.clock() - this.began)); }
  addModel(stats: ModelStats): void {
    const previous = this.model;
    this.model = previous ? {
      wallMs: previous.wallMs + stats.wallMs, apiMs: previous.apiMs + stats.apiMs,
      turns: previous.turns + stats.turns, inputTokens: previous.inputTokens + stats.inputTokens,
      outputTokens: previous.outputTokens + stats.outputTokens,
    } : stats;
  }
  requireOperations(count: number, items: number): void { if (count > 200) throw new LedgerExhausted(items); }

  /** Set the input fingerprint (first 12 hex of sha256 of the model input). */
  setInputFingerprint(fingerprint: string): void {
    this.inputFingerprint = fingerprint;
  }

  /** Set the section hashes (first 6 hex of sha256 of each section's normalized text). */
  setSectionHashes(hashes: SectionHashes): void {
    this.sectionHashes = hashes;
  }

  /**
   * The runner's region, as the environment names it. GitHub sets no region variable on its runners (only `RUNNER_OS`,
   * `RUNNER_ARCH`, `RUNNER_NAME` and `RUNNER_ENVIRONMENT`), so the job's own step provides `BOWER_RUNNER_REGION`.
   */
  setRegion(region: string | undefined): void {
    const r = region?.trim();
    if (r) this.region = r.replace(/\s+/g, '-');
  }

  /**
   * Wraps the Drive transport's fetch (`RunnerDrive`, the one place a Drive call is sent) so each call and its bytes
   * count under the phase running when it was sent: the phases are this class's own, no list is kept elsewhere.
   */
  meter(fetchFn: Fetch): Fetch {
    return async (url, init) => {
      const phase = this.stack.at(-1)?.phase ?? 'runner';
      const res = await fetchFn(url, init);
      const got = (await res.clone().arrayBuffer()).byteLength;
      const was = this.traffic.get(phase) ?? { calls: 0, bytes: 0 };
      this.traffic.set(phase, { calls: was.calls + 1, bytes: was.bytes + sentBytes(init?.body) + got });
      return res;
    };
  }

  /** Runs `f` as `phase`, its time taken out of the phase it runs inside. */
  async time<T>(phase: Phase, f: () => Promise<T>): Promise<T> {
    const now = this.clock();
    const outer = this.stack.at(-1);
    if (outer) this.add(outer.phase, now - outer.since);
    const own = { phase, since: now };
    this.stack.push(own);
    if (phase === 'checkpoints') this.checkpointWrites++;
    try {
      return await f();
    } finally {
      const end = this.clock();
      this.stack.pop();
      this.add(phase, end - own.since);
      const back = this.stack.at(-1);
      if (back) back.since = end;
    }
  }

  private add(phase: Phase, ms: number): void {
    this.spent.set(phase, (this.spent.get(phase) ?? 0) + ms);
  }

  /** The one line, in whole milliseconds; `end` is how the run ended (done, saving, failed or stopped). */
  line(end: 'done' | 'saving' | 'failed' | 'stopped'): string {
    const ms = (n: number): number => Math.max(0, Math.round(n));
    const m = this.model;
    const own = (p: Phase): number => ms(this.spent.get(p) ?? 0);

    const sectionsPart = this.sectionHashes ? this._formatSections() : '';

    return [
      `timing: end=${end} total=${ms(this.clock() - this.began)} start=${ms(this.startMs)}`,
      `token=${own('token')} reads=${own('reads')}`,
      // The model's wall time is the one it reports; with no model, the provider's own time is zero.
      `model=${m ? ms(m.wallMs) : own('model')} api=${ms(m?.apiMs ?? 0)} turns=${m?.turns ?? 0} in=${m?.inputTokens ?? 0} out=${m?.outputTokens ?? 0}${this.inputFingerprint ? ` input=${this.inputFingerprint}${sectionsPart}` : ''}`,
      `apply=${own('apply')} checkpoints=${own('checkpoints')}/${this.checkpointWrites} report=${own('report')} status=${own('status')}`,
      // New fields go last: Drive calls/bytes per phase (`runner`: outside every phase), then the runner's region.
      `drive=${[...PHASES, 'runner' as const].map((p) => `${p}:${this.traffic.get(p)?.calls ?? 0}/${this.traffic.get(p)?.bytes ?? 0}`).join(',')} region=${this.region}`,
    ].join(' ');
  }

  private _formatSections(): string {
    if (!this.sectionHashes) return '';
    const parts: string[] = [];
    if (this.sectionHashes.prompt) parts.push(`prompt:${this.sectionHashes.prompt}`);
    if (this.sectionHashes.tree) parts.push(`tree:${this.sectionHashes.tree}`);
    if (this.sectionHashes.things) parts.push(`things:${this.sectionHashes.things}`);
    if (this.sectionHashes.notes) parts.push(`notes:${this.sectionHashes.notes}`);
    if (this.sectionHashes.rules) parts.push(`rules:${this.sectionHashes.rules}`);
    return parts.length > 0 ? ` sections=${parts.join(',')}` : '';
  }
}
