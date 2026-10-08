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

export class RunTiming {
  private readonly spent = new Map<Phase, number>();
  private readonly stack: Array<{ phase: Phase; since: number }> = [];
  private checkpointWrites = 0;
  private readonly began: number;
  model: ModelStats | null = null;
  private inputFingerprint: string | null = null;

  /** `startMs`: how long the job took to start this process (Node's uptime when the runner began). */
  constructor(
    private readonly startMs = 0,
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.began = clock();
  }

  /** Set the input fingerprint (first 12 hex of sha256 of the model input). */
  setInputFingerprint(fingerprint: string): void {
    this.inputFingerprint = fingerprint;
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
    return [
      `timing: end=${end} total=${ms(this.clock() - this.began)} start=${ms(this.startMs)}`,
      `token=${own('token')} reads=${own('reads')}`,
      // The model's wall time is the one it reports; with no model, the provider's own time is zero.
      `model=${m ? ms(m.wallMs) : own('model')} api=${ms(m?.apiMs ?? 0)} turns=${m?.turns ?? 0} in=${m?.inputTokens ?? 0} out=${m?.outputTokens ?? 0}${this.inputFingerprint ? ` input=${this.inputFingerprint}` : ''}`,
      `apply=${own('apply')} checkpoints=${own('checkpoints')}/${this.checkpointWrites} report=${own('report')} status=${own('status')}`,
    ].join(' ');
  }
}
