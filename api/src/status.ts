/**
 * `GET /status`: the signed-in user's current run, with staleness. A
 * `queued` or `running` run past its window (`runStaleness` in
 * `process.ts`) is marked `failed` with `error: 'stale'` before being
 * returned, so the app never shows a run the runner will never report on.
 *
 * Before that window ends, a `running` run whose runner never sent its last
 * report is settled from the GitHub job itself (#315): once the run has
 * gone `JOB_CHECK_AFTER_MS` without news, the Worker reads the workflow run
 * the runner named (`runId`, GitHub's own run id) at most once every
 * `JOB_CHECK_INTERVAL_MS`, and a finished job makes the run `done`
 * (`success`) or `failed` (anything else), its ticket retired.
 *
 * `GET /runs` (#345): the signed-in user's finished tidy-ups, newest
 * first, from the run history `putRun` keeps (`recordRun` in `store.ts`),
 * for the Bower tab's Activity.
 *
 * Nothing here logs file names, vault content or tokens.
 */

import { Hono } from 'hono';

import type { AuthDeps } from './auth.js';
import { requireSession } from './auth.js';
import type { AppEnv, Env } from './env.js';
import { getWorkflowRun } from './github.js';
import type { FetchLike } from './google.js';
import { markStale, runStaleness } from './process.js';
import { deleteRunTicket, getRun, listRuns, putRun } from './store.js';
import type { Run, RunFailureReason } from './types.js';

/** What `GET /status` answers. */
export interface StatusBody {
  run: Run | null;
  stale: boolean;
}

/** What `GET /runs` answers. */
export interface RunsBody {
  runs: Run[];
}

/**
 * How long a `running` run goes without news before `GET /status` asks
 * GitHub how its job ended: a tidy-up usually takes three to five minutes.
 */
export const JOB_CHECK_AFTER_MS = 5 * 60 * 1000;

/** The least time between two GitHub lookups for the same run. */
export const JOB_CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Whether `run` is due a job lookup at `now`: `running`, with a GitHub run
 * id (digits: the runner's `GITHUB_RUN_ID`, never the Worker's own UUID),
 * started `JOB_CHECK_AFTER_MS` ago or more, and not looked up in the last
 * `JOB_CHECK_INTERVAL_MS`.
 */
export function jobCheckDue(run: Run | undefined, now: Date): boolean {
  if (run?.state !== 'running') return false;
  if (run.runId === undefined || !/^\d+$/.test(run.runId)) return false;
  const started = Date.parse(run.startedAt ?? run.requestedAt);
  if (now.getTime() - started < JOB_CHECK_AFTER_MS) return false;
  if (run.jobCheckedAt === undefined) return true;
  return now.getTime() - Date.parse(run.jobCheckedAt) >= JOB_CHECK_INTERVAL_MS;
}

/**
 * `run` settled from its GitHub job's `conclusion` at `now`: `success` is
 * `done`; anything else (`failure`, `cancelled`, `timed_out`, …) is
 * `failed` with `error: 'job <conclusion>'` and a reason for the app
 * (#1000): `timed_out` is `timeout`; any other conclusion, `cancelled`
 * included (someone may have cancelled the job), is `unknown`. The
 * runner's own report never arrived, so there is no summary or processed
 * list to keep.
 */
export function settleFromJob(run: Run, conclusion: string, now: Date): Run {
  const settled: Run = { ...run, finishedAt: now.toISOString() };
  delete settled.jobCheckedAt;
  if (conclusion === 'success') return { ...settled, state: 'done' };
  const reason: RunFailureReason =
    conclusion === 'timed_out' ? 'timeout' : 'unknown';
  return { ...settled, state: 'failed', error: `job ${conclusion}`, reason };
}

/**
 * The job-conclusion fallback for one due run: reads the workflow run and
 * stores what it learnt. Returns the run as stored (settled, or only
 * stamped with `jobCheckedAt`).
 */
async function checkJob(
  env: Env,
  userId: string,
  run: Run & { runId: string },
  now: Date,
  fetchImpl: FetchLike,
): Promise<Run> {
  const job = await getWorkflowRun(
    { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN, runId: run.runId },
    fetchImpl,
  );
  if (job?.status === 'completed' && job.conclusion !== null) {
    const settled = settleFromJob(run, job.conclusion, now);
    await putRun(env.BOWER_KV, userId, settled);
    // As after a final report: the run is over, so its ticket is retired
    // and a late report from it answers 401.
    await deleteRunTicket(env.BOWER_KV, userId, 'ingest');
    return settled;
  }
  const checked: Run = { ...run, jobCheckedAt: now.toISOString() };
  await putRun(env.BOWER_KV, userId, checked);
  return checked;
}

/** `GET /status` and `GET /runs` as a Hono sub-app, mounted at `/` by `index.ts`. */
export function createStatusRoutes(deps: AuthDeps = {}): Hono<AppEnv> {
  const fetchImpl: FetchLike =
    deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const routes = new Hono<AppEnv>();

  routes.get('/status', requireSession, async (c) => {
    const env = c.get('env');
    const kv = env.BOWER_KV;
    const userId = c.get('userId');
    const now = new Date();

    let current = await getRun(kv, userId);
    if (current !== undefined && jobCheckDue(current, now)) {
      current = await checkJob(
        env,
        userId,
        current as Run & { runId: string },
        now,
        fetchImpl,
      );
    }
    const { stale } = runStaleness(current, now);
    if (stale && current !== undefined) {
      const failed = markStale(current, now);
      await putRun(kv, userId, failed);
      return c.json({ run: failed, stale: true } satisfies StatusBody);
    }
    return c.json({ run: current ?? null, stale: false } satisfies StatusBody);
  });

  routes.get('/runs', requireSession, async (c) => {
    const env = c.get('env');
    const runs = await listRuns(env.BOWER_KV, c.get('userId'));
    return c.json({ runs } satisfies RunsBody);
  });

  return routes;
}
