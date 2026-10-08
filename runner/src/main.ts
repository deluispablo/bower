/**
 * The runner's entry: built to one ESM file (`dist/runner.mjs`). `runTidy` is one runner process for one attempt
 * of a run (TL-P3-22 point 2), in this order:
 *
 * 1. Token: the Worker's token route gives the Drive token, the folder and the admission manifest.
 * 2. Before any write, the folder is checked for this run's report (`last-run.json` showing it done): a run whose
 *    report already landed is not repeated. It reads the report back, commits `done` to its chain (when a runner
 *    stopped before that), then reports `done` (worker contract, "Runner wire").
 * 3. Spine: the operations, each behind a checkpoint (`spine/run.ts`); `writing` is reported first. A new run
 *    repairs the old template's `Rules.md` (`rules-repair.ts`) just before it plans.
 * 4. Barrier: once every operation is settled, "effects done, report pending" is committed to the chain, and only
 *    then, when the chain holds an applied effect, is `saving` reported. The report is saved and read back
 *    (`spine/barrier.ts`).
 * 5. Status: `done`, only after the barrier. A `done` the Worker refuses is never swallowed: the job fails.
 * 6. Timing: one line per run, however it ends, with each phase's own time and the model's numbers (`timing.ts`).
 *
 * How a run that stops ends (ARCHITECTURE invariant 6; TL-P3-22 addendum, I1), for a report that cannot be saved
 * and for any error nobody caught from the token to the last report, alike:
 * - when its chain holds an effect that was applied (or may have been sent), it stays in `saving`, for a
 *   redispatch to finish; past the recovery ceiling the Worker ends it saying the changes were made and the
 *   summary was not saved. It never says nothing happened.
 * - otherwise, only when it read its run's chain and found no such effect in it, it ends `failed` with "The tidy-up
 *   stopped before changing anything. Try again." (`B_FAILURE`).
 * - when it could not read its run's chain (a restarted runner whose first Drive read fails, or a token that never
 *   came), it says nothing: it throws, so the job fails visibly, and the Worker's recovery decides how the run ends.
 * A run taken over by a newer attempt, or no longer allowed, reports nothing more.
 *
 * The provider (what the run plans from what it took) and the effects (how an operation reaches Drive) are handed
 * in to `runTidy`; `main`, the process on GitHub Actions, hands in the provider `BOWER_PROVIDER` names (scripted by
 * default) and the real Drive effects (`effects.ts`), so a run there really changes the folder. Injected effects
 * are for tests only.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { Checkpoint } from '../../src/data/contracts/run-checkpoint';
import { admittedThings } from '../../src/data/spine/admission';
import type { RunProvider } from '../../src/data/spine/provider';
import { B_FAILURE } from '../../src/data/spine/scripted';
import { BowerError } from '../../src/data/types';
import { RunRecords } from '../../src/data/spine/records';
import type { ItemDisposition } from '../../src/data/spine/report';
import { shownDone, type Checksum } from '../../src/data/spine/barrier';
import { RunnerDrive } from './drive';
import { RunnerStatus } from './status';
import { NO_LONGER_ALLOWED, RunnerToken, isGone, isStaleAttempt } from './token';
import { admittedPlan, runOperations, type Effects } from './spine/run';
import { driveEffects } from './effects';
import type { ClaudeSpawn } from './claude';
import { providerFor, providerNamed, type ProviderName } from './provider';
import { finishRun } from './spine/barrier';
import { runnerReads } from './spine/records';
import { repairRules } from './rules-repair';
import { RunTiming } from './timing';

export { RunnerDrive, type RunnerDriveOptions } from './drive';
export { RunnerToken, isStaleAttempt, type RunnerTokenOptions, type TokenGrant } from './token';
export { RunnerStatus, type RunnerStatusOptions } from './status';

export interface TidyOptions {
  /** The Worker's origin. */
  api: string;
  runId: string;
  ticket: string;
  /** This runner's attempt, from its dispatch. */
  attempt: number;
  fetch?: typeof fetch;
  /** What plans a new run from what it took, read through this runner's adapter in the folder (`rootId`). */
  provider(drive: RunnerDrive, rootId: string): RunProvider;
  /** How operations reach Drive through this runner's adapter. */
  effects(drive: RunnerDrive): Effects;
  clock?: () => number;
  newId?: () => string;
  /** Sees the adapter before the run starts (tests set its fault hook). */
  onDrive?: (drive: RunnerDrive) => void;
  /** Where the run's time goes, logged as one line when it ends (`timing.ts`); the provider adds the model's. */
  timing?: RunTiming;
}

