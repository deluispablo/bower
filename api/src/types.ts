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
  /** The Google profile's first name (#323), for the app's greeting.
   * Written on every sign-in, from the userinfo endpoint's `given_name`;
   * absent when Google gave none. */
  givenName?: string;
  /**
   * The user's "Let Bower look things up on the web" switch (#374): `true`
   * when on; absent is off. A run gets the web tools only when this and the
   * instance's `BOWER_ALLOW_WEB` both allow it.
   */
  allowWeb?: boolean;
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
 * Why a run failed, in a word the app turns into a sentence for people
 * (#375): the runner classifies its own failure; anything it cannot tell
 * apart is `unknown`.
 */
export const RUN_FAILURE_REASONS = [
  'drive_unavailable',
  'timeout',
  'model_unavailable',
  'vault_changed',
  'unknown',
] as const;
export type RunFailureReason = (typeof RUN_FAILURE_REASONS)[number];

/**
 * What a run does: `ingest` processes the inbox (`POST /process`), `lint` is
 * the scheduled health check. The two are stored under different keys (see
 * `store.ts`), so a lint never shows up as the user's current run.
 */
export type RunKind = 'ingest' | 'lint';

/**
 * What one processed inbox item was (#345), as the runner saw it: a file
 * to file, an instruction note that turned out a question, a request (a
 * job) or a rule, or Add's context note for its batch. The app reads this
 * instead of matching the item's title.
 */
export const RUN_ITEM_KINDS = [
  'file',
  'question',
  'request',
  'context',
  'rule',
] as const;
export type RunItemKind = (typeof RUN_ITEM_KINDS)[number];

/** One processed inbox item with its kind (#345). */
export interface RunItem {
  /** The inbox path, as in `processed`. */
  path: string;
  kind: RunItemKind;
  /**
   * Report v2 (#598): where the item ended up, its new `/`-joined path from
   * the top of the folder. Absent when it did not move or from an older
   * runner.
   */
  to?: string;
  /** Report v2: the file name it had before Bower renamed it. */
  renamedFrom?: string;
}

/**
 * Why a run set an item aside instead of reading it (report v2, #598): a
 * format Bower only keeps, a file over the size limit, one pandoc could not
 * convert, or one the pre-scan quarantined.
 */
export const SET_ASIDE_REASONS = [
  'kept-not-read',
  'too-large',
  'unconvertible',
  'quarantined',
] as const;
export type SetAsideReason = (typeof SET_ASIDE_REASONS)[number];

/** One item a run set aside (report v2, #598). */
export interface SetAsideItem {
  /** Where it was picked up, or where it was kept. */
  path: string;
  reason: SetAsideReason;
}

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
  /**
   * `processed` with each item's kind, when the runner reported kinds
   * (#345); absent from runners that predate them.
   */
  items?: RunItem[];
  /**
   * Report v2 (#598): what the run set aside, each with its reason. A
   * `quarantined` entry here is the same path as in `quarantined`.
   */
  setAside?: SetAsideItem[];
  /** Report v2: one short clause about what Bower added besides filing. */
  added?: string;
  /** Paths the pre-scan set aside under `0-Inbox/Quarantine/` this run. */
  quarantined?: string[];
  /** Paths (or `"*"` for the whole run) the post-run audit refused. */
  refused?: string[];
  error?: string;
  /** Only on a `failed` run, when the runner said why (#375). */
  reason?: RunFailureReason;
  runId?: string;
  /**
   * ISO-8601; when `GET /status` last asked GitHub how this run's job
   * stands (#315), so it asks at most once a minute.
   */
  jobCheckedAt?: string;
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
