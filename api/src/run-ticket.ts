/**
 * Run tickets and run ids (worker contract, "Runner wire"; TL-P3-18).
 *
 * A ticket is the only credential the runner holds: 32 random bytes, base64url, minted per attempt
 * (`Person.mintTicket`) and sent in the dispatch payload. The person object keeps only its SHA-256.
 * Adapted from the original app's `api/src/run-ticket.ts` (random 32 bytes, SHA-256 kept, constant-time
 * compare), with the hash kept in the person object instead of KV. A bearer credential stored as a hash
 * and compared in constant time is the usual pattern for opaque tokens (RFC 6750; OWASP, "Password
 * Storage" for high-entropy secrets: a fast hash suffices).
 *
 * A run id carries the person object's id, so a runner call reaches the right object with
 * `idFromString` and no lookup table.
 *
 * Nothing here logs a ticket or its hash.
 */

import { sha256Hex } from '../../src/data/contracts/hashes.js';
import { base64UrlEncode } from './crypto.js';
import type { RunPhase } from '../../src/data/contracts/run-phases.js';
import type { RunReply } from './process.js';
import type { PublicQuestion } from '../../src/data/contracts/questions.js';

/** Random bytes in a ticket. */
const TICKET_BYTES = 32;

/** How long a ticket works after it is minted. */
export const TICKET_TTL_MS = 60 * 60 * 1000;

/** A Durable Object id as `id.toString()` writes it: 64 lowercase hex digits. */
const PERSON_ID_HEX = /^[0-9a-f]{64}$/;
/** `<person object id hex>-<random>`: the random part is base64url, as `makeRunId` makes it. */
const RUN_ID = /^([0-9a-f]{64})-[A-Za-z0-9_-]{1,64}$/;

/** Lowercase hex SHA-256 of `ticket`'s UTF-8 bytes. */
export async function hashTicket(ticket: string): Promise<string> {
  return sha256Hex(ticket);
}

/** A new ticket: 32 random bytes, base64url. */
export function newTicket(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(TICKET_BYTES)));
}

/**
 * A run id that carries the person object's id: `<person object id hex>-<random>`, the random part
 * 16 bytes, base64url. It reveals nothing about the person. `worker-dispatch` makes its runs' ids here.
 */
export function makeRunId(personIdHex: string): string {
  if (!PERSON_ID_HEX.test(personIdHex)) throw new Error('a run id needs a person object id in hex');
  return `${personIdHex}-${base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)))}`;
}

/** The person object's id hex in `runId`, or null when it is malformed. */
export function personIdOf(runId: string): string | null {
  return RUN_ID.exec(runId)?.[1] ?? null;
}

/** What a runner reports (`POST /runner/runs/:id/status`), once validated. */
export interface RunnerReport {
  attempt: number;
  seq: number;
  phase: RunPhase;
  total?: number;
  failure?: string;
  questions?: PublicQuestion[];
  /**
   * Only with `done`: a "Write it" the person granted was not written (a clash at the write itself), so its answer
   * stayed in your changes; the Worker starts the run that asks again, as for answers that waited (TL-P4-19 addendum 15).
   */
  answersStayed?: true;
}

/** What a runner's ticket opens: the attempt it was minted for, and the person's folder. */
export interface RunnerAccess {
  attempt: number;
  folderId: string | null;
}

/** Why the person object refused a runner call; each maps to the contract's runner errors. */
export type RunnerRefusal = 'signed-out' | 'stale-attempt' | 'stale-report';

/** What the person object decided on a report: the run and revision, or a refusal. */
export type RunnerReportResult =
  | { accepted: true; reply: RunReply }
  | { accepted: false; refused: 'signed-out' | 'stale-attempt' }
  /** A late report: with the Worker's current `seq` of this attempt (0 before any) and phase, so a runner can go on. */
  | { accepted: false; refused: 'stale-report'; current: { seq: number; phase: RunPhase } };