export type TidyEnd =
  | { phase: 'done'; dispositions: ItemDisposition[] }
  | { phase: 'saving'; why: string }
  | { phase: 'failed'; why: string };

/** What a run whose chain cannot be verified says: it is not touched again. */
const UNREADABLE = 'Bower could not read what it did. Try again later.';

/** Drive's `md5Checksum`: the MD5 of the stored bytes, hex. */
const md5 = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex');

/** Whether a chain holds an effect that changed the folder, or may have: applied, or sent with no answer kept. */
const changedSomething = (chain: readonly Checkpoint[]): boolean =>
  chain.at(-1)?.outcomes.some((o) => o.state === 'applied' || o.state === 'possible-effect') ?? false;

/**
 * Times each checkpoint write as the `checkpoints` phase, once: `putNew` with no folder known yet calls `put`, which
 * is already timed, so a write inside a timed one is not counted again.
 */
export function timeCheckpoints(records: RunRecords, timing: RunTiming): void {
  const put = records.put.bind(records);
  const putNew = records.putNew.bind(records);
  let inside = false;
  const timed = <A extends unknown[]>(write: (...args: A) => Promise<void>) => (...args: A): Promise<void> => {
    const name: unknown = args[2];
    if (inside || typeof name !== 'string' || !name.startsWith('checkpoint-')) return write(...args);
    inside = true;
    return timing.time('checkpoints', () => write(...args)).finally(() => { inside = false; });
  };
  records.put = timed(put);
  records.putNew = timed(putNew);
}

/** An error after which this runner may not report at all: a newer attempt took the run, or the ticket was refused. */
const mayNotReport = (e: unknown): boolean => isStaleAttempt(e) || (e instanceof BowerError && e.code === 'auth');

export async function runTidy(opts: TidyOptions): Promise<TidyEnd> {
  const timing = opts.timing ?? new RunTiming();
  let ended: 'done' | 'saving' | 'failed' | 'stopped' = 'stopped';
  try {
    const end = await tidyRun(opts, timing);
    ended = end.phase;
    return end;
  } finally {
    console.log(timing.line(ended));
  }
}

async function tidyRun(opts: TidyOptions, timing: RunTiming): Promise<TidyEnd> {
  const fetchFn = opts.fetch;
  const token = new RunnerToken({ api: opts.api, runId: opts.runId, ticket: opts.ticket, ...(fetchFn ? { fetch: fetchFn } : {}) });
  const status = new RunnerStatus({ api: opts.api, runId: opts.runId, ticket: opts.ticket, attempt: opts.attempt, ...(fetchFn ? { fetch: fetchFn } : {}) });
  const post = status.post.bind(status);
  status.post = (...args) => timing.time('status', () => post(...args));
  const seen: Seen = { chain: null, saving: false, total: undefined };
  let end: Ended;
  try {
    end = await tidy(opts, token, status, seen, timing);
  } catch (e) {
    // The person is gone (Delete me, or Google access revoked): nothing more is written, and the run ends failed with
    // the signed-out sentence, which is true whatever it changed before. After Delete me the Worker refuses the report too.
    if (isGone(e)) {
      console.error(e);
      if (!status.finished) await status.post('failed', { failure: NO_LONGER_ALLOWED }).catch((err: unknown) => console.error(err));
      return { phase: 'failed', why: NO_LONGER_ALLOWED };
    }
    if (mayNotReport(e) || status.finished) throw e;
    end = { phase: 'stopped', why: e instanceof Error ? e.message : String(e), error: e };
  }
  if (end.phase === 'done') {
    // 5. Status, only after the report is read back; refused, it throws.
    await status.post('done', totalOf(seen.total));
    return end;
  }
  if (end.phase === 'failed') return end;
  // Its chain never read: what it changed is unknown here, so nothing is said (TL-P3-22 addendum, I1).
  if (seen.chain === null) throw end.error;
  console.error(end.error);
  // The one rule for a run that stops: saving when it changed something, never "nothing changed" then.
  if (changedSomething(seen.chain)) {
    if (!seen.saving) await status.post('saving', totalOf(seen.total));
    return { phase: 'saving', why: end.why };
  }
  await status.post('failed', { failure: B_FAILURE });
  return { phase: 'failed', why: end.why };
}

