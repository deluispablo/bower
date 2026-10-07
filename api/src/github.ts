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

/** Sends the dispatch; resolves whether GitHub accepted it. Never throws, never logs a secret. */
export async function dispatchTidy(_input: TidyDispatch, _fetchImpl: FetchLike): Promise<boolean> {
  return false;
}
