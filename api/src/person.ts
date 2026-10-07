import { DurableObject } from 'cloudflare:workers';

import type { Env } from './env.js';
import { migrate, readSchemaVersion } from './person-schema.js';
import { LEASE_TTL_MS } from './session-lease.js';
import type { LeaseReply, SessionAction } from './session-lease.js';

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
 * One person's Durable Object, addressed by `idFromName(sub)` (TL-P2-05:
 * people are keyed by their OIDC sub). It holds that person's session
 * lease, run admission, quota, control row and run tickets in its own
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
        ctx.storage.transactionSync(() => migrate(ctx.storage.sql));
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
   * keeps the token already kept). The generation is left as it is, so a
   * sign-in never revives a retired cookie.
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
    // cookie signed before the deletion stays refused after the person signs in again.
    const kv = this.ctx.storage.kv;
    const now = this.account()?.generation;
    const floor = Math.max(kv.get<number>(GENERATION_FLOOR) ?? 0, now === undefined ? 0 : now + 1);
    await this.ctx.storage.deleteAll();
    kv.put(GENERATION_FLOOR, floor);
    this.ctx.storage.transactionSync(() => migrate(this.ctx.storage.sql));
  }

  /** The person's current run, or null before runs exist. */
  currentRun(): null {
    return null;
  }
}
