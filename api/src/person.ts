import { DurableObject } from 'cloudflare:workers';

import { isAdmissionManifest } from '../../src/data/spine/admission.js';
import type { AdmissionManifest } from '../../src/data/spine/admission.js';
import type { Env } from './env.js';
import { dispatchOutcome, findTidyRun } from './github.js';
import type { GitHubAccess } from './github.js';
import { applyingWatch, decide, staleDeadline, staleFailure, unrecoveredCeiling } from './recovery.js';
import type { Recovery, RecoveryWatch } from './recovery.js';
import { timingSafeEqual } from './crypto.js';
import { TABLES_AT_DELETE, migrate, readSchemaVersion } from './person-schema.js';
import { ACTIVE_PHASES, PHASE_RANK } from '../../src/data/contracts/run-phases.js';
import type { RunPhase } from '../../src/data/contracts/run-phases.js';
import type { RunScope, RunWire } from '../../src/data/contracts/run-wire.js';
import { isQuestionSnapshot, publicQuestion, type PublicQuestion } from '../../src/data/contracts/questions.js';
import { QUEUED_STALE_MS, admission, utcDay } from './process.js';
import type { AdmitInput, AdmitResult, RunReply } from './process.js';
import type { FetchLike } from './google.js';
import { HttpError } from './errors.js';
import { TICKET_TTL_MS, hashTicket, makeRunId, newTicket } from './run-ticket.js';
import type { RunnerAccess, RunnerReport, RunnerReportResult } from './run-ticket.js';
import { LEAVE_KEPT_MS, decideLease, holdsLease } from '../../src/data/contracts/lease.js';
import type { Lease, LeaseReply, SessionAction } from '../../src/data/contracts/lease.js';

/** What a live runner ticket opens: its attempt and folder, and what the run was admitted to take (null for a run from before v9). */
export interface RunnerGrant extends RunnerAccess {
  manifest: AdmissionManifest | null;
}

/** `session_lease.place` while nobody holds the lease (a real place is 1 to 64 characters). */
const FREE_PLACE = '';

/** The person's account row, as `GET /me` and the session check read it. */
export interface PersonAccount {
  email: string;
  name: string;
  /** Bumped at sign-out: a session cookie carrying another value is retired. */
  generation: number;
  /**
   * Which account this is: only Delete me changes it (the kept `GENERATION_FLOOR` forget raises, which a new account
   * starts its sessions at). A sign-out moves `generation`, never this; runs depend on this one (`admitSync`).
   */
  accountEpoch: number;
}

/** A Drive access token and when it stops working (epoch ms). */
export interface DriveAccessToken {
  accessToken: string;
  expiresAt: number;
}

/** The folder pointer, whether the template is complete in it, and a reserved id not yet complete. */
export interface VaultState {
  folderId: string | null;
  complete: boolean;
  pending: string | null;
  /** Ids reserved for the template's folders and files (by path), and the folder they were reserved for. */
  templateIds: TemplateIds | null;
}

export interface TemplateIds {
  folderId: string;
  ids: Record<string, string>;
}

/** What a sign-in leaves: the generation to sign into the cookie, and whether a refresh token is kept. */
export interface SignInResult {
  generation: number;
  hasRefreshToken: boolean;
}

/** Durable Object key-value entry that outlives `forget()`: the lowest session generation a new account may start at. */
const GENERATION_FLOOR = 'generationFloor';
/**
 * Key-value entry of v13 and before: the run tickets live at Delete me. From v14 they are `run_ticket` rows with no run
 * id (`forget`), so the entry moves there as the object starts (`moveGoneTickets`).
 */
const GONE_TICKETS_V13 = 'goneTickets';

/** A run ticket live at Delete me, as v13 kept it (`GONE_TICKETS_V13`). */
interface GoneTicketV13 {
  hash: string;
  expiresAt: number;
  attempt: number;
}

/**
 * A run ticket live at Delete me is kept as its `run_ticket` row with this run id (none): its SHA-256, attempt and
 * expiry, random values and nothing personal, so a runner still holding it is told the person is gone, while any other
 * bearer stays signed out. Its expiry is a `gone` deadline: the alarm (and any later access) prunes it.
 */
const GONE_RUN = '';
/** Durable Object key-value entry: the extra time the alarm gave the current run's attempt (`RecoveryWatch`). */
const RECOVERY_WATCH = 'recoveryWatch';
/** When a run moved during the alarm's lookup and is somehow still due, the alarm looks again this much later. */
const RECHECK_MS = 60 * 1000;
/**
 * Key-value entry: the alarm looks at the run early (`DispatchLost`): a dispatch that failed after its retries, or an
 * attempt that ended with no terminal report (`runnerEnded`, TL-P4-16 addendum 4).
 */
const DISPATCH_LOST = 'dispatchLost';

/** The run to look at early, and when (`RECHECK_MS` after the lost dispatch or the ended attempt). */
interface DispatchLost {
  runId: string;
  at: number;
  /** The run as it was at the loss: a flag only holds while the run has not moved since. */
  attempt: number;
  phaseAt: number;
}

/**
 * Key-value entry: the answers that came while a run was going (TL-P4-13 addendum), for the one run that run's end
 * starts (`wake`). Deleted when a run takes them: that run, or a press of Tidy up on the whole inbox.
 */
const ANSWERS_WAITING = 'answersWaiting';
/** Key-value entry: which run took each answer that waited, by its requestId, so a retry of it answers that run. */
const ANSWERS_TAKEN = 'answersTaken';
/** How many taken answers are remembered (the newest); an older retry is a new press, as with the run history. */
const ANSWERS_TAKEN_KEPT = 50;
/** How many times in a row the alarm tries to start the waiting answers' run through Drive or GitHub trouble. */
const WAITING_TRIES = 3;
/** The key-value entries about the person, which Delete me deletes (`forget`); only `GENERATION_FLOOR` is kept. */
const PERSONAL_KEYS = [RECOVERY_WATCH, DISPATCH_LOST, ANSWERS_WAITING, ANSWERS_TAKEN] as const;

/** The answers waiting for the run going to end (`ANSWERS_WAITING`). */
interface AnswersWaiting {
  requestIds: string[];
  /** The things and piles they are about: the run takes only the piles that hold them, with your changes. */
  subjects: string[];
  /** The latest answer's setting: whether Bower may look things up on the web. */
  allowWeb: boolean;
  /** Starts that failed in a row on Drive or GitHub trouble. */
  tries: number;
}

/**
 * What a deadline is for (`deadlines` table, schema v12; TL-P4-14). A Durable Object has one alarm, and `setAlarm`
 * replaces the one set (https://developers.cloudflare.com/durable-objects/api/alarms/), so every deadline is a row
 * and the alarm is set to the earliest (`rearm`), as the Agents SDK keeps its schedules
 * (https://developers.cloudflare.com/agents/api-reference/schedule-tasks/):
 * - `run`: the current run's dispatch (now, after admission or a redispatch: `runs.deadline_at`), its stale deadline,
 *   or an earlier recheck (a lost dispatch, a run that moved); one row;
 * - `answers`: the waiting answers' wake once the run they waited for ended; one row;
 * - `gone`: a ticket kept after Delete me (`GONE_RUN`), keyed by its SHA-256, at its expiry; one row each.
 */
type DeadlineKind = 'run' | 'answers' | 'gone';

/** The order the alarm handles the kinds due (`wake`). */
const DEADLINE_KINDS: readonly DeadlineKind[] = ['gone', 'run', 'answers'];

/**
 * A throwing handler's backoff, as Cloudflare retries a throwing alarm (2 seconds, doubling, up to 6 attempts:
 * https://developers.cloudflare.com/durable-objects/api/alarms/#alarm). Schema v13 keeps the attempt count.
 */
const DEADLINE_BACKOFF_MS = 2000;
const DEADLINE_ATTEMPTS = 6;

interface DeadlineRow extends Record<string, SqlStorageValue> {
  kind: DeadlineKind;
  key: string;
  at: number;
  /** Times in a row its handler threw. */
  attempts: number;
}

/** A stale run the alarm looks up on GitHub: what it saw, so the second section can tell whether anything moved. */
interface RecoveryLookup {
  run: RunWire;
  attempt: number;
  watch: string;
  /** The look-up came before the stale deadline, brought forward by a lost dispatch. */
  early: boolean;
}

/**
 * One person's Durable Object, addressed by `idFromName(sub)` (TL-P2-05:
 * people are keyed by their OIDC sub). It holds that person's session
 * lease, runs, quota, control row and run tickets in its own
 * SQLite database (person-schema.ts).
 *
 * One at a time: a Durable Object is single-threaded, and every method here
 * reads and writes through the synchronous `ctx.storage.sql` API with no
 * `await` in between, so no other call can interleave inside it (Cloudflare,
 * "Rules of Durable Objects" and the input/output gates). Keep it that way:
 * an `await` on anything but storage between a read and its write would
 * open the input gate and let another call in.
 */
