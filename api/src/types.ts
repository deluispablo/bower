/**
 * Shapes stored in KV. See `store.ts` for the key layout that holds them
 * and `docs/api.md` for the data model. Every timestamp is an ISO-8601
 * string (`Date.prototype.toISOString()`).
 *
 * `encRefreshToken` and `encApiKey` hold AES-GCM envelopes produced by
 * `crypto.ts` (`encrypt`/`decrypt`) — they are ciphertext, never the
 * plaintext token or key.
 */

export interface User {
  id: string;
  email: string;
  /** ISO-8601. */
  createdAt: string;
  /** Set once the user's vault has been provisioned in their Drive. */
  vault?: {
    folderId: string;
    inboxFolderId: string;
    name: string;
  };
  /** AES-GCM envelope from `crypto.ts`; never plaintext. */
  encRefreshToken: string;
  /** AES-GCM envelope from `crypto.ts`; never plaintext. */
  encApiKey?: string;
  needsReauth?: boolean;
  /** ISO-8601; when the user finished or skipped the first-run tour. */
  tourSeenAt?: string;
  /**
   * Legacy, read only: where "Sign out everywhere" kept the generation
   * before it moved to its own `sessiongen:<id>` key (see `store.ts`).
   * Nothing writes it any more; a stored value still counts, so a sign-out
   * made before the move is not forgotten. Absent reads as 0.
   */
  sessionGeneration?: number;
}

export type RunState = 'queued' | 'running' | 'done' | 'failed';

/**
 * What a run does: `ingest` processes the inbox (`POST /process`), `lint` is
 * the scheduled health check. The two are stored under different keys (see
 * `store.ts`), so a lint never shows up as the user's current run.
 */
export type RunKind = 'ingest' | 'lint';

export interface Run {
  state: RunState;
  /** Absent on runs stored before kinds existed; read as `ingest`. */
  kind?: RunKind;
  /** ISO-8601. */
  requestedAt: string;
  /** ISO-8601. */
  startedAt?: string;
  /** ISO-8601. */
  finishedAt?: string;
  summary?: string;
  processed?: string[];
  /** Paths the pre-scan set aside under `0-Inbox/Quarantine/` this run. */
  quarantined?: string[];
  /** Paths (or `"*"` for the whole run) the post-run audit refused. */
  refused?: string[];
  error?: string;
  runId?: string;
}

/**
 * The Worker's copy of a run ticket: the per-run credential the runner of
 * one run of one vault presents instead of the operator key (see
 * `run-ticket.ts`). Only the SHA-256 of the ticket is kept, never the
 * ticket itself.
 */
export interface RunTicket {
  /** Lowercase hex SHA-256 of the ticket. */
  hash: string;
  /** ISO-8601; the ticket is refused from then on. */
  expiresAt: string;
}

/** A cached Google access token for Drive; plaintext, but lives at most 1 h. */
export interface DriveToken {
  accessToken: string;
  /** ISO-8601; when Google stops accepting `accessToken`. */
  expiresAt: string;
}

export interface PushSubscription {
  id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  /** ISO-8601. */
  createdAt: string;
}
