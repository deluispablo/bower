/**
 * A pretend GitHub for the person object's alarm (TL-P4-14 stage 2: only the alarm dispatches). Admission schedules
 * the dispatch for now, and in a workerd test the runtime fires a due alarm itself (test/time.ts), through the global
 * `fetch`. So this pretend GitHub is the global `fetch` too, for GitHub's address only: everything else still goes to
 * the no-network guard (test/no-network.ts), so no test reaches the network. A dispatch answers `dispatch` (204 by
 * default; null fails the network) and is kept; the run listing is `runs` (none by default).
 *
 * `pretendGitHub` is for one test (`restore` it, or `onTestFinished`); `pretendGitHubForFile` is for a file whose tests
 * admit runs at the wall clock, so an alarm that fires between two tests meets it too.
 */
import { afterAll, beforeAll, vi } from 'vitest';

import type { Env } from '../src/env.js';
import type { GitHubAccess } from '../src/github.js';

/** A dispatch's `client_payload`, as GitHub received it. */
export interface Dispatched {
  run_id: string;
  attempt: number;
  ticket: string;
  scope: string;
  allow_web: boolean;
  api_url: string;
}

export interface GitHubScript {
  dispatch?: number | null;
  runs?: { id: number; display_title: string; status?: string }[];
}

export interface PretendGitHub {
  /** Every dispatch GitHub received, by the alarm the runtime fired or by a test's own `wake`. */
  dispatched: Dispatched[];
  /** Every call, as `METHOD path`. */
  calls: string[];
  /** Every dispatch request as sent: its address and headers. */
  requests: { url: string; method: string; headers: Record<string, string> }[];
  /** For a test's own `wake` or `recover`: the same pretend GitHub. */
  access: GitHubAccess;
  /** What it answers; a test may change it. */
  script: GitHubScript;
  restore(): void;
}

export function pretendGitHub(env: Env, script: GitHubScript = {}): PretendGitHub {
  const dispatched: Dispatched[] = [];
  const calls: string[] = [];
  const requests: PretendGitHub['requests'] = [];
  const repo = `https://api.github.com/repos/${env.GITHUB_REPO}`;
  const gh = { script };
  const answer = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push(`${method} ${new URL(input).pathname}`);
    if (method === 'POST' && input === `${repo}/dispatches`) {
      dispatched.push((JSON.parse(String(init.body)) as { client_payload: Dispatched }).client_payload);
      requests.push({ url: input, method, headers: (init.headers ?? {}) as Record<string, string> });
      if (gh.script.dispatch === null) throw new Error('network down');
      return new Response(null, { status: gh.script.dispatch ?? 204 });
    }
    if (method === 'GET' && input.startsWith(`${repo}/actions/runs?`)) {
      const runs = gh.script.runs ?? [];
      return Response.json({ total_count: runs.length, workflow_runs: runs });
    }
    return new Response(null, { status: 404 });
  };
  const outer = globalThis.fetch;
  const pretend = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    return url.startsWith('https://api.github.com/') ? await answer(url, init) : await outer(input, init);
  };
  globalThis.fetch = pretend as typeof globalThis.fetch;
  return {
    dispatched,
    calls,
    requests,
    access: { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN, apiOrigin: env.API_ORIGIN, fetchImpl: answer },
    get script() {
      return gh.script;
    },
    set script(next: GitHubScript) {
      gh.script = next;
    },
    restore: () => {
      if (globalThis.fetch === pretend) globalThis.fetch = outer;
    },
  };
}

/** A pretend GitHub for every test of the file (`beforeAll` to `afterAll`); read its dispatches by run id. */
export function pretendGitHubForFile(env: Env): PretendGitHub {
  let gh: PretendGitHub | null = null;
  beforeAll(() => {
    gh = pretendGitHub(env);
  });
  afterAll(() => gh?.restore());
  const live = (): PretendGitHub => {
    if (gh === null) throw new Error('the pretend GitHub is set up before the tests');
    return gh;
  };
  return {
    get dispatched() {
      return live().dispatched;
    },
    get calls() {
      return live().calls;
    },
    get requests() {
      return live().requests;
    },
    get access() {
      return live().access;
    },
    get script() {
      return live().script;
    },
    set script(next: GitHubScript) {
      live().script = next;
    },
    restore: () => live().restore(),
  };
}

/** How long a test waits for the runtime's own alarm: it fires at once, and a lost dispatch takes three tries. */
export const WAIT = { timeout: 5000, interval: 20 };

/** Waits until GitHub has received a dispatch of `attempt` for run `runId` (the runtime's own alarm may be sending it). */
export async function dispatchOf(gh: PretendGitHub, runId: string, attempt = 1): Promise<Dispatched> {
  return await vi.waitFor(() => {
    const found = gh.dispatched.find((d) => d.run_id === runId && d.attempt === attempt);
    if (found === undefined) throw new Error(`no dispatch of attempt ${attempt} for ${runId}`);
    return found;
  }, WAIT);
}
