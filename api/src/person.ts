import { DurableObject } from 'cloudflare:workers';

import { isAdmissionManifest } from '../../src/data/spine/admission.js';
import type { AdmissionManifest } from '../../src/data/spine/admission.js';
import type { Env } from './env.js';
import { dispatchOutcome, findTidyRun } from './github.js';
import type { GitHubAccess } from './github.js';
import { applyingWatch, decide, staleDeadline, staleFailure, unrecoveredCeiling } from './recovery.js';
import type { Recovery, RecoveryWatch } from './recovery.js';
import { timingSafeEqual } from './crypto.js';
import { migrate, readSchemaVersion } from './person-schema.js';
import { ACTIVE_PHASES, QUEUED_STALE_MS, admission, dispatchNew, utcDay } from './process.js';
import type { AdmitInput, AdmitResult, RunPhase, RunReply, RunScope, RunWire } from './process.js';
import type { FetchLike } from './google.js';
import { HttpError } from './errors.js';
import { PHASE_RANK, TICKET_TTL_MS, hashTicket, makeRunId, newTicket } from './run-ticket.js';
import type { RunnerAccess, RunnerReport, RunnerReportResult } from './run-ticket.js';
import { LEASE_TTL_MS } from './session-lease.js';
import type { LeaseReply, SessionAction } from './session-lease.js';

/** What a live runner ticket opens: its attempt and folder, and what the run was admitted to take (null for a run from before v9). */
export interface RunnerGrant extends RunnerAccess {
  manifest: AdmissionManifest | null;
}

/** `session_lease.place` while nobody holds the lease (a real place is 1 to 64 characters). */
const FREE_PLACE = '';
/** How long a place's latest leave generation is kept. */
const LEAVE_KEPT_MS = 24 * 60 * 60 * 1000;

