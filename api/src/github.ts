/**
 * The Worker's call to GitHub for a tidy-up run (worker contract, "Runner wire"; TL-P3-18): one
 * `repository_dispatch` with `event_type: "bower-tidy"`. Adapted from the original app's `api/src/github.ts`
 * (same URL and headers). GitHub documents the endpoint: "Create a repository dispatch event", which answers
 * 204 when accepted (https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event).
 *
 * A 204 means accepted, not started. Nothing here logs the ticket or the token; a failure logs the status only.
 */
import { askAgainNow } from '../../src/data/drive/drive-http.js';
import type { FetchLike } from './google.js';
import type { RunScope } from '../../src/data/contracts/run-wire.js';
import type { TidyJob, TidyLookup } from './recovery.js';

export interface TidyDispatch {
  /** The instance repository, `owner/name` (`GITHUB_REPO`). */
  repo: string;
  /** `GITHUB_TOKEN`; absent means dispatch is not configured. */
  token: string | undefined;
  runId: string;
  attempt: number;
  ticket: string;
  scope: RunScope;
  allowWeb: boolean;
  /** The Worker's own origin (`API_ORIGIN`): the runner calls back here, so one repository can serve many Workers. */
  apiOrigin: string;
}

/** How the person object reaches GitHub: the instance repository, the token (absent: not configured), and fetch. */
export interface GitHubAccess {
  repo: string;
  token: string | undefined;
  /** This Worker's `API_ORIGIN`, named in every dispatch. */
  apiOrigin: string;
  fetchImpl: FetchLike;
}

const API_URL = 'https://api.github.com';

/** GitHub's REST headers (https://docs.github.com/en/rest/about-the-rest-api/api-versions). */
function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'bower-api',
  };
}

/**
 * A failed dispatch is tried again twice, after 200 ms and 400 ms, each wait cut by up to half at random so
 * callers do not retry in step: truncated exponential backoff with jitter, as Google's retry guidance and
 * AWS's "Exponential backoff and jitter" describe. Only a network error or a 5xx is retried (the server may
 * accept it next time); a 4xx would fail the same way again.
 */
const RETRY_BASE_MS = 200;
const RETRIES = 2;

/** Tests set `scale` to 0 so a retry's wait takes no real time; the waits themselves (200 and 400 ms) are tested through `sleep`. */
export const backoffPace = { scale: 1 };
const sleepFor = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms * backoffPace.scale));

/** What became of a dispatch: accepted; lost to the network or a 5xx after the retries (worth a quick look); or refused (a 4xx, or no token). */
export type DispatchOutcome = 'sent' | 'lost' | 'refused';

/**
 * Sends the dispatch; resolves what became of it: only a `lost` dispatch may succeed on a quick try again.
 * Never throws, never logs a secret.
 */
export async function dispatchOutcome(input: TidyDispatch, fetchImpl: FetchLike, sleep: (ms: number) => Promise<void> = sleepFor): Promise<DispatchOutcome> {
  if (input.token === undefined) {
    console.error('tidy dispatch is not configured: no GitHub token');
    return 'refused';
  }
  const init = {
    method: 'POST',
    headers: { ...headers(input.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: 'bower-tidy',
      client_payload: {
        run_id: input.runId,
        attempt: input.attempt,
        ticket: input.ticket,
        scope: input.scope,
        allow_web: input.allowWeb,
        api_url: input.apiOrigin,
      },
    }),
  };
  for (let tried = 0; ; tried += 1) {
    let status: number | null;
    try {
      status = (await fetchImpl(`${API_URL}/repos/${input.repo}/dispatches`, init)).status;
    } catch {
      // The error's message could carry anything; log that the network failed, nothing more.
      console.error('tidy dispatch failed: network error');
      status = null;
    }
    if (status === 204) return 'sent';
    if (status !== null) console.error(`tidy dispatch failed: status ${status}`);
    // Told by the one table (`transport.ts`): what may be asked again is, the rest was refused.
    if (status !== null && !askAgainNow(status, [])) return 'refused';
    if (tried >= RETRIES) return 'lost';
    await sleep(RETRY_BASE_MS * 2 ** tried * (0.5 + Math.random() / 2));
  }
}

/** The run name the workflow gives an attempt (`run-name` in the workflow; GitHub's `display_title`). */
export function tidyRunName(runId: string, attempt: number): string {
  return `tidy ${runId} ${attempt}`;
}

/** How many recent `repository_dispatch` runs the lookup reads: one page (GitHub's largest). */
const RUNS_PAGE = 100;
/** At most this many runs with the attempt's name have their jobs read (R3: a duplicate dispatch makes two). */
const MATCHES_READ = 3;

/** One GET to GitHub; the parsed JSON, or null (logged by status only) when it fails. */
async function getJson(url: string, token: string, fetchImpl: FetchLike): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers: headers(token) });
  } catch {
    console.error('tidy lookup failed: network error');
    return null;
  }
  if (!response.ok) {
    console.error(`tidy lookup failed: status ${response.status}`);
    return null;
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    console.error('tidy lookup failed: unreadable reply');
    return null;
  }
}

function listOf(value: unknown, key: string): Record<string, unknown>[] | null {
  if (value === null || typeof value !== 'object') return null;
  const list = (value as Record<string, unknown>)[key];
  if (!Array.isArray(list)) return null;
  return list.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object');
}

function time(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Finds attempt `attempt` of run `runId` on GitHub Actions by its run name, and reads its jobs. GitHub
 * documents both calls: "List workflow runs for a repository", filtered by `event`
 * (https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository; a run's
 * `display_title` is its `run-name`), and "List jobs for a workflow run"
 * (https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run). Null when a call
 * fails. Never throws, never logs a secret.
 */
export async function findTidyRun(
  input: { repo: string; token: string; runId: string; attempt: number },
  fetchImpl: FetchLike,
): Promise<TidyLookup | null> {
  const runs = listOf(
    await getJson(`${API_URL}/repos/${input.repo}/actions/runs?event=repository_dispatch&per_page=${RUNS_PAGE}`, input.token, fetchImpl),
    'workflow_runs',
  );
  if (runs === null) return null;
  const name = tidyRunName(input.runId, input.attempt);
  const matches = runs.filter((run) => run.display_title === name && typeof run.id === 'number').slice(0, MATCHES_READ);
  if (matches.length === 0) return { found: false };
  const jobs: TidyJob[] = [];
  for (const run of matches) {
    const list = listOf(await getJson(`${API_URL}/repos/${input.repo}/actions/runs/${String(run.id)}/jobs`, input.token, fetchImpl), 'jobs');
    if (list === null) return null;
    for (const job of list) {
      jobs.push({
        status: typeof job.status === 'string' ? job.status : 'queued',
        startedAt: time(job.started_at),
        completedAt: time(job.completed_at),
      });
    }
  }
  return { found: true, jobs };
}
