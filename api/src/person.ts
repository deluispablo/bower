import { DurableObject } from 'cloudflare:workers';

import type { Env } from './env.js';
import { migrate, readSchemaVersion } from './person-schema.js';

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

/** What a sign-in leaves: the generation to sign into the cookie, and whether a refresh token is kept. */
export interface SignInResult {
  generation: number;
  hasRefreshToken: boolean;
}

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
        `INSERT INTO account (id, email, name, enc_refresh_token) VALUES (1, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           enc_refresh_token = COALESCE(excluded.enc_refresh_token, account.enc_refresh_token)
         RETURNING session_generation, enc_refresh_token`,
        input.email,
        input.name,
        input.encRefreshToken,
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

  /** Sets (or with null clears) the folder pointer. False when there is no account. */
  setFolderId(folderId: string | null): boolean {
    return (
      this.ctx.storage.sql.exec('UPDATE account SET folder_id = ? WHERE id = 1', folderId).rowsWritten > 0
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
   * token kept, so the callback asks for consent again.
   */
  forgetGoogleAccess(): void {
    this.ctx.storage.sql.exec(
      `UPDATE account SET enc_refresh_token = NULL, access_token = NULL, access_expires_at = NULL,
         session_generation = session_generation + 1 WHERE id = 1`,
    );
  }
}