export class Person extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Cloudflare's documented pattern: set up the schema before any call is delivered.
    void ctx.blockConcurrencyWhile(async () => {
      try {
        ctx.storage.transactionSync(() => {
          const from = migrate(ctx.storage.sql);
          // Storage from before v12 moves its deadlines into the table, and before v14 its gone tickets into their
          // table; a new one (0) has neither.
          if (from > 0 && from < 12) this.moveDeadlines(Date.now());
          if (from > 0 && from < 14) this.moveGoneTickets();
        });
      } catch (error) {
        console.error('person storage migration failed', error);
        throw error;
      }
    });
  }

  /** The schema version this person's storage is at. */
  schemaVersion(): number {
    return readSchemaVersion(this.ctx.storage.sql);
  }

  /** Adds one to the counter for `window` and returns the new count. */
  countQuota(window: string): number {
    return this.ctx.storage.sql
      .exec<{ counter: number }>(
        `INSERT INTO quota (window, counter) VALUES (?, 1)
         ON CONFLICT (window) DO UPDATE SET counter = counter + 1
         RETURNING counter`,
        window,
      )
      .one().counter;
  }

  /**
   * Records a sign-in: the address and name from the ID token, and the
   * encrypted refresh token when Google sent one (a sign-in without one
   * keeps the token already kept; the callback first forgets a kept one it
   * cannot decrypt, so an unreadable token is never kept past a sign-in).
   * The generation is left as it is, so a sign-in never revives a retired cookie.
   */
  signIn(input: { email: string; name: string; encRefreshToken: string | null }): SignInResult {
    const row = this.ctx.storage.sql
      .exec<{ session_generation: number; enc_refresh_token: string | null }>(
        `INSERT INTO account (id, email, name, enc_refresh_token, session_generation) VALUES (1, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           enc_refresh_token = COALESCE(excluded.enc_refresh_token, account.enc_refresh_token)
         RETURNING session_generation, enc_refresh_token`,
        input.email,
        input.name,
        input.encRefreshToken,
        this.ctx.storage.kv.get<number>(GENERATION_FLOOR) ?? 0,
      )
      .one();
    return { generation: row.session_generation, hasRefreshToken: row.enc_refresh_token !== null };
  }

  /** The account, or null before the first sign-in. */
  account(): PersonAccount | null {
    const row = this.ctx.storage.sql
      .exec<{ email: string; name: string; session_generation: number }>(
        'SELECT email, name, session_generation FROM account WHERE id = 1',
      )
      .toArray()[0];
    return row === undefined
      ? null
      : { email: row.email, name: row.name, generation: row.session_generation, accountEpoch: this.ctx.storage.kv.get<number>(GENERATION_FLOOR) ?? 0 };
  }

  /** The encrypted refresh token (crypto.ts envelope), or null. */
  encryptedRefreshToken(): string | null {
    const row = this.ctx.storage.sql
      .exec<{ enc_refresh_token: string | null }>('SELECT enc_refresh_token FROM account WHERE id = 1')
      .toArray()[0];
    return row?.enc_refresh_token ?? null;
  }

  /**
   * Retires every session signed so far (sign-out): bumps the stored
   * generation, so `assertCurrentGeneration` refuses every older cookie.
   * Returns the new generation, or null when there is no account.
   */
  retireSessions(): number | null {
    const row = this.ctx.storage.sql
      .exec<{ session_generation: number }>(
        `UPDATE account SET session_generation = session_generation + 1 WHERE id = 1
         RETURNING session_generation`,
      )
      .toArray()[0];
    return row?.session_generation ?? null;
  }

  /** The pointer to the person's Bower folder, or null before one is chosen. */
  folderId(): string | null {
    const row = this.ctx.storage.sql
      .exec<{ folder_id: string | null }>('SELECT folder_id FROM account WHERE id = 1')
      .toArray()[0];
    return row?.folder_id ?? null;
  }

  /**
   * Sets (or with null clears) the folder pointer. A different folder starts
   * as not complete; the same one keeps its state. False when there is no account.
   */
  setFolderId(folderId: string | null): boolean {
    return (
      this.ctx.storage.sql.exec(
        `UPDATE account SET
           folder_complete = CASE WHEN folder_id IS ? THEN folder_complete ELSE 0 END,
           folder_id = ?
         WHERE id = 1`,
        folderId,
        folderId,
      ).rowsWritten > 0
    );
  }

  /** Everything `POST /vault` keeps about the folder. */
  vaultState(): VaultState {
    const row = this.ctx.storage.sql
      .exec<{
        folder_id: string | null;
        folder_complete: number;
        pending_folder_id: string | null;
        pending_template_ids: string | null;
      }>(
        'SELECT folder_id, folder_complete, pending_folder_id, pending_template_ids FROM account WHERE id = 1',
      )
      .toArray()[0];
    return {
      folderId: row?.folder_id ?? null,
      complete: row?.folder_complete === 1,
      pending: row?.pending_folder_id ?? null,
      templateIds: row?.pending_template_ids == null ? null : (JSON.parse(row.pending_template_ids) as TemplateIds),
    };
  }

  /**
   * Grants `holder` the right to work on the folder until `until` (epoch ms),
   * when nobody else holds it or their claim lapsed at `now`. One `POST /vault`
   * at a time per person: the read and the write here are one synchronous step.
   */
  claimVault(holder: string, now: number, until: number): boolean {
    return (
      this.ctx.storage.sql.exec(
        `UPDATE account SET vault_claim = ?, vault_claim_until = ?
         WHERE id = 1 AND (vault_claim IS NULL OR vault_claim = ? OR vault_claim_until <= ?)`,
        holder,
        until,
        holder,
        now,
      ).rowsWritten > 0
    );
  }

  /** Gives the claim back, only if `holder` still has it. */
  releaseVault(holder: string): void {
    this.ctx.storage.sql.exec(
      'UPDATE account SET vault_claim = NULL, vault_claim_until = NULL WHERE id = 1 AND vault_claim = ?',
      holder,
    );
  }

  /**
   * Moves the pointer to `folderId` only if it still holds `seen` (what the
   * caller read): a compare-and-set, so a call whose claim lapsed cannot move
   * a pointer another call set meanwhile. A different folder starts as not
   * complete. False when refused: the caller reads the state again.
   */
  pointFolder(gen: number, seen: string | null, folderId: string): boolean {
    return (
      this.ctx.storage.sql.exec(
        `UPDATE account SET
           folder_complete = CASE WHEN folder_id IS ? THEN folder_complete ELSE 0 END,
           folder_id = ?
         WHERE id = 1 AND session_generation = ? AND folder_id IS ?`,
        folderId,
        folderId,
        gen,
        seen,
      ).rowsWritten > 0
    );
  }

  /**
   * Keeps a folder id reserved with files.generateIds, before it is created,
   * only when no reservation is kept and the pointer still holds `seenPointer`.
   * False when refused: another call reserved or chose a folder meanwhile.
   */
  reserveFolder(gen: number, folderId: string, templateIds: TemplateIds, seenPointer: string | null): boolean {
    return (
      this.ctx.storage.sql.exec(
        `UPDATE account SET pending_folder_id = ?, pending_template_ids = ?
         WHERE id = 1 AND session_generation = ? AND pending_folder_id IS NULL AND folder_id IS ?`,
        folderId,
        JSON.stringify(templateIds),
        gen,
        seenPointer,
      ).rowsWritten > 0
    );
  }

  /**
   * Keeps the ids reserved for the template's items in `templateIds.folderId`,
   * before any is created, for each item with no id kept for that folder yet
   * (an id kept earlier stays); only while that folder is the pointer and not
   * complete. The keeper of the Worker's ids behind write-once's port: the read
   * and the write here are one synchronous step. Answers the ids kept for that
   * folder, or null when refused: the caller reads the state again.
   */
  reserveTemplate(gen: number, templateIds: TemplateIds): Record<string, string> | null {
    const { folderId } = templateIds;
    const state = this.vaultState();
    if (this.account()?.generation !== gen || state.folderId !== folderId || state.complete) return null;
    const ids = { ...templateIds.ids, ...(state.templateIds?.folderId === folderId ? state.templateIds.ids : {}) };
    this.ctx.storage.sql.exec(
      'UPDATE account SET pending_template_ids = ? WHERE id = 1 AND session_generation = ?',
      JSON.stringify({ folderId, ids }),
      gen,
    );
    return ids;
  }

  /**
   * Lets one template item's id go (write-once's `letGo`: its create was refused outright), only while it is still
   * the id kept for `key` in `folderId`; the next call reserves anew for that item and keeps the others.
   */
  letTemplateIdGo(gen: number, folderId: string, key: string, id: string): void {
    const kept = this.vaultState().templateIds;
    if (this.account()?.generation !== gen || kept?.folderId !== folderId || kept.ids[key] !== id) return;
    const ids = Object.fromEntries(Object.entries(kept.ids).filter(([k]) => k !== key));
    this.ctx.storage.sql.exec(
      'UPDATE account SET pending_template_ids = ? WHERE id = 1 AND session_generation = ?',
      JSON.stringify({ folderId, ids }),
      gen,
    );
  }

  /** Forgets a reservation that can no longer be used (that file is in the Bin or is not a folder). */
  dropReservation(gen: number, folderId: string): void {
    this.ctx.storage.sql.exec(
      `UPDATE account SET pending_folder_id = NULL, pending_template_ids = NULL
       WHERE id = 1 AND session_generation = ? AND pending_folder_id = ?`,
      gen,
      folderId,
    );
  }

  /** The pointed folder `folderId` now holds the whole template: later calls skip the fill. */
  markFolderComplete(gen: number, folderId: string): void {
    this.ctx.storage.sql.exec(
      `UPDATE account SET folder_complete = 1,
         pending_folder_id = CASE WHEN pending_folder_id = ? THEN NULL ELSE pending_folder_id END
       WHERE id = 1 AND session_generation = ? AND folder_id = ?`,
      folderId,
      gen,
      folderId,
    );
    this.ctx.storage.sql.exec(
      `UPDATE account SET pending_template_ids = NULL
       WHERE id = 1 AND session_generation = ? AND folder_id = ? AND folder_complete = 1`,
      gen,
      folderId,
    );
  }

  /** The cached Drive access token, or null when none is kept or it expires before `usableUntil` (epoch ms). */
  cachedDriveToken(usableUntil: number): DriveAccessToken | null {
    const row = this.ctx.storage.sql
      .exec<{ access_token: string | null; access_expires_at: number | null }>(
        'SELECT access_token, access_expires_at FROM account WHERE id = 1',
      )
      .toArray()[0];
    if (row?.access_token == null || row.access_expires_at == null || row.access_expires_at <= usableUntil) {
      return null;
    }
    return { accessToken: row.access_token, expiresAt: row.access_expires_at };
  }

  /** Keeps a freshly minted access token until it expires. */
  cacheDriveToken(token: DriveAccessToken): void {
    this.ctx.storage.sql.exec(
      'UPDATE account SET access_token = ?, access_expires_at = ? WHERE id = 1',
      token.accessToken,
      token.expiresAt,
    );
  }

  /**
   * Google no longer honours the refresh token (revoked): forgets it and the
   * cached access token, and retires every session. The next sign-in has no
   * token kept, so the callback asks for consent again. Compare-and-clear:
   * only when the kept token is still `refused` (the one that was read), so
   * a newer sign-in's token and sessions survive. True when it forgot.
   */
  forgetGoogleAccess(refused: string): boolean {
    return (
      this.ctx.storage.sql.exec(
        `UPDATE account SET enc_refresh_token = NULL, access_token = NULL, access_expires_at = NULL,
           session_generation = session_generation + 1 WHERE id = 1 AND enc_refresh_token = ?`,
        refused,
      ).rowsWritten > 0
    );
  }

  /**
   * `POST /session` (worker contract, "One active session"; TL-P2-14/25, TL-P3-14): the rules are `decideLease`
   * (`src/data/contracts/lease.ts`), the same function the app's pretend lease runs; this method reads and stores.
   * One synchronous transaction, so no other call reads between the read and the write (a fencing token in
   * Kleppmann's sense: the epoch only grows while anyone has had the lease).
   */
  session(place: string, action: SessionAction, gen: number, now: number): LeaseReply {
    return this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      const lease = this.lease();
      const row = sql.exec<{ gen: number; left_at: number }>('SELECT gen, left_at FROM session_leave WHERE place = ?', place).toArray()[0];
      const decision = decideLease(lease, row === undefined ? undefined : { gen: row.gen, at: row.left_at }, { place, action, gen, now });
      if (decision.leave !== undefined) {
        sql.exec(
          `INSERT INTO session_leave (place, gen, left_at) VALUES (?, ?, ?)
           ON CONFLICT (place) DO UPDATE SET gen = excluded.gen, left_at = excluded.left_at`,
          place,
          decision.leave.gen,
          decision.leave.at,
        );
        // A check in flight lasts seconds; a place that left long ago has nothing on its way.
        sql.exec('DELETE FROM session_leave WHERE left_at < ?', now - LEAVE_KEPT_MS);
      }
      if (decision.lease !== lease) {
        const { holder, epoch, beatAt, left } = decision.lease;
        sql.exec(
          `INSERT INTO session_lease (id, place, epoch, beat_at, left_place) VALUES (1, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET place = excluded.place, epoch = excluded.epoch,
             beat_at = excluded.beat_at, left_place = excluded.left_place`,
          holder ?? FREE_PLACE,
          epoch,
          beatAt,
          left,
        );
      }
      return decision.reply;
    });
  }

  /**
   * Whether `place` holds the lease at `epoch`: the fence on the Worker's own endpoints. An expired lease
   * nobody took is still its holder's (TL-P2-25); a stale epoch or another place is not.
   */
  holdsLease(place: string, epoch: number): boolean {
    return holdsLease(this.lease(), place, epoch);
  }

  private lease(): Lease {
    const row = this.ctx.storage.sql
      .exec<{ place: string; epoch: number; beat_at: number; left_place: string | null }>(
        'SELECT place, epoch, beat_at, left_place FROM session_lease WHERE id = 1',
      )
      .toArray()[0];
    if (row === undefined) return { holder: null, epoch: 0, beatAt: 0, left: null };
    return {
      holder: row.place === FREE_PLACE ? null : row.place,
      epoch: row.epoch,
      beatAt: row.beat_at,
      left: row.left_place,
    };
  }

  /**
   * `DELETE /me` (TL-P4-14 stage 2): deletes every personal table and key-value entry by name (`TABLES_AT_DELETE`,
   * `PERSONAL_KEYS`), in one transaction, so a later sign-in for the same sub starts fresh at the folder step. Kept,
   * nothing personal: the generation floor (a new account starts at the old generation + 1, so every cookie signed
   * before stays refused), and the run tickets live now as `GONE_RUN` rows with their expiry deadlines, so their
   * runners stop as gone (`runnerAccess`) until they expire.
   */
  forget(): void {
    this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      const kv = this.ctx.storage.kv;
      const generation = this.account()?.generation;
      const floor = Math.max(kv.get<number>(GENERATION_FLOOR) ?? 0, generation === undefined ? 0 : generation + 1);
      // A ticket live now, or kept from an earlier Delete me, stays with no run id or report; every other one goes.
      sql.exec(`DELETE FROM run_ticket WHERE expires_at <= ? OR (retired = 1 AND run_id <> ?)`, Date.now(), GONE_RUN);
      sql.exec('UPDATE run_ticket SET run_id = ?, retired = 1, report_seq = NULL, report_phase = NULL', GONE_RUN);
      sql.exec(`DELETE FROM deadlines WHERE kind <> 'gone'`);
      for (const [table, kind] of Object.entries(TABLES_AT_DELETE)) if (kind === 'personal') sql.exec(`DELETE FROM ${table}`);
      for (const key of PERSONAL_KEYS) kv.delete(key);
      kv.put(GENERATION_FLOOR, floor);
      for (const t of sql.exec<{ hash: string; expires_at: number }>('SELECT hash, expires_at FROM run_ticket').toArray()) this.arm('gone', t.hash, t.expires_at);
      this.rearm();
    });
  }

  /** Schema v14: the tickets v13 kept after Delete me in a key-value entry become `GONE_RUN` rows, with their deadlines. */
  private moveGoneTickets(): void {
    const kv = this.ctx.storage.kv;
    for (const t of kv.get<GoneTicketV13[]>(GONE_TICKETS_V13) ?? []) {
      this.ctx.storage.sql.exec(
        'INSERT INTO run_ticket (hash, run_id, attempt, retired, expires_at) VALUES (?, ?, ?, 1, ?) ON CONFLICT (hash) DO NOTHING',
        t.hash,
        GONE_RUN,
        t.attempt,
        t.expiresAt,
      );
      this.arm('gone', t.hash, t.expiresAt);
    }
    kv.delete(GONE_TICKETS_V13);
  }

  /**
   * Schema v12 (TL-P4-14): the deadlines kept before the `deadlines` table move into it as the object starts, so
   * the deploy loses none (the gone tickets' expiries move with them, `moveGoneTickets`). The alarm set for a run or the waiting answers
   * cannot be read here (`getAlarm` is not synchronous), so their deadline is now: the alarm looks at once, as the
   * old alarm would have, and recovery arms the run's own deadline again.
   */
  private moveDeadlines(now: number): void {
    const kv = this.ctx.storage.kv;
    const current = this.currentRunRow();
    if (current !== undefined && ACTIVE_PHASES.includes(current.phase)) this.arm('run', current.id, now);
    else if (kv.get<AnswersWaiting>(ANSWERS_WAITING) !== undefined) this.arm('answers', 'waiting', now);
  }

  /** Keeps a deadline of `kind` for `key` at `at` (one row for `run` and `answers`), and sets the alarm. */
  private arm(kind: DeadlineKind, key: string, at: number): void {
    const sql = this.ctx.storage.sql;
    if (kind !== 'gone') sql.exec('DELETE FROM deadlines WHERE kind = ? AND key <> ?', kind, key);
    sql.exec(
      'INSERT INTO deadlines (kind, key, at) VALUES (?, ?, ?) ON CONFLICT (kind, key) DO UPDATE SET at = excluded.at, attempts = 0',
      kind,
      key,
      at,
    );
    this.rearm();
  }

  /** Drops the deadlines of `kind` (only those due by `dueBy`, when given), and sets the alarm. */
  private disarm(kind: DeadlineKind, dueBy = Number.POSITIVE_INFINITY): void {
    if (this.ctx.storage.sql.exec('DELETE FROM deadlines WHERE kind = ? AND at <= ?', kind, dueBy).rowsWritten > 0) this.rearm();
  }

  /**
   * The one alarm, at the earliest deadline kept, or none (https://developers.cloudflare.com/durable-objects/api/alarms/:
   * one alarm per object, and `setAlarm` replaces it).
   */
  private rearm(): void {
    const next = this.ctx.storage.sql.exec<{ at: number | null }>('SELECT MIN(at) AS at FROM deadlines').one().at;
    void (next === null ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(next));
  }

  /**
   * `POST /process` (process.ts; TL-P3-15). One synchronous transaction, no `await`, in this order:
   * 1. expiry: a stale current run is marked failed once, and the revision rises;
   * 2. idempotency: a known `requestId` answers its own run, ended or not, with nothing changed
   *    (the first request's scope and allowWeb win);
   * 3. one active run: a run going is answered, with nothing changed;
   * 4. quota: today's UTC counter at or over `dailyLimit` refuses with nothing written (so a press is refused
   *    before any Drive read, which the route asks with no manifest first);
   * 5. the manifest: a new run with none built is refused as `needs-manifest`, with nothing written, else counts;
   * 6. admission: a `queued` run bound to the requestId, keeping its manifest, and the revision rises.
   */
  admit(input: AdmitInput): AdmitResult {
    return this.ctx.storage.transactionSync((): AdmitResult => this.admitSync(input, false));
  }

  /**
   * `admit`'s section. Answers (`input.answer`, TL-P4-13 addendum): one taken by a run, or waiting, answers that run
   * or the run going, as a repeat does; one that comes while a run is going is kept for that run's end (`wake`) and
   * answered `waits`, with nothing counted, unless the day's tidy-ups are used up already: then it is refused
   * `rate-limited` as any press (no run can be admitted while one is going, so the count cannot rise before the end).
   * A new run takes the waiting answers when it is their run (`takesWaiting`) or a press on the whole inbox.
   */
  private admitSync(input: AdmitInput, takesWaiting: boolean): AdmitResult {
    const sql = this.ctx.storage.sql;
    const kv = this.ctx.storage.kv;
    // The account admission started for is gone, or is a new one since (Delete me during the reads): nothing is written.
    // A sign-out does not matter here: the run is the person's, not the browser session's (TL-P4-04 addendum).
    if (this.account()?.accountEpoch !== input.accountEpoch) return { admitted: false, refused: 'gone' };
    this.expire(input.now);
    const repeat = sql
      .exec<RunRow>(`SELECT ${RUN_COLUMNS} FROM runs WHERE request_id = ?`, input.requestId)
      .toArray()[0];
    if (repeat !== undefined) return { admitted: true, run: toWire(repeat), revision: this.revision() };
    const takenBy = kv.get<Record<string, string>>(ANSWERS_TAKEN)?.[input.requestId];
    const taken = takenBy === undefined ? undefined : sql.exec<RunRow>(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`, takenBy).toArray()[0];
    if (taken !== undefined) return { admitted: true, run: toWire(taken), revision: this.revision() };
    const current = this.currentRunRow();
    const waiting = kv.get<AnswersWaiting>(ANSWERS_WAITING);
    const waitingHere = waiting?.requestIds.includes(input.requestId) === true;
    // It waits while something will start it: the run going (at its end) or the alarm (`startWaiting`). After a start
    // that failed for good, a retry is a press like any other, and hears why it cannot start.
    if (current !== undefined && waitingHere && (ACTIVE_PHASES.includes(current.phase) || this.answersArmed())) {
      return { admitted: true, run: toWire(current), revision: this.revision(), waits: true };
    }
    const day = utcDay(input.now);
    const used = sql.exec<{ counter: number }>('SELECT counter FROM quota WHERE window = ?', day).toArray()[0]?.counter ?? 0;
    if (current !== undefined && ACTIVE_PHASES.includes(current.phase)) {
      if (input.answer !== true) return { admitted: true, run: toWire(current), revision: this.revision() };
      if (used >= input.dailyLimit) return { admitted: false, refused: 'rate-limited' };
      const subjects = waiting?.subjects ?? [];
      kv.put(ANSWERS_WAITING, {
        requestIds: [...(waiting?.requestIds ?? []), input.requestId],
        subjects: input.subject === undefined || subjects.includes(input.subject) ? subjects : [...subjects, input.subject],
        allowWeb: input.allowWeb,
        tries: 0,
      } satisfies AnswersWaiting);
      return { admitted: true, run: toWire(current), revision: this.revision(), waits: true };
    }
    if (used >= input.dailyLimit) return { admitted: false, refused: 'rate-limited' };
    if (input.manifest === null) return { admitted: false, refused: 'needs-manifest' };
    this.countQuota(day);
    // Only today's counter matters; earlier days go.
    sql.exec('DELETE FROM quota WHERE window < ?', day);
    const seq = (current?.seq ?? 0) + 1;
    const row = sql
      .exec<RunRow>(
        `INSERT INTO runs (id, seq, request_id, scope, allow_web, phase, requested_at, phase_at, manifest, deadline_at)
         VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)
         RETURNING ${RUN_COLUMNS}`,
        makeRunId(this.ctx.id.toString()),
        seq,
        input.requestId,
        input.scope,
        input.allowWeb ? 1 : 0,
        input.now,
        input.now,
        JSON.stringify(input.manifest),
        input.now,
      )
      .one();
    // The history is bounded: older runs go, and with them their requestIds (a repeat that late is new).
    sql.exec('DELETE FROM runs WHERE seq <= ?', seq - RUNS_KEPT);
    // A press on the whole inbox takes your changes and every pile, so it takes the answers that waited too.
    const whole = input.scope === 'all' && input.subject === undefined;
    if (waiting !== undefined && (takesWaiting || (whole && input.answer !== true))) this.takeWaiting(waiting, row.id);
    else if (waiting !== undefined && waitingHere) this.leaveWaiting(waiting, input.requestId);
    // Only the alarm dispatches (TL-P4-14 stage 2): it is due now, and the alarm then sets the stale deadline.
    this.arm('run', row.id, input.now);
    return { admitted: true, run: toWire(row), revision: this.raiseRevision(), created: true };
  }

  /** The waiting answers go to run `runId`: each requestId is remembered with it, and nothing waits any more. */
  private takeWaiting(waiting: AnswersWaiting, runId: string): void {
    const kv = this.ctx.storage.kv;
    const kept = Object.entries(kv.get<Record<string, string>>(ANSWERS_TAKEN) ?? {});
    const taken = [...kept, ...waiting.requestIds.map((id): [string, string] => [id, runId])].slice(-ANSWERS_TAKEN_KEPT);
    kv.put(ANSWERS_TAKEN, Object.fromEntries(taken));
    kv.delete(ANSWERS_WAITING);
  }

  /** An answer that waited became a run of its own (`admitSync`): the others wait on. */
  private leaveWaiting(waiting: AnswersWaiting, requestId: string): void {
    const requestIds = waiting.requestIds.filter((id) => id !== requestId);
    if (requestIds.length === 0) this.ctx.storage.kv.delete(ANSWERS_WAITING);
    else this.ctx.storage.kv.put(ANSWERS_WAITING, { ...waiting, requestIds } satisfies AnswersWaiting);
  }

  /** Whether the alarm is set to start the waiting answers' run (`startWaiting`). */
  private answersArmed(): boolean {
    return this.ctx.storage.sql.exec(`SELECT key FROM deadlines WHERE kind = 'answers'`).toArray().length > 0;
  }

  /**
   * Run `run` ended with an answer that stayed in your changes (its granted write refused by a clash at the write
   * itself, TL-P4-19 addenda 15 and 16): it waits as an answer that came during the run does, so the run's end wakes the alarm to start the
   * one run that asks again (`wakeForWaiting`, `startWaiting`), with no press. It adds no subject (your changes go with
   * every such run), no requestId (no press waits on it) and no web (asking again looks nothing up). That run asks
   * again, which uses the answer up, so none loops.
   */
  private answersStayed(): void {
    const waiting = this.ctx.storage.kv.get<AnswersWaiting>(ANSWERS_WAITING);
    this.ctx.storage.kv.put(ANSWERS_WAITING, {
      requestIds: waiting?.requestIds ?? [],
      subjects: waiting?.subjects ?? [],
      allowWeb: waiting?.allowWeb ?? false,
      // The starts that failed in a row are not forgotten here (TL-P4-19 addendum 16).
      tries: waiting?.tries ?? 0,
    } satisfies AnswersWaiting);
  }

  /** A run ended at `now`: when answers wait for it, the alarm wakes at once to start their run (`wake`). */
  private wakeForWaiting(now: number): void {
    if (this.ctx.storage.kv.get<AnswersWaiting>(ANSWERS_WAITING) !== undefined) this.arm('answers', 'waiting', now);
  }

  /**
   * The earliest deadline (https://developers.cloudflare.com/durable-objects/api/alarms/): whatever is due, with this
   * object's own env and the Workers fetch (as `worker-dispatch` reaches GitHub).
   */
  async alarm(): Promise<void> {
    await this.wake(Date.now(), { repo: this.env.GITHUB_REPO, token: this.env.GITHUB_TOKEN, fetchImpl: (i, init) => fetch(i, init) });
  }

  /**
   * What the alarm does at `now`, through `github.fetchImpl` for every request: each kind of deadline due by `now` is
   * handled, in this order: expired gone rows go, the run is dispatched or looked at (`runDue`), and the run the
   * waiting answers asked for starts (`startWaiting`). A handled deadline goes unless its handler set it again (compare and
   * delete); then the alarm is set to the earliest one kept. A handler that throws is logged and its deadlines, as
   * they were read, are tried again with Cloudflare's alarm backoff (2 seconds, doubling, 6 attempts:
   * https://developers.cloudflare.com/durable-objects/api/alarms/#alarm); after the last the deadline fails
   * (`deadlineFailed`). The other kinds still run, and the error is not thrown on, so the runtime's own retries do
   * not run it twice. Every request of one alarm counts against one invocation's subrequests (TL-P4-11).
   */
  async wake(now: number, github: GitHubAccess): Promise<void> {
    const sql = this.ctx.storage.sql;
    const due = sql.exec<DeadlineRow>('SELECT kind, key, at, attempts FROM deadlines WHERE at <= ?', now).toArray();
    let fetches = 0;
    const counted: FetchLike = (input, init) => {
      fetches += 1;
      return github.fetchImpl(input, init);
    };
    const handlers: Record<DeadlineKind, () => Promise<void>> = {
      gone: () => {
        this.pruneGone(now);
        return Promise.resolve();
      },
      run: () => this.runDue(now, { ...github, fetchImpl: counted }),
      answers: () => this.startWaiting(now, { ...github, fetchImpl: counted }, () => fetches),
    };
    try {
      for (const kind of DEADLINE_KINDS) {
        const rows = due.filter((d) => d.kind === kind);
        if (rows.length === 0) continue;
        try {
          await handlers[kind]();
          for (const d of rows) sql.exec('DELETE FROM deadlines WHERE kind = ? AND key = ? AND at = ?', d.kind, d.key, d.at);
        } catch (err) {
          this.ctx.storage.transactionSync(() => {
            for (const d of rows) this.handlerThrew(d, now, err);
          });
        }
      }
    } finally {
      this.rearm();
    }
  }

  /**
   * The handler of deadline `d` (as read) threw at `now`: it is tried again after the backoff, or, at the last
   * attempt, it fails and what it was for ends: the run fails with its sentence (`failStale`), the waiting answers
   * stop being started (they stay in your changes for the next tidy-up), a gone ticket is forgotten. A deadline set
   * again in between is left alone.
   */
  private handlerThrew(d: DeadlineRow, now: number, err: unknown): void {
    const sql = this.ctx.storage.sql;
    const attempts = d.attempts + 1;
    if (attempts < DEADLINE_ATTEMPTS) {
      console.error(`the ${d.kind} deadline failed (attempt ${attempts} of ${DEADLINE_ATTEMPTS}); trying again`, err);
      const at = now + DEADLINE_BACKOFF_MS * 2 ** (attempts - 1);
      sql.exec('UPDATE deadlines SET at = ?, attempts = ? WHERE kind = ? AND key = ? AND at = ?', at, attempts, d.kind, d.key, d.at);
      return;
    }
    if (sql.exec('DELETE FROM deadlines WHERE kind = ? AND key = ? AND at = ?', d.kind, d.key, d.at).rowsWritten === 0) return;
    console.error(`the ${d.kind} deadline for ${d.key} gave up after ${attempts} attempts`, err);
    this.deadlineFailed(d, now);
  }

  /** What a deadline that failed was for ends honestly (`handlerThrew`). */
  private deadlineFailed(d: DeadlineRow, now: number): void {
    if (d.kind === 'run') {
      const current = this.currentRunRow();
      if (current !== undefined && current.id === d.key && ACTIVE_PHASES.includes(current.phase)) this.failStale(current, now);
    } else if (d.kind === 'answers') {
      const waiting = this.ctx.storage.kv.get<AnswersWaiting>(ANSWERS_WAITING);
      if (waiting !== undefined) this.ctx.storage.kv.put(ANSWERS_WAITING, { ...waiting, tries: WAITING_TRIES } satisfies AnswersWaiting);
    } else {
      this.ctx.storage.sql.exec('DELETE FROM run_ticket WHERE hash = ? AND run_id = ?', d.key, GONE_RUN);
    }
  }

  /**
   * The run the answers that waited asked for (TL-P4-13 addendum), once the run they waited for has ended: the state
   * transition on a run's end, carried out by the object's own alarm (https://developers.cloudflare.com/durable-objects/api/alarms/),
   * so no press is needed. One run for all of them: scoped to their subjects' piles with your changes (scope `all`), or
   * to your changes alone when none has a subject (keeping one note). It is admitted as any press, under the requestId
   * `answers-after-<the ended run>`, so a retried alarm or a second end admits it once; it counts in the daily quota.
   * The day's tidy-ups used up: the answers keep waiting (refused at the answer already, so only a lowered limit gets
   * here). Drive or GitHub trouble: logged, and tried again a minute later, `WAITING_TRIES` in a row; a folder or
   * Google access gone, or nothing left to take, is logged and not tried again. The answers stay in your changes for
   * the next tidy-up whatever happens here.
   */
  private async startWaiting(now: number, github: GitHubAccess, spent: () => number): Promise<void> {
    const due = this.ctx.storage.transactionSync((): { waiting: AnswersWaiting; requestId: string; accountEpoch: number } | null => {
      const waiting = this.ctx.storage.kv.get<AnswersWaiting>(ANSWERS_WAITING);
      const current = this.currentRunRow();
      const accountEpoch = this.account()?.accountEpoch;
      // A run going takes them at its own end.
      if (waiting === undefined || accountEpoch === undefined || (current !== undefined && ACTIVE_PHASES.includes(current.phase))) return null;
      return { waiting, requestId: `answers-after-${current?.id ?? 'none'}`, accountEpoch };
    });
    if (due === null) return;
    const { waiting, requestId, accountEpoch } = due;
    const scope: RunScope = waiting.subjects.length > 0 ? 'all' : 'instructions';
    let manifest: AdmissionManifest;
    try {
      manifest = await admission(this.env, this, { scope, subjects: waiting.subjects, now }, github.fetchImpl, spent);
    } catch (err) {
      console.error('the answers that waited could not start their tidy-up', err);
      const final = err instanceof HttpError && (err.code === 'signed-out' || err.code === 'no-folder' || err.code === 'nothing');
      this.ctx.storage.transactionSync(() => this.waitingFailed(requestId, final, now));
      return;
    }
    const input: AdmitInput = { scope, allowWeb: waiting.allowWeb, requestId, now, accountEpoch, dailyLimit: Number(this.env.DAILY_RUN_LIMIT), manifest };
    const result = this.ctx.storage.transactionSync((): AdmitResult => this.admitSync(input, true));
    if (!result.admitted && result.refused === 'gone') {
      console.error('the answers that waited were not started: the account is gone');
      return;
    }
    if (!result.admitted) {
      console.error(`the answers that waited keep waiting: ${result.refused}`);
      return;
    }
    // Its dispatch is due now: this same alarm sends it.
    if (result.created === true) await this.dispatchDue(now, github);
  }

  /** A start of the waiting answers' run failed: another in a minute, unless `final` or tried enough; they keep waiting. */
  private waitingFailed(requestId: string, final: boolean, now: number): void {
    const kv = this.ctx.storage.kv;
    const waiting = kv.get<AnswersWaiting>(ANSWERS_WAITING);
    // Taken in between (a press on the whole inbox), or already their run: nothing to try again.
    if (waiting === undefined || this.ctx.storage.sql.exec('SELECT id FROM runs WHERE request_id = ?', requestId).toArray().length > 0) return;
    const tries = waiting.tries + 1;
    kv.put(ANSWERS_WAITING, { ...waiting, tries } satisfies AnswersWaiting);
    if (final || tries >= WAITING_TRIES) return;
    const current = this.currentRunRow();
    if (current !== undefined && ACTIVE_PHASES.includes(current.phase)) return;
    this.arm('answers', 'waiting', now + RECHECK_MS);
  }

  /** Drops the tickets kept after Delete me (`GONE_RUN`) expired at `now`, with their deadlines. */
  private pruneGone(now: number): void {
    this.disarm('gone', now);
    this.ctx.storage.sql.exec('DELETE FROM run_ticket WHERE run_id = ? AND expires_at <= ?', GONE_RUN, now);
  }

  /** The `run` deadline: a dispatch due is sent (`dispatchDue`); otherwise recovery looks at the run (`recover`). */
  private async runDue(now: number, github: GitHubAccess): Promise<void> {
    if (!(await this.dispatchDue(now, github))) await this.recover(now, github);
  }

  /**
   * The one dispatch path (TL-P4-14 stage 2): the current run's next attempt, when `runs.deadline_at` is due at `now`
   * (admission and a redispatch set it). Only the alarm calls it. Two synchronous sections around the ticket's hashing:
   * the first reads the run's `version`; the second claims the dispatch by compare-and-set on it (`UPDATE ... WHERE
   * version = ?`, a conditional write in one transaction: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
   * mints the ticket and sets the stale deadline. So however many alarms run at once, one sends; the others find it
   * claimed. Lost after its retries, the alarm looks at the run a minute later (`dispatchLostSync`); a 4xx keeps the
   * normal window. True when a dispatch was due. Nothing here logs the ticket.
   */
  private async dispatchDue(now: number, github: GitHubAccess): Promise<boolean> {
    const seen = this.ctx.storage.transactionSync(() => {
      const run = this.currentRunRow();
      if (run === undefined || !ACTIVE_PHASES.includes(run.phase)) return null;
      const row = this.ctx.storage.sql.exec<{ version: number; deadline_at: number | null }>('SELECT version, deadline_at FROM runs WHERE id = ?', run.id).one();
      return row.deadline_at !== null && row.deadline_at <= now ? { id: run.id, version: row.version } : null;
    });
    if (seen === null) return false;
    const { token } = github;
    const ticket = newTicket();
    const hash = await hashTicket(ticket);
    const claimed = this.ctx.storage.transactionSync(() => this.claimDispatch(seen.id, seen.version, token === undefined ? null : hash, now));
    if (claimed === null) return true;
    if (token === undefined) {
      console.error('tidy dispatch is not configured: no GitHub token');
      return true;
    }
    const sent = await dispatchOutcome({ repo: github.repo, token, runId: seen.id, ticket, ...claimed }, github.fetchImpl);
    if (sent === 'lost') this.ctx.storage.transactionSync(() => this.dispatchLostSync(seen.id, now + RECHECK_MS));
    return true;
  }

  /**
   * `dispatchDue`'s claim: compare-and-set on the run's `version`, then attempt `nextAttempt`'s ticket kept as `hash`
   * (none when dispatch is not configured), and the run's stale deadline set. Null when another alarm claimed it first
   * or the run ended.
   */
  private claimDispatch(runId: string, version: number, hash: string | null, now: number): { attempt: number; scope: RunScope; allowWeb: boolean } | null {
    const row = this.ctx.storage.sql
      .exec<{ scope: RunScope; allow_web: number }>(
        'UPDATE runs SET deadline_at = NULL, version = version + 1 WHERE id = ? AND version = ? AND deadline_at IS NOT NULL RETURNING scope, allow_web',
        runId,
        version,
      )
      .toArray()[0];
    if (row === undefined) return null;
    const attempt = this.nextAttempt(runId);
    if (hash !== null && !this.keepTicket(runId, attempt, hash, now)) return null;
    const run = this.currentRunRow();
    if (run !== undefined && ACTIVE_PHASES.includes(run.phase)) {
      this.arm('run', run.id, staleDeadline(toWire(run), this.attemptOf(run.id), this.ctx.storage.kv.get<RecoveryWatch>(RECOVERY_WATCH)));
    }
    return { attempt, scope: row.scope, allowWeb: row.allow_web === 1 };
  }

  /**
   * Recovery without the browser (worker contract, "Runner wire"; TL-P3-18; recovery.ts). Two synchronous
   * sections around the GitHub lookup, each deciding with no `await` inside:
   * 1. a run that ended needs no alarm; a run whose deadline moved (a report arrived, or a wait applies)
   *    gets the alarm for it, and nothing changes; a stale run with no token, or past its one wait, is
   *    failed `stale`; any other stale run is looked up;
   * 2. if the run moved during the lookup, only the alarm is set again; else the lookup's outcome: a
   *    redispatch as attempt + 1 (its dispatch due now), when attempt 1 has no live job (none found, or every job
   *    completed), a wait until the live job's deadline, or failed `stale`.
   * The redispatch is sent by this same alarm through the one dispatch path (`dispatchDue`), with a new ticket that
   * fences the older one; if it is lost, the alarm looks again a minute later.
   */
  async recover(now: number, github: GitHubAccess): Promise<void> {
    const token = github.token;
    const lookup = this.ctx.storage.transactionSync(() => this.planRecovery(now, token !== undefined));
    if (lookup === null || token === undefined) return;
    const found = await findTidyRun({ repo: github.repo, token, runId: lookup.run.id, attempt: lookup.attempt }, github.fetchImpl);
    // An early look-up that GitHub could not answer never fails the run: the alarm asks again in a minute, until the stale deadline.
    if (found === null && lookup.early) {
      this.ctx.storage.transactionSync(() => this.dispatchLostSync(lookup.run.id, now + RECHECK_MS));
      return;
    }
    const outcome = decide(found, lookup.attempt, now);
    if (this.ctx.storage.transactionSync(() => this.applyRecovery(lookup, outcome, now))) await this.dispatchDue(now, github);
  }

  /** A dispatch failed after its retries: the alarm looks at the going run at `at`, not at its stale deadline. */
  private dispatchLostSync(runId: string, at: number): void {
    const run = this.currentRunRow();
    if (run === undefined || run.id !== runId || !ACTIVE_PHASES.includes(run.phase)) return;
    this.ctx.storage.kv.put(DISPATCH_LOST, { runId, at, attempt: this.attemptOf(runId), phaseAt: run.phase_at } satisfies DispatchLost);
    this.arm('run', runId, at);
  }

  /** Section 1 of `recover`: the run to look up, or null when its deadline is set or the run ended here. */
  private planRecovery(now: number, configured: boolean): RecoveryLookup | null {
    const run = this.currentRunRow();
    if (run === undefined || !ACTIVE_PHASES.includes(run.phase)) {
      this.disarm('run');
      return null;
    }
    // A dispatch still pending is the alarm's to send (`dispatchDue`): recovery keeps its deadline and looks at nothing.
    const pending = this.pendingDispatch(run.id);
    if (pending !== null) {
      this.arm('run', run.id, pending);
      return null;
    }
    const wire = toWire(run);
    const attempt = this.attemptOf(run.id);
    const watch = this.ctx.storage.kv.get<RecoveryWatch>(RECOVERY_WATCH);
    const deadline = staleDeadline(wire, attempt, watch);
    const lost = this.ctx.storage.kv.get<DispatchLost>(DISPATCH_LOST);
    // The flag holds only for the run, attempt and phase it was set for; a run that has reported is left to its own deadline.
    const lostHere = lost?.runId === run.id && lost.attempt === attempt && lost.phaseAt === run.phase_at ? lost : undefined;
    if (lost !== undefined && lostHere === undefined) this.ctx.storage.kv.delete(DISPATCH_LOST);
    // A lost dispatch brings the look-up forward, once; the rules after it are unchanged.
    const early = lostHere !== undefined && lostHere.at <= now && deadline > now;
    if (lostHere !== undefined && lostHere.at <= now) this.ctx.storage.kv.delete(DISPATCH_LOST);
    else if (deadline > now) {
      this.arm('run', run.id, lostHere === undefined ? deadline : Math.min(deadline, lostHere.at));
      return null;
    }
    if (!configured) {
      console.error('tidy recovery is not configured: no GitHub token');
      this.failStale(run, now);
      return null;
    }
    // The second stale deadline: the live job's one wait ran out with no news.
    if (applyingWatch(wire, attempt, watch)?.graced === true) {
      this.failStale(run, now);
      return null;
    }
    return { run: wire, attempt, watch: JSON.stringify(watch ?? null), early };
  }

  /** Section 2 of `recover`: applies the outcome; true when it is a redispatch, due now. */
  private applyRecovery(seen: RecoveryLookup, outcome: Recovery, now: number): boolean {
    const run = this.currentRunRow();
    const watch = this.ctx.storage.kv.get<RecoveryWatch>(RECOVERY_WATCH);
    const moved =
      run === undefined ||
      run.id !== seen.run.id ||
      run.phase !== seen.run.phase ||
      run.phase_at !== seen.run.phaseAt ||
      this.attemptOf(run.id) !== seen.attempt ||
      JSON.stringify(watch ?? null) !== seen.watch;
    if (moved) {
      if (run === undefined || !ACTIVE_PHASES.includes(run.phase)) this.disarm('run');
      // A run admitted meanwhile keeps its dispatch deadline: recovery moves only the deadline of a run it looked at.
      else this.arm('run', run.id, this.pendingDispatch(run.id) ?? Math.max(staleDeadline(toWire(run), this.attemptOf(run.id), watch), now + RECHECK_MS));
      return false;
    }
    if (outcome.kind === 'fail') {
      this.failStale(run, now);
      return false;
    }
    if (outcome.kind === 'wait') {
      this.watch({ runId: run.id, attempt: seen.attempt, phaseAt: run.phase_at, until: outcome.until, graced: true });
      return false;
    }
    this.watch({ runId: run.id, attempt: this.nextAttempt(run.id), phaseAt: run.phase_at, until: now + QUEUED_STALE_MS, graced: false });
    this.ctx.storage.sql.exec('UPDATE runs SET deadline_at = ? WHERE id = ?', now, run.id);
    return true;
  }

  /** When run `runId`'s next dispatch is due (`runs.deadline_at`, set by admission or a redispatch), or null when none is pending. */
  private pendingDispatch(runId: string): number | null {
    return this.ctx.storage.sql.exec<{ deadline_at: number | null }>('SELECT deadline_at FROM runs WHERE id = ?', runId).toArray()[0]?.deadline_at ?? null;
  }

  /** Keeps the extra time the alarm gave a run's attempt, and sets the run's deadline for its end. */
  private watch(watch: RecoveryWatch): void {
    this.ctx.storage.kv.put(RECOVERY_WATCH, watch);
    this.arm('run', watch.runId, watch.until);
  }

  /** The run's current attempt: its ticket's, or 1 before any ticket was minted. */
  private attemptOf(runId: string): number {
    return this.ctx.storage.sql.exec<{ attempt: number | null }>('SELECT MAX(attempt) AS attempt FROM run_ticket WHERE run_id = ?', runId).toArray()[0]?.attempt ?? 1;
  }

  /** The attempt the run's next dispatch sends: one past its newest ticket's, or 1. */
  private nextAttempt(runId: string): number {
    return (this.ctx.storage.sql.exec<{ attempt: number | null }>('SELECT MAX(attempt) AS attempt FROM run_ticket WHERE run_id = ?', runId).one().attempt ?? 0) + 1;
  }

  /**
   * Keeps the ticket hashed to `hash` as `attempt`'s of the going run `runId` (worker contract, "Runner wire"; TL-P3-18),
   * minted by the alarm's dispatch (`claimDispatch`) and sent in the payload. Only its SHA-256 is kept, with the attempt
   * and an expiry at `now` + 60 min; it retires the run's earlier tickets (kept, never deleted), so an older attempt's
   * ticket answers `stale-attempt`. False, with nothing written, for an attempt not newer than the kept one or a run
   * unknown or ended.
   */
  private keepTicket(runId: string, attempt: number, hash: string, now: number): boolean {
    const sql = this.ctx.storage.sql;
    const run = sql.exec<{ phase: RunPhase }>('SELECT phase FROM runs WHERE id = ?', runId).toArray()[0];
    if (run === undefined || !ACTIVE_PHASES.includes(run.phase)) return false;
    const held = sql.exec<{ attempt: number | null }>('SELECT MAX(attempt) AS attempt FROM run_ticket WHERE run_id = ?', runId).toArray()[0];
    if (held?.attempt != null && attempt <= held.attempt) return false;
    // The run's earlier tickets are retired, not deleted: a lower attempt than the newest is superseded.
    // The tickets of runs no longer kept go.
    sql.exec('UPDATE run_ticket SET retired = 1 WHERE run_id = ?', runId);
    sql.exec('DELETE FROM run_ticket WHERE run_id NOT IN (SELECT id FROM runs)');
    sql.exec(
      'INSERT INTO run_ticket (hash, run_id, attempt, retired, expires_at) VALUES (?, ?, ?, 0, ?)',
      hash,
      runId,
      attempt,
      now + TICKET_TTL_MS,
    );
    return true;
  }

  /**
   * `GET /runner/runs/:id/token`: the attempt, folder and admission manifest that the ticket hashed to `hash` opens for run
   * `runId`; `stale-attempt` for a ticket a newer attempt superseded, null for one that is unknown, wrong,
   * retired or expired at `now`. A stale run is ended first, as `runStatus` does, so its ticket no longer works.
   *
   * `gone` when the person can no longer be acted for, so the runner drops the Drive token it keeps:
   * after Delete me (no account, for a ticket live then: `GONE_RUN`), or once Google access was forgotten
   * (`forgetGoogleAccess`: revoked, or the refresh token unreadable) for a live ticket. A plain sign-out keeps the
   * refresh token, so its runs go on: a run never depends on a browser.
   */
  runnerAccess(runId: string, hash: string, now: number): RunnerGrant | 'stale-attempt' | 'gone' | null {
    return this.ctx.storage.transactionSync((): RunnerGrant | 'stale-attempt' | 'gone' | null => {
      if (this.account() === null) return this.goneTicket(hash, now) ? 'gone' : null;
      this.expire(now);
      const found = this.findTicket(runId, hash, now);
      if (found.kind === 'superseded') return 'stale-attempt';
      if (found.kind !== 'live') return null;
      if (this.encryptedRefreshToken() === null) return 'gone';
      const kept = this.ctx.storage.sql.exec<{ manifest: string | null }>('SELECT manifest FROM runs WHERE id = ?', runId).toArray()[0]?.manifest ?? null;
      const manifest: unknown = kept === null ? null : JSON.parse(kept);
      return { attempt: found.row.attempt, folderId: this.folderId(), manifest: isAdmissionManifest(manifest) ? manifest : null };
    });
  }

  /** Whether `hash` is a ticket that was live at Delete me and has not expired at `now` (`GONE_RUN`); expired rows go. */
  private goneTicket(hash: string, now: number): boolean {
    this.pruneGone(now);
    const row = this.ctx.storage.sql.exec<{ hash: string }>('SELECT hash FROM run_ticket WHERE run_id = ? AND hash = ?', GONE_RUN, hash).toArray()[0];
    return row !== undefined && timingSafeEqual(row.hash, hash);
  }

  /**
   * `POST /runner/runs/:id/status` (worker contract, "Runner wire"). One synchronous transaction, in order:
   * 1. the ticket: live and matching; a superseded one is `stale-attempt`; one retired by the run's end
   *    answers the current state to a repeat of its last report (same attempt and `seq`); else `signed-out`;
   * 2. the attempt: the ticket's own, else `stale-attempt`;
   * 3. a repeat of the last `seq` answers the current state and changes nothing;
   * 4. a lower `seq`, a phase behind this attempt's own last one, or a run already ended is `stale-report`, with the
   *    current `seq` of this attempt and the run's phase;
   * 5. a phase behind the run's own (a later attempt starting over) is kept, with its `seq`, and answers the current
   *    run and revision: the run a person sees never moves back;
   * 6. else the run's phase (`phaseAt` when it changes), `total`, `failure` and `finishedAt` as given, the report's
   *    `seq` kept, and the revision raised only when the run shows something new (phase, `total` or `failure`);
   * 7. `done` or `failed` retires the ticket.
   */
  runnerReport(runId: string, hash: string, report: RunnerReport, now: number): RunnerReportResult {
    return this.ctx.storage.transactionSync((): RunnerReportResult => {
      const sql = this.ctx.storage.sql;
      this.expire(now);
      const found = this.findTicket(runId, hash, now);
      if (found.kind === 'superseded') return { accepted: false, refused: 'stale-attempt' };
      if (found.kind === 'retired') {
        const again = report.attempt === found.row.attempt && report.seq === found.row.report_seq;
        const ended = sql.exec<RunRow>(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`, runId).toArray()[0];
        if (!again || ended === undefined) return { accepted: false, refused: 'signed-out' };
        return { accepted: true, reply: { run: toWire(ended), revision: this.revision() } };
      }
      if (found.kind !== 'live') return { accepted: false, refused: 'signed-out' };
      const ticket = found.row;
      if (report.attempt !== ticket.attempt) return { accepted: false, refused: 'stale-attempt' };
      const run = sql.exec<RunRow>(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`, runId).toArray()[0];
      if (run === undefined) return { accepted: false, refused: 'signed-out' };
      if (report.seq === ticket.report_seq) {
        return { accepted: true, reply: { run: toWire(run), revision: this.revision() } };
      }
      const late = ticket.report_seq !== null && report.seq < ticket.report_seq;
      // Behind this attempt's own last phase is out of order; behind the run's phase alone is a later attempt starting over.
      const behindItself = ticket.report_phase !== null && PHASE_RANK[report.phase] < PHASE_RANK[ticket.report_phase];
      if (late || behindItself || !ACTIVE_PHASES.includes(run.phase)) {
        return { accepted: false, refused: 'stale-report', current: { seq: ticket.report_seq ?? 0, phase: run.phase } };
      }
      if (PHASE_RANK[report.phase] < PHASE_RANK[run.phase]) {
        // Recorded, never shown: the run and its revision stay as they were.
        sql.exec('UPDATE run_ticket SET report_seq = ?, report_phase = ? WHERE hash = ?', report.seq, report.phase, hash);
        return { accepted: true, reply: { run: toWire(run), revision: this.revision() } };
      }
      const ended = !ACTIVE_PHASES.includes(report.phase);
      const total = report.total ?? run.total;
      const failure = report.failure ?? null;
      const questions = report.questions === undefined ? run.open_questions_snapshot : JSON.stringify(report.questions.map(publicQuestion));
      const shows = report.phase !== run.phase || total !== run.total || failure !== run.failure
        || questions !== run.open_questions_snapshot;
      const row = shows
        ? sql
            .exec<RunRow>(
              `UPDATE runs SET phase = ?1, phase_at = CASE WHEN phase = ?1 THEN phase_at ELSE ?2 END,
                 total = ?3, failure = ?4, finished_at = ?5, open_questions_snapshot = ?7
               WHERE id = ?6
               RETURNING ${RUN_COLUMNS}`,
              report.phase,
              now,
              total,
              failure,
              ended ? now : null,
              runId,
              questions,
            )
            .one()
        : run;
      sql.exec('UPDATE run_ticket SET report_seq = ?, report_phase = ?, retired = ? WHERE hash = ?', report.seq, report.phase, ended ? 1 : 0, hash);
      if (ended && report.answersStayed === true) this.answersStayed();
      if (ended) this.wakeForWaiting(now);
      return { accepted: true, reply: { run: toWire(row), revision: shows ? this.raiseRevision() : this.revision() } };
    });
  }

  /**
   * `POST /runner/runs/:id/status` with `{ attempt, ended: true }` (TL-P4-16 addendum 4): the attempt stopped with no
   * terminal report, so the alarm looks at the run `RECHECK_MS` from `now` instead of at its stale deadline, through
   * the same early look as a lost dispatch; `decide` then redispatches, waits for a live job or ends the run. Nothing
   * a person sees changes. The ticket is checked as for a report: a superseded one is `stale-attempt`; a run already
   * ended answers its state, with nothing armed.
   */
  runnerEnded(runId: string, hash: string, attempt: number, now: number): RunnerReportResult {
    return this.ctx.storage.transactionSync((): RunnerReportResult => {
      this.expire(now);
      const found = this.findTicket(runId, hash, now);
      if (found.kind === 'superseded') return { accepted: false, refused: 'stale-attempt' };
      if (found.kind !== 'live' && found.kind !== 'retired') return { accepted: false, refused: 'signed-out' };
      if (attempt !== found.row.attempt) return { accepted: false, refused: 'stale-attempt' };
      const run = this.ctx.storage.sql.exec<RunRow>(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`, runId).toArray()[0];
      if (run === undefined) return { accepted: false, refused: 'signed-out' };
      if (found.kind === 'live') this.dispatchLostSync(runId, now + RECHECK_MS);
      return { accepted: true, reply: { run: toWire(run), revision: this.revision() } };
    });
  }

  /**
   * The ticket hashed to `hash` for `runId` (compared in constant time), and what it is at `now`: `live`;
   * `superseded` (retired, with a newer attempt's ticket kept for the run); `retired` (its run ended); or
   * `unknown` (no such ticket, or expired).
   */
  private findTicket(
    runId: string,
    hash: string,
    now: number,
  ): { kind: 'live' | 'retired'; row: TicketRow } | { kind: 'superseded' | 'unknown' } {
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec<TicketRow>('SELECT hash, attempt, expires_at, retired, report_seq, report_phase FROM run_ticket WHERE run_id = ? AND hash = ?', runId, hash)
      .toArray()[0];
    if (row === undefined || !timingSafeEqual(row.hash, hash)) return { kind: 'unknown' };
    if (row.retired === 1) {
      const newer = sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM run_ticket WHERE run_id = ? AND attempt > ?', runId, row.attempt).one().n;
      return newer > 0 ? { kind: 'superseded' } : { kind: 'retired', row };
    }
    return row.expires_at <= now ? { kind: 'unknown' } : { kind: 'live', row };
  }

  /** `GET /status`: writes a stale run's expiry first (as `admit` does), then the current run and revision. */
  runStatus(now: number): RunReply {
    return this.ctx.storage.transactionSync((): RunReply => {
      this.expire(now);
      const current = this.currentRunRow();
      return { run: current === undefined ? null : toWire(current), revision: this.revision() };
    });
  }

  /** The newest run, or undefined before any. */
  private currentRunRow(): RunRow | undefined {
    return this.ctx.storage.sql
      .exec<RunRow>(`SELECT ${RUN_COLUMNS} FROM runs ORDER BY seq DESC LIMIT 1`)
      .toArray()[0];
  }

  /**
   * Marks the current run failed when it is stale at `now`, once: a run already ended is left alone. A wait
   * the alarm gave the run (a redispatch, or a live job) holds off the expiry until it ends. With dispatch
   * configured, only the alarm's recovery decides a stale run (it may find a live job on GitHub, or be
   * awaiting the lookup right now); this path ends it only past `unrecoveredCeiling`, in case no alarm
   * ever fires. Without a token there is nothing to look up, and the run expires at its deadline.
   */
  private expire(now: number): void {
    const current = this.currentRunRow();
    if (current === undefined || !ACTIVE_PHASES.includes(current.phase)) return;
    const watch = this.ctx.storage.kv.get<RecoveryWatch>(RECOVERY_WATCH);
    const wire = toWire(current);
    const deadline = staleDeadline(wire, this.attemptOf(current.id), watch);
    const waitForRecovery = this.env.GITHUB_TOKEN !== undefined ? unrecoveredCeiling(wire) : 0;
    if (deadline + waitForRecovery > now) return;
    this.failStale(current, now);
  }

  /** Ends `run` as failed `stale`: the revision rises once, its ticket is retired, and its deadline goes. */
  private failStale(run: RunRow, now: number): void {
    this.ctx.storage.sql.exec(
      "UPDATE runs SET phase = 'failed', phase_at = ?, finished_at = ?, failure = ? WHERE id = ?",
      now,
      now,
      staleFailure(run.phase),
      run.id,
    );
    // An ended run's ticket stops working, as a runner's own `done` or `failed` retires it.
    this.ctx.storage.sql.exec('UPDATE run_ticket SET retired = 1 WHERE run_id = ?', run.id);
    this.ctx.storage.kv.delete(RECOVERY_WATCH);
    this.disarm('run');
    this.wakeForWaiting(now);
    this.raiseRevision();
  }

  /** The control row's status revision, 0 before any run was written. */
  private revision(): number {
    return (
      this.ctx.storage.sql
        .exec<{ status_revision: number }>('SELECT status_revision FROM control WHERE id = 1')
        .toArray()[0]?.status_revision ?? 0
    );
  }

  /** Raises the status revision: call on every write to `runs`, and never otherwise. */
  private raiseRevision(): number {
    return this.ctx.storage.sql
      .exec<{ status_revision: number }>(
        `INSERT INTO control (id, status_revision) VALUES (1, 1)
         ON CONFLICT (id) DO UPDATE SET status_revision = status_revision + 1
         RETURNING status_revision`,
      )
      .one().status_revision;
  }
}

