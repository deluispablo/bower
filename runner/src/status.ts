/**
 * The runner's status reports to the Worker: `POST /runner/runs/:id/status` with the run ticket and
 * `{ attempt, seq, phase, total?, failure?, answersStayed? }` (worker contract, "Runner wire"). `seq` rises with each report of
 * this attempt. A late report is answered 409 `stale-report` with the Worker's `current: { seq, phase }`:
 *
 * - when that phase is `done` or `failed`, the run is finished: this report and any after it send nothing more;
 * - when the Worker is already past this phase (a redispatch of a run left in `saving` reporting `writing`), there
 *   is nothing to tell it;
 * - otherwise (a restarted runner whose `seq` started over) the report is sent once more from `seq + 1`. Refused
 *   again, a `done` or `failed` throws, so the job fails visibly; it is never swallowed.
 *
 * A runner that stops with no `done` or `failed` taken says so last (`ended`, TL-P4-16 addendum 4).
 */
import { attemptEnded } from '../../src/data/contracts/attempt-ended';
import { PHASE_RANK as RANK } from '../../src/data/contracts/run-phases';
import { isQuestionSnapshot, type PublicQuestion } from '../../src/data/contracts/questions';
import { BowerError, type RunPhase } from '../../src/data/types';
import { send, type Fetch, type Pacing } from '../../src/data/drive/transport';
import { serverBusy, staleAttempt, unreached } from './token';

export interface RunnerStatusOptions {
  api: string;
  runId: string;
  ticket: string;
  attempt: number;
  fetch?: Fetch;
  /** The transport's waits between tries; the real backoff when absent. */
  pacing?: Partial<Pacing>;
}

const ended = (phase: RunPhase): boolean => phase === 'done' || phase === 'failed';

/** Where the Worker is, from a `stale-report` body; null when it does not say. */
function currentOf(reply: unknown): { seq: number; phase: RunPhase } | null {
  const c = (reply as { current?: { seq?: unknown; phase?: unknown } } | null)?.current;
  if (!c || typeof c.seq !== 'number' || !Number.isSafeInteger(c.seq) || c.seq < 0) return null;
  return typeof c.phase === 'string' && Object.hasOwn(RANK, c.phase) ? { seq: c.seq, phase: c.phase as RunPhase } : null;
}

/**
 * What a report carries beside its phase: the total, a failed run's sentence, and at `done` whether a granted answer
 * stayed in your changes (`answersStayed`, TL-P4-19 addendum 15: the Worker then starts the run that asks again).
 */
export interface StatusExtra {
  total?: number;
  failure?: string;
  answersStayed?: true;
  questions?: PublicQuestion[];
}

type Answer = { kind: 'taken' } | { kind: 'late'; current: { seq: number; phase: RunPhase } | null };

export class RunnerStatus {
  private readonly url: string;
  private readonly fetchFn: Fetch;
  private seq = 0;
  private questions: PublicQuestion[] | undefined;
  /** The phase the Worker holds this run ended in, once a report found it ended; nothing more is sent. */
  private endedAs: RunPhase | null = null;

  constructor(private readonly opts: RunnerStatusOptions) {
    this.url = `${opts.api.replace(/\/$/, '')}/runner/runs/${encodeURIComponent(opts.runId)}/status`;
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
  }

  /** Whether the Worker already holds this run ended (`done` or `failed`). */
  get finished(): boolean {
    return this.endedAs !== null;
  }

  /** A full durable snapshot, carried by every later report of this attempt as well. */
  async publishQuestions(questions: PublicQuestion[], extra: StatusExtra = {}): Promise<void> {
    if (!isQuestionSnapshot(questions)) throw new BowerError('unknown', 'Bower could not share its questions.');
    const changed = JSON.stringify(this.questions) !== JSON.stringify(questions);
    const hadSnapshot = this.questions !== undefined;
    this.questions = questions;
    // An empty first snapshot needs no extra phase report; the next ordinary report carries it.
    if (changed && (questions.length || hadSnapshot)) await this.post('writing', extra);
  }

  async post(phase: RunPhase, extra: StatusExtra = {}): Promise<void> {
    if (this.endedAs) {
      console.error(`The Worker already holds this run ${this.endedAs}; ${phase} is not sent`);
      return;
    }
    extra = { ...(this.questions === undefined ? {} : { questions: this.questions }), ...extra };
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

  /**
   * "Attempt ended, no terminal report" (`attempt-ended.ts`), for a runner on its way out with no `done` or `failed`
   * taken: the Worker then looks at the run within a minute. Nothing is sent once the Worker holds the run ended.
   * Not taken (a Worker from before it, or one that cannot be reached), it throws; the run waits for its deadline.
   */
  async ended(): Promise<void> {
    if (this.endedAs) return;
    const res = await this.request(attemptEnded(this.opts.attempt));
    if (res.ok) return;
    console.error(`The status route answered ${res.status} for the ended report`);
    throw new BowerError('unknown', "Bower's server didn't answer. It will try again.");
  }

  /**
   * One report sent, with retries: idempotent, since the Worker answers a repeat of the last seq with the current
   * state and changes nothing, even once the run ended, and an ended report only sets when it looks (TL-P3-28; `transport.ts`).
   */
  private async request(body: object): Promise<Response> {
    const text = JSON.stringify(body);
    if (new TextEncoder().encode(text).byteLength > 64 * 1024)
      throw new BowerError('unknown', 'Bower could not share its latest update.');
    try {
      const init = { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.opts.ticket}` }, body: text };
      return await send(this.fetchFn, this.url, init, { idempotent: true, again: serverBusy, pacing: this.opts.pacing });
    } catch (e) {
      console.error(e);
      throw unreached();
    }
  }

  private async send(phase: RunPhase, extra: StatusExtra, seq: number): Promise<Answer> {
    const res = await this.request({ attempt: this.opts.attempt, seq, phase, ...extra });
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
