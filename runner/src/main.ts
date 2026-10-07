/**
 * The runner's entry: built to one ESM file (`dist/runner.mjs`). `runTidy` is one runner process for one attempt
 * of a run (TL-P3-22 point 2), in this order:
 *
 * 1. Token: the Worker's token route gives the Drive token, the folder and the admission manifest.
 * 2. Before any write, the folder is checked for this run's report (`last-run.json` showing it done): a run whose
 *    report already landed only reports `done`, so nothing is repeated (worker contract, "Runner wire").
 * 3. Spine: the operations, each behind a checkpoint (`spine/run.ts`); `writing` is reported first.
 * 4. Barrier: once every operation is settled, `saving` is reported, then the report is saved and read back
 *    (`spine/barrier.ts`). A report that cannot be saved leaves the run in `saving`, with "effects done, report
 *    pending" in its chain, for a redispatch to finish; past the recovery ceiling the Worker ends it saying the
 *    changes were made and the summary was not saved.
 * 5. Status: `done`, only after the barrier.
 *
 * The provider (what the run plans from what it took) and the effects (how an operation reaches Drive) are handed
 * in to `runTidy`; `main`, the process on GitHub Actions, hands in the provider `BOWER_PROVIDER` names (scripted by
 * default) and the real Drive effects (`effects.ts`), so a run there really changes the folder. Injected effects
 * are for tests only.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { RunProvider } from '../../src/data/spine/provider';
import { RunRecords } from '../../src/data/spine/records';
import type { ItemDisposition } from '../../src/data/spine/report';
import { shownDone, type Checksum } from '../../src/data/spine/barrier';
import { RunnerDrive } from './drive';
import { RunnerStatus } from './status';
import { RunnerToken } from './token';
import { admittedPlan, runOperations, type Effects } from './spine/run';
import { driveEffects } from './effects';
import { providerFor, providerNamed, type ProviderName } from './provider';
import { finishRun } from './spine/barrier';
import { runnerReads } from './spine/records';

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
}

export type TidyEnd =
  | { phase: 'done'; dispositions: ItemDisposition[] }
  | { phase: 'saving'; why: string }
  | { phase: 'failed'; why: string };

/** What a run whose chain cannot be verified says: it is not touched again. */
const UNREADABLE = 'Bower could not read what it did. Try again later.';

/** Drive's `md5Checksum`: the MD5 of the stored bytes, hex. */
const md5 = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex');

export async function runTidy(opts: TidyOptions): Promise<TidyEnd> {
  const fetchFn = opts.fetch;
  const clock = opts.clock ?? Date.now;
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const token = new RunnerToken({ api: opts.api, runId: opts.runId, ticket: opts.ticket, ...(fetchFn ? { fetch: fetchFn } : {}) });
  const status = new RunnerStatus({ api: opts.api, runId: opts.runId, ticket: opts.ticket, attempt: opts.attempt, ...(fetchFn ? { fetch: fetchFn } : {}) });

  // 1. Token.
  const grant = await token.grant();
  const rootId = grant.folderId;
  const drive = new RunnerDrive({ token, attempt: opts.attempt, ...(fetchFn ? { fetch: fetchFn } : {}) });
  opts.onDrive?.(drive);
  const reads = runnerReads(drive, opts.runId);
  const records = new RunRecords(reads, rootId);
  const checksum: Checksum = { stored: (id) => drive.md5(id), of: async (bytes) => md5(bytes) };

  // 2. This run's report already in the folder: nothing to repeat.
  if (await shownDone(reads, rootId, opts.runId)) {
    await status.post('done');
    return { phase: 'done', dispositions: [] };
  }

  // 3. Spine.
  await status.post('writing');
  const end = await runOperations({
    rootId,
    runId: opts.runId,
    attempt: opts.attempt,
    records,
    batch: () => drive.batch(),
    effects: opts.effects(drive),
    plan: admittedPlan(token, drive, opts.provider(drive, rootId)),
    clock,
    newId,
  });
  if (end.state === 'failed') {
    console.error(end.why);
    await status.post('failed', { failure: UNREADABLE });
    return { phase: 'failed', why: end.why };
  }

  // 4. Barrier: every effect settled, the report pending.
  await status.post('saving', { total: end.manifest.capture.members.length });
  let finished;
  try {
    finished = await finishRun(
      { rootId, runId: opts.runId, attempt: opts.attempt, records, reads, checksum, batch: () => drive.batch(), admission: grant.manifest, clock, newId },
      end.manifest,
      end.manifestHash,
      end.chain,
    );
  } catch (e) {
    console.error(e);
    return { phase: 'saving', why: e instanceof Error ? e.message : String(e) };
  }

  // 5. Status, only after the report is read back.
  await status.post('done');
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
}

/**
 * The process on GitHub Actions: the provider `BOWER_PROVIDER` names (scripted when unset), the Worker at
 * `BOWER_API_URL`, and the dispatch from the event file at `GITHUB_EVENT_PATH`, which is where the ticket stays: it
 * is never put in the environment or printed, and on Actions it is masked in the log first
 * (https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#masking-a-value-in-a-log).
 * Gives the exit code: 0 once the run ended (done, failed, or saving for a redispatch to finish), 1 when it could
 * not start or stopped on an error, said in the log.
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
  try {
    const end = await runTidy({
      api,
      runId,
      ticket,
      attempt,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      provider: (drive, rootId) => providerFor(name, drive, { rootId, runId, allowWeb }),
      effects: driveEffects,
    });
    console.log(`Tidy-up ${runId} ended ${end.phase}.`);
    if (end.phase !== 'done') console.error(end.why);
    return 0;
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
