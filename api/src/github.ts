/**
 * The Worker's only call to GitHub: a `repository_dispatch` on the
 * operator's instance repo, which starts the `ingest` workflow there, or
 * one run of the `lint` workflow for one vault.
 *
 * Nothing here logs the token or a run ticket; a failure logs GitHub's status and request
 * id only.
 */

import { HttpError } from './errors.js';
import type { FetchLike } from './google.js';

export const GITHUB_API_URL = 'https://api.github.com';

export interface DispatchRunInput {
  /** The instance repo, `owner/name` (`GITHUB_REPO`). */
  repo: string;
  /** Fine-grained token with `contents: write` on `repo` (`GITHUB_TOKEN`). */
  token: string;
  /**
   * The vault to run on. This is the user's id: one vault per user, and
   * the runner fetches its credentials with `GET /runner/vaults/:id`.
   */
  vaultId: string;
  /**
   * The run's ticket (`run-ticket.ts`): the only credential the runner job
   * gets for the Worker, good for this vault and this run only.
   */
  ticket: string;
}

/**
 * Sends `repository_dispatch` with `event_type` and
 * `client_payload: { vault_id, ticket }` to `repo`. GitHub answers 204 when
 * the event is accepted; anything else (or a network failure) is a 502
 * `dispatch`.
 */
async function dispatchRun(
  eventType: string,
  { repo, token, vaultId, ticket }: DispatchRunInput,
  fetchImpl: FetchLike,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(`${GITHUB_API_URL}/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'bower-api',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: { vault_id: vaultId, ticket },
      }),
    });
  } catch (err) {
    throw new HttpError(502, 'dispatch', 'Could not start the run', {
      cause: err,
    });
  }
  if (response.status !== 204) {
    const requestId = response.headers.get('x-github-request-id') ?? 'none';
    console.error(
      `GitHub dispatch failed: status ${response.status}, request id ${requestId}`,
    );
    throw new HttpError(502, 'dispatch', 'Could not start the run');
  }
}

/** Starts the instance repo's `ingest` workflow (`event_type: 'ingest'`). */
export async function dispatchIngest(
  input: DispatchRunInput,
  fetchImpl: FetchLike,
): Promise<void> {
  await dispatchRun('ingest', input, fetchImpl);
}

/**
 * Starts one run of the instance repo's `lint` workflow for one vault
 * (`event_type: 'bower-lint'`).
 */
export async function dispatchLint(
  input: DispatchRunInput,
  fetchImpl: FetchLike,
): Promise<void> {
  await dispatchRun('bower-lint', input, fetchImpl);
}
