/** The runner's status reports to the Worker (`POST /runner/runs/:id/status`). Stub: behaviour comes next. */
import type { RunPhase } from '../../src/data/types';

export interface RunnerStatusOptions {
  api: string;
  runId: string;
  ticket: string;
  attempt: number;
  fetch?: typeof fetch;
}

export class RunnerStatus {
  constructor(private readonly opts: RunnerStatusOptions) {}

  async post(phase: RunPhase, extra: { total?: number; failure?: string } = {}): Promise<void> {
    void this.opts;
    void phase;
    void extra;
  }
}