/** What `tidy` saw: the run's chain as read and as it grew (null until it was read), and whether `saving` was reported. */
interface Seen {
  chain: Checkpoint[] | null;
  saving: boolean;
  /** The admitted things (pile members; your changes are not things), on every report from `reading` (undefined until known). */
  total: number | undefined;
}

const totalOf = (total: number | undefined): { total?: number } => (total === undefined ? {} : { total });

type Ended = Exclude<TidyEnd, { phase: 'saving' }> | { phase: 'stopped'; why: string; error: unknown };

/** Steps 1 to 4; a run that stops in them throws, and `runTidy` says how it ended. */
async function tidy(opts: TidyOptions, token: RunnerToken, status: RunnerStatus, seen: Seen, timing: RunTiming): Promise<Ended> {
  const fetchFn = opts.fetch;
  const clock = opts.clock ?? Date.now;
  const newId = opts.newId ?? (() => crypto.randomUUID());

  // 1. Token.
  const grant = await timing.time('token', () => token.grant());
  const rootId = grant.folderId;
  if (grant.manifest) seen.total = admittedThings(grant.manifest);
  const drive = new RunnerDrive({ token, attempt: opts.attempt, ...(fetchFn ? { fetch: fetchFn } : {}) });
  opts.onDrive?.(drive);
  const reads = runnerReads(drive, opts.runId);
  const records = new RunRecords(reads, rootId);
  timeCheckpoints(records, timing);
  const checksum: Checksum = { stored: (id) => drive.md5(id), of: async (bytes) => md5(bytes) };
  const barrier = { rootId, runId: opts.runId, attempt: opts.attempt, records, reads, checksum, batch: () => drive.batch(), fenced: () => drive.fencedWrites(), admission: grant.manifest, clock, newId };

  // 2. This run's report already in the folder: nothing is repeated. Its chain says done before the Worker hears it.
  if (await timing.time('reads', () => shownDone(reads, rootId, opts.runId))) {
    const found = await records.found(opts.runId);
    if (found.kind === 'run') seen.chain = found.chain;
    if (found.kind === 'run') seen.total ??= found.manifest.capture.members.length;
    if (found.kind === 'run' && found.chain.length) {
      const finished = await finishRun(barrier, found.manifest, found.manifestHash, found.chain);
      return { phase: 'done', dispositions: finished.dispositions };
    }
    // No chain to say it in (its records already let go of): the report itself is what landed.
    console.error(`Run ${opts.runId} shows done with no chain of its own`);
    return { phase: 'done', dispositions: [] };
  }

  // 3. Spine. A new run reads first: `reading` with the total, before any operation. A resumed attempt (its run already
  // holds a manifest) is past `reading`, so it sends none and keeps the total.
  const resumed = await timing.time('reads', () => records.found(opts.runId));
  if (resumed.kind === 'run') seen.total ??= resumed.manifest.capture.members.length;
  else await status.post('reading', totalOf(seen.total));
  await status.post('writing', totalOf(seen.total));
  const plan = admittedPlan(token, drive, opts.provider(drive, rootId));
  const end = await timing.time('apply', () => runOperations({
    rootId,
    runId: opts.runId,
    attempt: opts.attempt,
    records,
    batch: () => drive.batch(),
    fenced: () => drive.fencedWrites(),
    effects: opts.effects(drive),
    // The old template's Rules.md is repaired first, so the planner sees a file Bower may word (`rules-repair.ts`).
    plan: () =>
      timing.time('reads', () => plan(() => repairRules(drive, rootId, () => reads.listAll(rootId)))),
    clock,
    newId,
    onChain: (chain) => {
      seen.chain = chain;
    },
  }));
  if (end.state === 'failed') {
    console.error(end.why);
    await status.post('failed', { failure: UNREADABLE });
    return { phase: 'failed', why: end.why };
  }

  // 4. Barrier: `saving` only once "effects done, report pending" is in the chain, and only when it changed something.
  const finished = await timing.time('report', () => finishRun(
    {
      ...barrier,
      onPending: async (chain) => {
        seen.chain = chain;
        if (!changedSomething(chain)) return;
        await status.post('saving', totalOf(seen.total ?? end.manifest.capture.members.length));
        seen.saving = true;
      },
    },
    end.manifest,
    end.manifestHash,
    end.chain,
  ));
  return { phase: 'done', dispositions: finished.dispositions };
}

