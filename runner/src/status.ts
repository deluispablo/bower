/**
 * The runner's status reports to the Worker: `POST /runner/runs/:id/status` with the run ticket and
 * `{ attempt, seq, phase, total?, failure? }` (worker contract, "Runner wire"). `seq` rises with each report of
 * this attempt. A phase only moves forward: a report the Worker already holds a later phase for (a redispatch of a
 * run left in `saving`) is answered `stale-report`, which changes nothing and is not a failure.
 */
import { BowerError, type RunPhase } from '../../src/data/types';
import { staleAttempt } from './token';

export interface RunnerStatusOptions {
  api: string;
  runId: string;
  ticket: string;
  attempt: number;
  fetch?: typeof fetch;
}

export class RunnerStatus {
  private readonly url: string;
  private readonly fetchFn: typeof fetch;
  private seq = 0;

  constructor(private readonly opts: RunnerStatusOptions) {
    this.url = `${opts.api.replace(/\/$/, '')}/runner/runs/${encodeURIComponent(opts.runId)}/status`;
    this.fetchFn = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  async post(phase: RunPhase, extra: { total?: number; failure?: string } = {}): Promise<void> {
    const body = { attempt: this.opts.attempt, seq: ++this.seq, phase, ...extra };
    let res: Response;
    try {
      res = await this.fetchFn(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.opts.ticket}` },
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.error(e);
      throw new BowerError('offline', "Bower couldn't reach its server. It will try again.");
    }
    if (res.ok) return;
    const reply = (await res.json().catch((e: unknown) => {
      console.error(e);
      return null;
    })) as { error?: { code?: unknown } } | null;
    const code = reply?.error?.code;
    if (res.status === 409 && code === 'stale-attempt') throw staleAttempt();
    if (res.status === 409 && code === 'stale-report') {
      console.error(`The Worker already holds a later report than ${phase} (seq ${body.seq})`);
      return;
    }
    if (res.status === 401) {
      console.error('The status route refused the run ticket');
      throw new BowerError('auth', 'This tidy-up is no longer allowed to change your folder.');
    }
    console.error(`The status route answered ${res.status} for ${phase}`);
    throw new BowerError('unknown', "Bower's server didn't answer. It will try again.");
  }
}
