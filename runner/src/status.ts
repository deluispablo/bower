/**
 * The runner's status reports to the Worker: `POST /runner/runs/:id/status` with the run ticket and
 * `{ attempt, seq, phase, total?, failure? }` (worker contract, "Runner wire"). `seq` rises with each report of
 * this attempt. A late report is answered 409 `stale-report` with the Worker's `current: { seq, phase }`:
 *
 * - when that phase is `done` or `failed`, the run is finished: this report and any after it send nothing more;
 * - when the Worker is already past this phase (a redispatch of a run left in `saving` reporting `writing`), there
 *   is nothing to tell it;
 * - otherwise (a restarted runner whose `seq` started over) the report is sent once more from `seq + 1`. Refused
 *   again, a `done` or `failed` throws, so the job fails visibly; it is never swallowed.
 */
import { BowerError, type RunPhase } from '../../src/data/types';
import { retried } from './retry';
import { staleAttempt } from './token';

export interface RunnerStatusOptions {
  api: string;
  runId: string;
  ticket: string;
  attempt: number;
  fetch?: typeof fetch;
}

const RANK: Readonly<Record<RunPhase, number>> = { queued: 0, reading: 1, writing: 2, saving: 3, done: 4, failed: 4 };
const ended = (phase: RunPhase): boolean => phase === 'done' || phase === 'failed';

/** Where the Worker is, from a `stale-report` body; null when it does not say. */
function currentOf(reply: unknown): { seq: number; phase: RunPhase } | null {
  const c = (reply as { current?: { seq?: unknown; phase?: unknown } } | null)?.current;
  if (!c || typeof c.seq !== 'number' || !Number.isSafeInteger(c.seq) || c.seq < 0) return null;
  return typeof c.phase === 'string' && Object.hasOwn(RANK, c.phase) ? { seq: c.seq, phase: c.phase as RunPhase } : null;
}

type Answer = { kind: 'taken' } | { kind: 'late'; current: { seq: number; phase: RunPhase } | null };

export class RunnerStatus {
  private readonly url: string;
  private readonly fetchFn: typeof fetch;
  private seq = 0;
  /** The phase the Worker holds this run ended in, once a report found it ended; nothing more is sent. */
  private endedAs: RunPhase | null = null;

  constructor(private readonly opts: RunnerStatusOptions) {
    this.url = `${opts.api.replace(/\/$/, '')}/runner/runs/${encodeURIComponent(opts.runId)}/status`;
    this.fetchFn = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  /** Whether the Worker already holds this run ended (`done` or `failed`). */
  get finished(): boolean {
    return this.endedAs !== null;
  }

  async post(phase: RunPhase, extra: { total?: number; failure?: string } = {}): Promise<void> {
    if (this.endedAs) {
      console.error(`The Worker already holds this run ${this.endedAs}; ${phase} is not sent`);
      return;
    }
    const first = await this.send(phase, extra, ++this.seq);
    if (first.kind === 'taken') return;
    const current = first.current;
    // This very report, taken by a send whose answer was lost: nothing more to tell.
    if (current && current.seq === this.seq && current.phase === phase) return;
    if (current && ended(current.phase)) {
      console.error(`The Worker already holds this run ${current.phase}; ${phase} is not sent`);
      this.endedAs = current.phase;
      return;
    }
    if (current && RANK[current.phase] > RANK[phase]) {
      console.error(`The Worker already holds ${current.phase}, later than ${phase}`);
      this.seq = Math.max(this.seq, current.seq);
      return;
    }
    if (current) {
      // A restarted runner: it goes on from the Worker's seq, once.
      this.seq = Math.max(this.seq, current.seq) + 1;
      const again = await this.send(phase, extra, this.seq);
      if (again.kind === 'taken') return;
      if (again.current && ended(again.current.phase)) {
        console.error(`The Worker already holds this run ${again.current.phase}; ${phase} is not sent`);
        this.endedAs = again.current.phase;
        return;
      }
    }
    console.error(`The Worker refused ${phase} as late (seq ${this.seq})`);
    if (ended(phase)) throw new BowerError('unknown', "Bower's server didn't take how the tidy-up ended. It will try again.");
  }

  private async send(phase: RunPhase, extra: { total?: number; failure?: string }, seq: number): Promise<Answer> {
    const body = { attempt: this.opts.attempt, seq, phase, ...extra };
    let res: Response;
    try {
      // Idempotent by attempt and seq: the Worker answers a repeat of the last seq with the current state and changes
      // nothing, even once the run ended (TL-P3-28; `retry.ts`).
      res = await retried(() =>
        this.fetchFn(this.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.opts.ticket}` },
          body: JSON.stringify(body),
        }),
      );
    } catch (e) {
      console.error(e);
      throw new BowerError('offline', "Bower couldn't reach its server. It will try again.");
    }
    if (res.ok) return { kind: 'taken' };
    const reply = (await res.json().catch((e: unknown) => {
      console.error(e);
      return null;
    })) as { error?: { code?: unknown } } | null;
    const code = reply?.error?.code;
    if (res.status === 409 && code === 'stale-attempt') throw staleAttempt();
    if (res.status === 409 && code === 'stale-report') return { kind: 'late', current: currentOf(reply) };
    if (res.status === 401) {
      console.error('The status route refused the run ticket');
      throw new BowerError('auth', 'This tidy-up is no longer allowed to change your folder.');
    }
    console.error(`The status route answered ${res.status} for ${phase}`);
    throw new BowerError('unknown', "Bower's server didn't answer. It will try again.");
  }
}