/** The person's account row, as `GET /me` and the session check read it. */
export interface PersonAccount {
  email: string;
  name: string;
  /** Bumped at sign-out: a session cookie carrying another value is retired. */
  generation: number;
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
 * Durable Object key-value entry that outlives `forget()` for at most a ticket's hour: the run tickets that were live at
 * Delete me (their SHA-256, expiry and attempt; random values, nothing personal: no run id), so a runner still holding
 * one is told the person is gone, while any other bearer stays signed out. Each row's expiry is a `gone` deadline, so
 * the alarm (and any later access) prunes expired rows, and after the last expiry nothing is kept.
 */
const GONE_TICKETS = 'goneTickets';

/** A run ticket live at Delete me (`GONE_TICKETS`). */
interface GoneTicket {
  hash: string;
  expiresAt: number;
  attempt: number;
}
/** Durable Object key-value entry: the extra time the alarm gave the current run's attempt (`RecoveryWatch`). */
const RECOVERY_WATCH = 'recoveryWatch';
/** When a run moved during the alarm's lookup and is somehow still due, the alarm looks again this much later. */
const RECHECK_MS = 60 * 1000;
/** Key-value entry: a dispatch that failed after its retries (`DispatchLost`); the alarm looks at the run then. */
const DISPATCH_LOST = 'dispatchLost';

/** The run whose dispatch was lost, and when the alarm should look at it (`RECHECK_MS` after the loss). */
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
 * - `run`: the current run's stale deadline, or an earlier recheck (a lost dispatch, a run that moved); one row;
 * - `answers`: the waiting answers' wake once the run they waited for ended; one row;
 * - `gone`: a ticket kept after Delete me, keyed by its SHA-256, at its expiry; one row each.
 */
type DeadlineKind = 'run' | 'answers' | 'gone';

interface DeadlineRow extends Record<string, SqlStorageValue> {
  kind: DeadlineKind;
  key: string;
  at: number;
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
          // Storage from before v12 moves its deadlines into the table; a new one (0) has none.
          if (from > 0 && from < 12) this.moveDeadlines(Date.now());
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
    return row === undefined ? null : { email: row.email, name: row.name, generation: row.session_generation };
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
   * before any is created, unless ids are kept for that folder already; only
   * while that folder is the pointer and not complete. Answers the ids kept
   * for that folder (the earlier ones when there were any), or null when
   * refused: the caller reads the state again.
   */
  reserveTemplate(gen: number, templateIds: TemplateIds): Record<string, string> | null {
    const { folderId } = templateIds;
    if (this.account()?.generation !== gen) return null;
    this.ctx.storage.sql.exec(
      `UPDATE account SET pending_template_ids = ?
       WHERE id = 1 AND session_generation = ? AND folder_id = ? AND folder_complete = 0
         AND (pending_template_ids IS NULL OR json_extract(pending_template_ids, '$.folderId') IS NOT ?)`,
      JSON.stringify(templateIds),
      gen,
      folderId,
      folderId,
    );
    const state = this.vaultState();
    return state.folderId === folderId && !state.complete && state.templateIds?.folderId === folderId
      ? state.templateIds.ids
      : null;
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
   * `POST /session` (worker contract, "One active session"; TL-P2-14/25, TL-P3-14), the same rules as the
   * app's pretend lease (`src/data/fake/fake-lease.ts`):
   * - a `check` whose `gen` is older than its place's latest `leave` began before that leave: it grants and
   *   renews nothing, and answers the current state for that place;
   * - a `check` by the holder renews it with the same epoch, even after the TTL when nobody took it, and so
   *   does one by the place that let it go while nobody had it since;
   * - a free or expired lease goes to whoever checks, and `take` always moves it, with epoch + 1;
   * - `leave` records the place's generation (never lowering it) and, by the holder, frees the lease with
   *   its epoch kept.
   * One synchronous transaction, so no other call reads between the read and the write (a fencing token in
   * Kleppmann's sense: the epoch only grows while anyone has had the lease).
   */
  session(place: string, action: SessionAction, gen: number, now: number): LeaseReply {
    return this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      const lease = this.lease();
      const write = (holder: string | null, epoch: number, beatAt: number, left: string | null): void => {
        sql.exec(
          `INSERT INTO session_lease (id, place, epoch, beat_at, left_place) VALUES (1, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET place = excluded.place, epoch = excluded.epoch,
             beat_at = excluded.beat_at, left_place = excluded.left_place`,
          holder ?? FREE_PLACE,
          epoch,
          beatAt,
          left,
        );
      };
      if (action === 'leave') {
        sql.exec(
          `INSERT INTO session_leave (place, gen, left_at) VALUES (?, ?, ?)
           ON CONFLICT (place) DO UPDATE SET gen = MAX(gen, excluded.gen), left_at = excluded.left_at`,
          place,
          gen,
          now,
        );
        // A check in flight lasts seconds; a place that left long ago has nothing on its way.
        sql.exec('DELETE FROM session_leave WHERE left_at < ?', now - LEAVE_KEPT_MS);
        if (lease.holder === place) write(null, lease.epoch, lease.beatAt, place);
        return { active: false, epoch: lease.epoch };
      }
      if (action === 'check') {
        const last = sql
          .exec<{ gen: number }>('SELECT gen FROM session_leave WHERE place = ?', place)
          .toArray()[0]?.gen;
        if (last !== undefined && gen < last) return { active: lease.holder === place, epoch: lease.epoch };
        if (lease.holder === place || (lease.holder === null && lease.left === place)) {
          write(place, lease.epoch, now, null);
          return { active: true, epoch: lease.epoch };
        }
      }
      const live = lease.holder !== null && now - lease.beatAt < LEASE_TTL_MS;
      if (action === 'take' || !live) {
        write(place, lease.epoch + 1, now, null);
        return { active: true, epoch: lease.epoch + 1 };
      }
      return { active: false, epoch: lease.epoch };
    });
  }

  /**
   * Whether `place` holds the lease at `epoch`: the fence on the Worker's own endpoints. An expired lease
   * nobody took is still its holder's (TL-P2-25); a stale epoch or another place is not.
   */
  holdsLease(place: string, epoch: number): boolean {
    const lease = this.lease();
    return lease.holder === place && lease.epoch === epoch;
  }

