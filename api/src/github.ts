/**
 * The Worker's call to GitHub for a tidy-up run (worker contract, "Runner wire"; TL-P3-18): one
 * `repository_dispatch` with `event_type: "bower-tidy"`. Adapted from the original app's `api/src/github.ts`
 * (same URL and headers). GitHub documents the endpoint: "Create a repository dispatch event", which answers
 * 204 when accepted (https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event).
 *
 * A 204 means accepted, not started. Nothing here logs the ticket or the token; a failure logs the status only.
 */
import type { FetchLike } from './google.js';
import type { RunScope } from './process.js';

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
}

/** How the person object reaches GitHub: the instance repository, the token (absent: not configured), and fetch. */
export interface GitHubAccess {
  repo: string;
  token: string | undefined;
  fetchImpl: FetchLike;
}

const API_URL = 'https://api.github.com';

/** Sends the dispatch; resolves whether GitHub accepted it. Never throws, never logs a secret. */
export async function dispatchTidy(input: TidyDispatch, fetchImpl: FetchLike): Promise<boolean> {
  if (input.token === undefined) {
    console.error('tidy dispatch is not configured: no GitHub token');
    return false;
  }
  let response: Response;
  try {
    response = await fetchImpl(`${API_URL}/repos/${input.repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'bower-api',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'bower-tidy',
        client_payload: {
          run_id: input.runId,
          attempt: input.attempt,
          ticket: input.ticket,
          scope: input.scope,
          allow_web: input.allowWeb,
        },
      }),
    });
  } catch {
    // The error's message could carry anything; log that the network failed, nothing more.
    console.error('tidy dispatch failed: network error');
    return false;
  }
  if (response.status !== 204) {
    console.error(`tidy dispatch failed: status ${response.status}`);
    return false;
  }
  return true;
}
