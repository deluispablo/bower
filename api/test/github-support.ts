/**
 * A pretend GitHub for the person object's alarm (TL-P4-14 stage 2: only the alarm dispatches). Admission schedules
 * the dispatch for now, and in a workerd test the runtime fires a due alarm itself (test/time.ts), through the global
 * `fetch`. So this pretend GitHub is the global `fetch` for the test too: a dispatch answers `dispatch` (204 by
 * default; null fails the network) and is kept; the run listing is `runs` (none by default); anything else goes to the
 * no-network guard (test/no-network.ts). Restored when the test finishes.
 */
import { onTestFinished, vi } from 'vitest';

import type { Env } from '../src/env.js';
import type { GitHubAccess } from '../src/github.js';

/** A dispatch's `client_payload`, as GitHub received it. */
export interface Dispatched {
  run_id: string;
  attempt: number;
  ticket: string;
  scope: string;
  allow_web: boolean;
}

export interface PretendGitHub {
  /** Every dispatch GitHub received, by the alarm the runtime fired or by a test's own `wake`. */
  dispatched: Dispatched[];
  /** Every call, as `METHOD path`. */
  calls: string[];
  /** For a test's own `wake` or `recover`: the same pretend GitHub. */
  access: GitHubAccess;
}

export function pretendGitHub(env: Env, opts: { dispatch?: number | null; runs?: { id: number; display_title: string; status?: string }[] } = {}): PretendGitHub {
  const dispatched: Dispatched[] = [];
  const calls: string[] = [];
  const guard = globalThis.fetch;
  const repo = `https://api.github.com/repos/${env.GITHUB_REPO}`;
  const answer = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push(`${method} ${new URL(input).pathname}`);
    if (method === 'POST' && input === `${repo}/dispatches`) {
      dispatched.push((JSON.parse(String(init.body)) as { client_payload: Dispatched }).client_payload);
      if (opts.dispatch === null) throw new Error('network down');
      return new Response(null, { status: opts.dispatch ?? 204 });
    }
    if (method === 'GET' && input.startsWith(`${repo}/actions/runs?`)) {
      const runs = opts.runs ?? [];
      return Response.json({ total_count: runs.length, workflow_runs: runs });
    }
    return new Response(null, { status: 404 });
  };
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    return url.startsWith('https://api.github.com/') ? await answer(url, init) : await guard(input, init);
  });
  onTestFinished(() => spy.mockRestore());
  return { dispatched, calls, access: { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN, fetchImpl: answer } };
}

/** Waits until GitHub has received `n` dispatches (the runtime's own alarm may still be sending one). */
export async function dispatchesReach(gh: PretendGitHub, n: number): Promise<void> {
  await vi.waitFor(() => {
    if (gh.dispatched.length < n) throw new Error(`${gh.dispatched.length} of ${n} dispatches`);
  });
}