  private lease(): { holder: string | null; epoch: number; beatAt: number; left: string | null } {
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
   * `DELETE /me`: empties the person object (account, tokens, folder pointer, claim, reserved ids, lease and
   * leave rows) with `storage.deleteAll()`, then sets the schema up again, since this live instance will not
   * run its constructor again: a later sign-in for the same sub starts fresh at the folder step.
   */
  async forget(): Promise<void> {
    // One integer survives, nothing personal: a new account starts at the old generation + 1, so every
    // cookie signed before the deletion stays refused after the person signs in again. The live run tickets'
    // hashes survive until they expire, so their runners stop as gone (`runnerAccess`).
    const kv = this.ctx.storage.kv;
    const now = this.account()?.generation;
    const floor = Math.max(kv.get<number>(GENERATION_FLOOR) ?? 0, now === undefined ? 0 : now + 1);
    const at = Date.now();
    const live = this.ctx.storage.sql
      .exec<{ hash: string; expires_at: number; attempt: number }>('SELECT hash, expires_at, attempt FROM run_ticket WHERE retired = 0 AND expires_at > ?', at)
      .toArray()
      .map((t): GoneTicket => ({ hash: t.hash, expiresAt: t.expires_at, attempt: t.attempt }));
    const kept = [...(kv.get<GoneTicket[]>(GONE_TICKETS) ?? []).filter((t) => t.expiresAt > at), ...live];
    // Every deadline goes with the rest (the run's and the answers'); only the gone tickets' expiries are set again.
    await this.ctx.storage.deleteAll();
    kv.put(GENERATION_FLOOR, floor);
    this.ctx.storage.transactionSync(() => {
      migrate(this.ctx.storage.sql);
      if (kept.length > 0) kv.put(GONE_TICKETS, kept);
      for (const t of kept) this.arm('gone', t.hash, t.expiresAt);
      this.rearm();
    });
  }

  /**
   * Schema v12 (TL-P4-14): the deadlines kept before the `deadlines` table move into it as the object starts, so
   * the deploy loses none. The gone tickets keep their expiries. The alarm set for a run or the waiting answers
   * cannot be read here (`getAlarm` is not synchronous), so their deadline is now: the alarm looks at once, as the
   * old alarm would have, and recovery arms the run's own deadline again.
   */
  private moveDeadlines(now: number): void {
    const kv = this.ctx.storage.kv;
    for (const t of kv.get<GoneTicket[]>(GONE_TICKETS) ?? []) this.arm('gone', t.hash, t.expiresAt);
    const current = this.currentRunRow();
    if (current !== undefined && ACTIVE_PHASES.includes(current.phase)) this.arm('run', current.id, now);
    else if (kv.get<AnswersWaiting>(ANSWERS_WAITING) !== undefined) this.arm('answers', 'waiting', now);
  }

  /** Keeps a deadline of `kind` for `key` at `at` (one row for `run` and `answers`), and sets the alarm. */
  private arm(kind: DeadlineKind, key: string, at: number): void {
    const sql = this.ctx.storage.sql;
    if (kind !== 'gone') sql.exec('DELETE FROM deadlines WHERE kind = ? AND key <> ?', kind, key);
    sql.exec(
      'INSERT INTO deadlines (kind, key, at) VALUES (?, ?, ?) ON CONFLICT (kind, key) DO UPDATE SET at = excluded.at',
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
   * `POST /process`, before Drive is read (TL-P3-21): whether a press with `requestId` would admit a new run at
   * `now`, that is neither a repeat of a known request nor while a run is going. Writes only a stale run's expiry,
   * as `admit` does. `admit` checks both again in its own section.
   */
  wouldAdmit(requestId: string, now: number): boolean {
    return this.ctx.storage.transactionSync((): boolean => {
      this.expire(now);
      const repeat = this.ctx.storage.sql.exec<{ id: string }>('SELECT id FROM runs WHERE request_id = ?', requestId).toArray()[0];
      if (repeat !== undefined) return false;
      const current = this.currentRunRow();
      return current === undefined || !ACTIVE_PHASES.includes(current.phase);
    });
  }

  /**
   * `POST /process` (process.ts; TL-P3-15). One synchronous transaction, no `await`, in this order:
   * 1. expiry: a stale current run is marked failed once, and the revision rises;
   * 2. idempotency: a known `requestId` answers its own run, ended or not, with nothing changed
   *    (the first request's scope and allowWeb win);
   * 3. one active run: a run going is answered, with nothing changed;
   * 4. the manifest: a new run with none built is refused as `needs-manifest`, with nothing written;
   * 5. quota: today's UTC counter at or over `dailyLimit` refuses with nothing written, else counts;
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
    if (current !== undefined && waiting?.requestIds.includes(input.requestId) === true) {
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
    if (input.manifest === null) return { admitted: false, refused: 'needs-manifest' };
    if (used >= input.dailyLimit) return { admitted: false, refused: 'rate-limited' };
    this.countQuota(day);
    // Only today's counter matters; earlier days go.
    sql.exec('DELETE FROM quota WHERE window < ?', day);
    const seq = (current?.seq ?? 0) + 1;
    const row = sql
      .exec<RunRow>(
        `INSERT INTO runs (id, seq, request_id, scope, allow_web, phase, requested_at, phase_at, manifest)
         VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)
         RETURNING ${RUN_COLUMNS}`,
        makeRunId(this.ctx.id.toString()),
        seq,
        input.requestId,
        input.scope,
        input.allowWeb ? 1 : 0,
        input.now,
        input.now,
        JSON.stringify(input.manifest),
      )
      .one();
    // The history is bounded: older runs go, and with them their requestIds (a repeat that late is new).
    sql.exec('DELETE FROM runs WHERE seq <= ?', seq - RUNS_KEPT);
    // A press on the whole inbox takes your changes and every pile, so it takes the answers that waited too.
    const whole = input.scope === 'all' && input.subject === undefined;
    if (waiting !== undefined && (takesWaiting || (whole && input.answer !== true))) this.takeWaiting(waiting, row.id);
    // Recovery: if nobody has started the run by its stale deadline, the alarm writes the expiry.
    this.arm('run', row.id, input.now + QUEUED_STALE_MS);
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
   * handled, in this order: expired gone rows go, recovery looks at the run (`recover`), and the run the waiting
   * answers asked for starts (`startWaiting`). A handled deadline goes unless its handler set it again; then the
   * alarm is set to the earliest one kept. If a handler throws, what was due and not handled is looked at again
   * `RECHECK_MS` later (an alarm is at-least-once, so its handlers already are), and the error goes on to the runtime.
   * Every request of one alarm counts against one invocation's subrequests (TL-P4-11).
   */
  async wake(now: number, github: GitHubAccess): Promise<void> {
    const sql = this.ctx.storage.sql;
    const due = sql.exec<DeadlineRow>('SELECT kind, key, at FROM deadlines WHERE at <= ?', now).toArray();
    const handled = (kind: DeadlineKind): void => {
      for (const d of due) if (d.kind === kind) sql.exec('DELETE FROM deadlines WHERE kind = ? AND key = ? AND at = ?', d.kind, d.key, d.at);
    };
    const isDue = (kind: DeadlineKind): boolean => due.some((d) => d.kind === kind);
    let fetches = 0;
    const counted: FetchLike = (input, init) => {
      fetches += 1;
      return github.fetchImpl(input, init);
    };
    try {
      if (isDue('gone')) this.pruneGone(now);
      if (isDue('run')) {
        await this.recover(now, { ...github, fetchImpl: counted });
        handled('run');
      }
      if (isDue('answers')) {
        await this.startWaiting(now, counted, () => fetches);
        handled('answers');
      }
    } catch (err) {
      // Never looped at once: what is still due as it was waits a minute.
      for (const d of due) sql.exec('UPDATE deadlines SET at = ? WHERE kind = ? AND key = ? AND at = ?', now + RECHECK_MS, d.kind, d.key, d.at);
      throw err;
    } finally {
      this.rearm();
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
  private async startWaiting(now: number, fetchImpl: FetchLike, spent: () => number): Promise<void> {
    const due = this.ctx.storage.transactionSync((): { waiting: AnswersWaiting; requestId: string } | null => {
      const waiting = this.ctx.storage.kv.get<AnswersWaiting>(ANSWERS_WAITING);
      const current = this.currentRunRow();
      // A run going takes them at its own end.
      if (waiting === undefined || (current !== undefined && ACTIVE_PHASES.includes(current.phase))) return null;
      return { waiting, requestId: `answers-after-${current?.id ?? 'none'}` };
    });
    if (due === null) return;
    const { waiting, requestId } = due;
    const scope: RunScope = waiting.subjects.length > 0 ? 'all' : 'instructions';
    let manifest: AdmissionManifest;
    try {
      manifest = await admission(this.env, this, { scope, subjects: waiting.subjects, now }, fetchImpl, spent);
    } catch (err) {
      console.error('the answers that waited could not start their tidy-up', err);
      const final = err instanceof HttpError && (err.code === 'signed-out' || err.code === 'no-folder' || err.code === 'nothing');
      this.ctx.storage.transactionSync(() => this.waitingFailed(requestId, final, now));
      return;
    }
    const input: AdmitInput = { scope, allowWeb: waiting.allowWeb, requestId, now, dailyLimit: Number(this.env.DAILY_RUN_LIMIT), manifest };
    const result = this.ctx.storage.transactionSync((): AdmitResult => this.admitSync(input, true));
    if (!result.admitted) {
      console.error(`the answers that waited keep waiting: ${result.refused}`);
      return;
    }
    if (result.created === true) await dispatchNew(this.env, this, result.run, waiting.allowWeb, now, fetchImpl);
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

  /**
   * Drops the gone rows (`GONE_TICKETS`) expired at `now`, with their deadlines; the entry goes with the last one.
   * Returns the rows still live.
   */
  private pruneGone(now: number): GoneTicket[] {
    const kv = this.ctx.storage.kv;
    this.disarm('gone', now);
    const kept = kv.get<GoneTicket[]>(GONE_TICKETS);
    if (kept === undefined) return [];
    const live = kept.filter((t) => t.expiresAt > now);
    if (live.length === 0) kv.delete(GONE_TICKETS);
    else if (live.length < kept.length) kv.put(GONE_TICKETS, live);
    return live;
  }

  /**
   * Recovery without the browser (worker contract, "Runner wire"; TL-P3-18; recovery.ts). Two synchronous
   * sections around the GitHub lookup, each deciding with no `await` inside:
   * 1. a run that ended needs no alarm; a run whose deadline moved (a report arrived, or a wait applies)
   *    gets the alarm for it, and nothing changes; a stale run with no token, or past its one wait, is
   *    failed `stale`; any other stale run is looked up;
   * 2. if the run moved during the lookup, only the alarm is set again; else the lookup's outcome: a
   *    redispatch as attempt + 1 with a new ticket (fencing the older one) when attempt 1 has no live job
   *    (none found, or every job completed), a wait until the live job's deadline, or failed `stale`.
   * The redispatch is sent after the second section; if it is lost, the next deadline fails the run.
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
    // A new ticket is hashed before the section, so nothing awaits inside it.
    const ticket = outcome.kind === 'redispatch' ? newTicket() : null;
    const hash = ticket === null ? null : await hashTicket(ticket);
    const send = this.ctx.storage.transactionSync(() => this.applyRecovery(lookup, outcome, hash, now));
    if (send === null || ticket === null) return;
    const sent = await dispatchOutcome(
      { repo: github.repo, token, runId: lookup.run.id, attempt: send.attempt, ticket, scope: lookup.run.scope, allowWeb: send.allowWeb },
      github.fetchImpl,
    );
    if (sent === 'lost') this.dispatchLostSync(lookup.run.id, now + RECHECK_MS);
  }

  /** A dispatch failed after its retries: the alarm looks at the going run `RECHECK_MS` from `now`, not at its stale deadline. */
  async dispatchLost(runId: string, now: number): Promise<void> {
    this.dispatchLostSync(runId, now + RECHECK_MS);
  }

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

  /** Section 2 of `recover`: applies the outcome; the attempt to send when it is a redispatch, else null. */
  private applyRecovery(seen: RecoveryLookup, outcome: Recovery, hash: string | null, now: number): { attempt: number; allowWeb: boolean } | null {
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
      else this.arm('run', run.id, Math.max(staleDeadline(toWire(run), this.attemptOf(run.id), watch), now + RECHECK_MS));
      return null;
    }
    if (outcome.kind === 'fail') {
      this.failStale(run, now);
      return null;
    }
    if (outcome.kind === 'wait') {
      this.watch({ runId: run.id, attempt: seen.attempt, phaseAt: run.phase_at, until: outcome.until, graced: true });
      return null;
    }
    const attempt = seen.attempt + 1;
    if (hash === null || !this.keepTicket(run.id, attempt, hash, now)) {
      this.failStale(run, now);
      return null;
    }
    this.watch({ runId: run.id, attempt, phaseAt: run.phase_at, until: now + QUEUED_STALE_MS, graced: false });
    const allowWeb = this.ctx.storage.sql.exec<{ allow_web: number }>('SELECT allow_web FROM runs WHERE id = ?', run.id).one().allow_web === 1;
    return { attempt, allowWeb };
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

  /**
   * Mints the ticket of `attempt` of the going run `runId` (worker contract, "Runner wire"; TL-P3-18), for
   * `worker-dispatch` to send in the payload. Only its SHA-256 is kept, with the attempt and an expiry at
   * `now` + 60 min; it retires the run's earlier tickets (kept, never deleted), so an older attempt's ticket answers `stale-attempt`. Null,
   * with nothing written, for an attempt not newer than the kept one or a run unknown or ended. The ticket
   * is never logged.
   */
  async mintTicket(runId: string, attempt: number, now: number): Promise<string | null> {
    if (!Number.isSafeInteger(attempt) || attempt < 1) return null;
    const ticket = newTicket();
    // Hashed before the transaction: nothing is read before this await, so no call can slip in between.
    const hash = await hashTicket(ticket);
    return this.ctx.storage.transactionSync((): string | null => (this.keepTicket(runId, attempt, hash, now) ? ticket : null));
  }

  /** `mintTicket`'s synchronous part: keeps `hash` as `attempt`'s ticket, or false with nothing written. */
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
   * after Delete me (no account, for a ticket live then: `GONE_TICKETS`), or once Google access was forgotten
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

  /** Whether `hash` is a ticket that was live at Delete me and has not expired at `now` (`GONE_TICKETS`); expired rows go. */
  private goneTicket(hash: string, now: number): boolean {
    return this.pruneGone(now).some((t) => timingSafeEqual(t.hash, hash));
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
      const shows = report.phase !== run.phase || total !== run.total || failure !== run.failure;
      const row = shows
        ? sql
            .exec<RunRow>(
              `UPDATE runs SET phase = ?1, phase_at = CASE WHEN phase = ?1 THEN phase_at ELSE ?2 END,
                 total = ?3, failure = ?4, finished_at = ?5
               WHERE id = ?6
               RETURNING ${RUN_COLUMNS}`,
              report.phase,
              now,
              total,
              failure,
              ended ? now : null,
              runId,
            )
            .one()
        : run;
      sql.exec('UPDATE run_ticket SET report_seq = ?, report_phase = ?, retired = ? WHERE hash = ?', report.seq, report.phase, ended ? 1 : 0, hash);
      if (ended) this.wakeForWaiting(now);
      return { accepted: true, reply: { run: toWire(row), revision: shows ? this.raiseRevision() : this.revision() } };
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

const RUN_COLUMNS = 'id, seq, scope, phase, requested_at, phase_at, finished_at, total, failure';

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
  return {
    id: row.id,
    scope: row.scope,
    phase: row.phase,
    requestedAt: row.requested_at,
    phaseAt: row.phase_at,
    ...(row.finished_at === null ? {} : { finishedAt: row.finished_at }),
    ...(row.total === null ? {} : { total: row.total }),
    ...(row.failure === null ? {} : { failure: row.failure }),
  };
}
