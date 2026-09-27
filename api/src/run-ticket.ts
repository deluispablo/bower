/**
 * Run tickets: the per-run, per-vault credential the runner presents to
 * `GET /runner/vaults/:id` and `POST /runner/vaults/:id/status`, instead of
 * the operator key `BOWER_API_KEY`.
 *
 * The Worker mints a random 32-byte ticket when it dispatches a run
 * (`POST /process` for an ingest, `POST /runner/lint/dispatch` for the
 * weekly lint), keeps only its SHA-256 (`putRunTicket` in `store.ts`, one
 * per user and kind, with an expiry) and sends the ticket itself in the
 * `repository_dispatch` payload. A ticket works for that one vault and
 * kind only, until it expires or the run reports `done` or `failed`.
 *
 * Nothing here logs a ticket or its hash.
 */

import { base64UrlEncode, timingSafeEqual } from './crypto.js';
import { getRunTicket, putRunTicket } from './store.js';
import type { RunKind } from './types.js';

/** Random bytes in a ticket. */
const TICKET_BYTES = 32;

/** Lowercase hex SHA-256 of `ticket`'s UTF-8 bytes. */
export async function hashTicket(ticket: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(ticket),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * Mints a ticket for the user's next run of `kind`, stores its hash (valid
 * until `now + ttlMs`, replacing any earlier ticket of that kind) and
 * returns the ticket, base64url, for the dispatch payload. Never stored or
 * logged in the clear.
 */
export async function issueRunTicket(
  kv: KVNamespace,
  userId: string,
  kind: RunKind,
  now: Date,
  ttlMs: number,
): Promise<string> {
  const ticket = base64UrlEncode(
    crypto.getRandomValues(new Uint8Array(TICKET_BYTES)),
  );
  await putRunTicket(
    kv,
    userId,
    kind,
    {
      hash: await hashTicket(ticket),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    },
    Math.ceil(ttlMs / 1000),
  );
  return ticket;
}

/**
 * Whether `ticket` is the live ticket of the user's run of `kind` at `now`:
 * stored, not expired, and its hash equal (in constant time) to the
 * stored one.
 */
export async function checkRunTicket(
  kv: KVNamespace,
  userId: string,
  kind: RunKind,
  ticket: string,
  now: Date,
): Promise<boolean> {
  const stored = await getRunTicket(kv, userId, kind);
  if (stored === undefined) return false;
  if (now.getTime() >= Date.parse(stored.expiresAt)) return false;
  return timingSafeEqual(await hashTicket(ticket), stored.hash);
}