/** What a `bower-tidy` dispatch carries (worker contract, "Runner wire"). */
export interface Dispatch {
  runId: string;
  attempt: number;
  ticket: string;
  scope: 'all' | 'instructions';
  allowWeb: boolean;
}

/** The dispatch's `client_payload`, from the event file Actions writes; null when it is not one. */
export function dispatchOf(event: unknown): Dispatch | null {
  const p = (event as { client_payload?: Record<string, unknown> } | null)?.client_payload;
  if (!p || typeof p !== 'object') return null;
  const { run_id: runId, attempt, ticket, scope, allow_web: allowWeb } = p;
  if (typeof runId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(runId)) return null;
  if (typeof attempt !== 'number' || !Number.isSafeInteger(attempt) || attempt < 1) return null;
  if (typeof ticket !== 'string' || !ticket) return null;
  if (scope !== 'all' && scope !== 'instructions') return null;
  return { runId, attempt, ticket, scope, allowWeb: allowWeb === true };
}

export interface MainOptions {
  fetch?: typeof fetch;
  /** A recorded `claude` for the Claude provider; tests only. */
  claude?: ClaudeSpawn;
}

/**
 * The process on GitHub Actions: the provider `BOWER_PROVIDER` names (scripted when unset), the Worker at
 * `BOWER_API_URL`, and the dispatch from the event file at `GITHUB_EVENT_PATH`, which is where the ticket stays: it
 * is never put in the environment or printed, and on Actions it is masked in the log first
 * (https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#masking-a-value-in-a-log).
 * Gives the exit code: 0 once the Worker took a terminal report (`done` or `failed`, or it already held the run
 * ended); 1 when it could not start, stopped on an error, or was left in `saving` for a redispatch to finish, said in
 * the log. Nothing runs after `done` is taken (the report is saved and read back before it), so a run already done
 * never ends non-zero by a later step.
 */
export async function main(env: Readonly<Record<string, string | undefined>>, opts: MainOptions = {}): Promise<number> {
  let name: ProviderName;
  try {
    name = providerNamed(env.BOWER_PROVIDER);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
  const api = env.BOWER_API_URL?.trim();
  if (!api || !/^https?:\/\/[^/]+$/.test(api)) {
    console.error('BOWER_API_URL must be the Worker\'s origin, for example https://api.example.com (a repository variable).');
    return 1;
  }
  let dispatch: Dispatch | null = null;
  try {
    dispatch = env.GITHUB_EVENT_PATH ? dispatchOf(JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'))) : null;
  } catch (e) {
    console.error(e);
  }
  if (!dispatch) {
    console.error('No bower-tidy dispatch to run: GITHUB_EVENT_PATH must hold its client_payload (run_id, attempt, ticket, scope, allow_web).');
    return 1;
  }
  if (env.GITHUB_ACTIONS === 'true') process.stdout.write(`::add-mask::${dispatch.ticket}\n`);
  const { runId, attempt, ticket, allowWeb } = dispatch;
  console.log(`Tidy-up ${runId}, attempt ${attempt}, with the ${name} provider.`);
  // The job's start up to here: Node's uptime, as the original's queue and set-up row.
  const timing = new RunTiming(process.uptime() * 1000);
  try {
    const end = await runTidy({
      api,
      runId,
      ticket,
      attempt,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      provider: (drive, rootId) => providerFor(name, drive, { rootId, runId, allowWeb }, { env, timing, ...(opts.claude ? { spawn: opts.claude } : {}) }),
      timing,
      effects: driveEffects,
    });
    console.log(`Tidy-up ${runId} ended ${end.phase}.`);
    if (end.phase !== 'done') console.error(end.why);
    // Left in saving with no terminal report: the job fails, so it never shows success for an unfinished run; the
    // Worker's alarm recovery still redispatches it (TL-P3-28).
    return end.phase === 'saving' ? 1 : 0;
  } catch (e) {
    console.error(e);
    return 1;
  }
}

// Run as the bundle's entry (`node runner/dist/runner.mjs`), never when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.env).then((code) => {
    process.exitCode = code;
  }, (e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
