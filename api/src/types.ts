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
}

export type RunState = 'queued' | 'running' | 'done' | 'failed';

export interface Run {
  state: RunState;
  /** ISO-8601. */
  requestedAt: string;
  /** ISO-8601. */
  startedAt?: string;
  /** ISO-8601. */
  finishedAt?: string;
  summary?: string;
  processed?: string[];
  error?: string;
  runId?: string;
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