/** How many runs a person keeps (the current one and the history before it). */
const RUNS_KEPT = 20;

const RUN_COLUMNS = 'id, seq, scope, phase, requested_at, phase_at, finished_at, total, failure, open_questions_snapshot';

interface RunRow extends Record<string, SqlStorageValue> {
  id: string;
  seq: number;
  scope: RunScope;
  phase: RunPhase;
  requested_at: number;
  phase_at: number;
  finished_at: number | null;
  total: number | null;
  failure: string | null;
  open_questions_snapshot: string | null;
}

interface TicketRow extends Record<string, SqlStorageValue> {
  hash: string;
  /** The attempt the ticket was minted for. */
  attempt: number;
  expires_at: number;
  retired: number;
  report_seq: number | null;
  /** The phase of that last report. */
  report_phase: RunPhase | null;
}

function toWire(row: RunRow): RunWire {
  let questions: PublicQuestion[] | undefined;
  if (row.open_questions_snapshot !== null) {
    const value: unknown = JSON.parse(row.open_questions_snapshot);
    if (!isQuestionSnapshot(value)) throw new HttpError(500, 'internal');
    questions = value;
  }
  return {
    id: row.id,
    scope: row.scope,
    phase: row.phase,
    requestedAt: row.requested_at,
    phaseAt: row.phase_at,
    ...(row.finished_at === null ? {} : { finishedAt: row.finished_at }),
    ...(row.total === null ? {} : { total: row.total }),
    ...(row.failure === null ? {} : { failure: row.failure }),
    ...(questions === undefined ? {} : { questions }),
  };
}
