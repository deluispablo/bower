/**
 * All KV access goes through this module. See `docs/api.md` for the data
 * model this implements. Every function takes the `BOWER_KV` namespace as
 * its first argument (this module holds no state of its own).
 *
 * Values are stored with `kv.put(key, JSON.stringify(value))` and read
 * back with `kv.get(key, 'json')`. KV holds only what this module writes,
 * so reads are trusted and cast to their type with a typed generic
 * (`getJson<T>`) rather than validated at runtime — there is no untrusted
 * input crossing this boundary.
 */

import type {
  DriveToken,
  PushSubscription,
  Run,
  RunKind,
  RunTicket,
  User,
} from './types.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Key layout, documented in `docs/api.md`. The only place prefixes live. */
export const keys = {
  userPrefix: (): string => 'user:',
  user: (id: string): string => `user:${id}`,
  email: (email: string): string => `email:${normalizeEmail(email)}`,
  allow: (email: string): string => `allow:${normalizeEmail(email)}`,
  run: (id: string): string => `run:${id}`,
  lintRun: (id: string): string => `lintrun:${id}`,
  runTicket: (id: string): string => `runticket:${id}`,
  lintTicket: (id: string): string => `lintticket:${id}`,
  quota: (userId: string, date: string): string => `quota:${userId}:${date}`,
  quotaPrefix: (userId: string): string => `quota:${userId}:`,
  push: (userId: string, subId: string): string => `push:${userId}:${subId}`,
  pushPrefix: (userId: string): string => `push:${userId}:`,
  driveToken: (userId: string): string => `drivetoken:${userId}`,
  sessionGen: (userId: string): string => `sessiongen:${userId}`,
  deleted: (userId: string): string => `deleted:${userId}`,
};

/** Daily quota counters live for 48 h, one day longer than they matter for. */
const QUOTA_TTL_SECONDS = 48 * 60 * 60;

async function getJson<T>(
  kv: KVNamespace,
  key: string,
): Promise<T | undefined> {
  const value = await kv.get<T>(key, 'json');
  return value ?? undefined;
}

async function putJson(
  kv: KVNamespace,
  key: string,
  value: unknown,
  options?: KVNamespacePutOptions,
): Promise<void> {
  await kv.put(key, JSON.stringify(value), options);
}

/** Deletes every key under `prefix`, paging through `kv.list` as needed. */
async function deleteByPrefix(kv: KVNamespace, prefix: string): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const listed = await kv.list({ prefix, cursor });
    await Promise.all(listed.keys.map((entry) => kv.delete(entry.name)));
    if (listed.list_complete) return;
    cursor = listed.cursor;
  }
}

export async function getUser(
  kv: KVNamespace,
  id: string,
): Promise<User | undefined> {
  return getJson<User>(kv, keys.user(id));
}

/**
 * Creates the record for a new user and its `email:<email>` → id index.
 * Only for a record that does not exist yet (sign-in): every later change
 * goes through `updateUser`, which never writes back fields it was not
 * asked to change.
 */
export async function putUser(kv: KVNamespace, user: User): Promise<void> {
  await Promise.all([
    putJson(kv, keys.user(user.id), user),
    kv.put(keys.email(user.email), user.id),
  ]);
}

/**
 * The fields of a `User` a route may change after sign-up. `null` removes
 * an optional field; a missing (or `undefined`) field is left as stored.
 * `id`, `email` and `createdAt` never change, and revocation state lives
 * in its own keys (`sessiongen:`, `deleted:`), not here.
 */
export interface UserPatch {
  vault?: NonNullable<User['vault']>;
  encRefreshToken?: string;
  encApiKey?: string | null;
  needsReauth?: true | null;
  tourSeenAt?: string | null;
  givenName?: string | null;
}

/**
 * Changes only the fields in `patch`: re-reads the record just before
 * writing and merges the patch into that copy, instead of writing back a
 * whole record the caller read earlier. KV has no field-level writes, so
 * two writers racing on the same field still resolve last-write-wins, but
 * a writer can no longer undo a change to a field it did not touch.
 *
 * Returns the merged record, or `undefined` (and writes nothing) when the
 * user no longer exists or carries a deletion tombstone, so a request that
 * raced an account deletion cannot re-create the record.
 */
export async function updateUser(
  kv: KVNamespace,
  id: string,
  patch: UserPatch,
): Promise<User | undefined> {
  const [current, deleted] = await Promise.all([
    getUser(kv, id),
    isDeleted(kv, id),
  ]);
  if (current === undefined || deleted) return undefined;
  const merged: Record<string, unknown> = { ...current };
  for (const [field, value] of Object.entries(patch)) {
    if (value === null) delete merged[field];
    else if (value !== undefined) merged[field] = value;
  }
  const next = merged as unknown as User;
  await putJson(kv, keys.user(id), next);
  return next;
}

/**
 * The user's session generation from `sessiongen:<id>`, written only by
 * "Sign out everywhere"; 0 when the key is missing. Sessions signed with a
 * lower generation are rejected.
 */
export async function getSessionGeneration(
  kv: KVNamespace,
  userId: string,
): Promise<number> {
  const value = await kv.get(keys.sessionGen(userId), 'text');
  if (value === null) return 0;
  const generation = Number(value);
  return Number.isSafeInteger(generation) && generation > 0 ? generation : 0;
}

/** Stores `generation` in `sessiongen:<id>`. Only "Sign out everywhere" calls this. */
export async function putSessionGeneration(
  kv: KVNamespace,
  userId: string,
  generation: number,
): Promise<void> {
  await kv.put(keys.sessionGen(userId), String(generation));
}

/**
 * Whether `userId` was deleted (`DELETE /me` or an operator removal). The
 * `deleted:<id>` tombstone is kept for good: ids are never reused, and a
 * record a stale write re-created after the deletion must stay dead.
 */
export async function isDeleted(
  kv: KVNamespace,
  userId: string,
): Promise<boolean> {
  return (await kv.get(keys.deleted(userId), 'text')) !== null;
}

export async function findUserByEmail(
  kv: KVNamespace,
  email: string,
): Promise<User | undefined> {
  const id = await kv.get(keys.email(email));
  if (id === null) return undefined;
  return getUser(kv, id);
}

/** Whether `email` (case-insensitive) is on the operator's allowlist. */
export async function isAllowed(
  kv: KVNamespace,
  email: string,
): Promise<boolean> {
  const value = await kv.get(keys.allow(email));
  return value === '1';
}

/** Adds `email` (case-insensitive) to the operator's allowlist. */
export async function allow(kv: KVNamespace, email: string): Promise<void> {
  await kv.put(keys.allow(email), '1');
}

/** Removes `email` (case-insensitive) from the operator's allowlist. */
export async function disallow(kv: KVNamespace, email: string): Promise<void> {
  await kv.delete(keys.allow(email));
}

/** The subset of a `User` the admin listing exposes; never a token. */
export interface UserSummary {
  id: string;
  email: string;
  hasVault: boolean;
  createdAt: string;
}

/**
 * Every user, for the admin listing. Never includes a token. A record a
 * stale write re-created after its deletion (see `isDeleted`) is left out.
 */
export async function listUsers(kv: KVNamespace): Promise<UserSummary[]> {
  const prefix = keys.userPrefix();
  const users: UserSummary[] = [];
  let cursor: string | undefined;
  for (;;) {
    const listed = await kv.list({ prefix, cursor });
    for (const entry of listed.keys) {
      const user = await getJson<User>(kv, entry.name);
      if (user !== undefined && !(await isDeleted(kv, user.id))) {
        users.push({
          id: user.id,
          email: user.email,
          hasVault: user.vault !== undefined,
          createdAt: user.createdAt,
        });
      }
    }
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
  return users;
}

/**
 * The id of every user who has a vault, for the runner's scheduled runs.
 * Pages through `user:` keys with `kv.list`; returns ids only, never an
 * email or a token. Deleted users (tombstoned) are left out.
 */
export async function listVaultIds(kv: KVNamespace): Promise<string[]> {
  const prefix = keys.userPrefix();
  const ids: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const listed = await kv.list({ prefix, cursor });
    for (const entry of listed.keys) {
      const user = await getJson<User>(kv, entry.name);
      if (user?.vault !== undefined && !(await isDeleted(kv, user.id))) {
        ids.push(user.id);
      }
    }
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
  return ids;
}

/** The key a run of `kind` lives under: `run:<id>` or `lintrun:<id>`. */
function runKey(id: string, kind: RunKind): string {
  return kind === 'lint' ? keys.lintRun(id) : keys.run(id);
}

/**
 * The user's latest run of `kind`. `ingest` (the default) is the run the
 * app shows and `POST /process` checks; `lint` is the scheduled health
 * check, kept apart so it never blocks or shows up as an ingest.
 */
export async function getRun(
  kv: KVNamespace,
  id: string,
  kind: RunKind = 'ingest',
): Promise<Run | undefined> {
  return getJson<Run>(kv, runKey(id, kind));
}

export async function putRun(
  kv: KVNamespace,
  id: string,
  run: Run,
  kind: RunKind = 'ingest',
): Promise<void> {
  await putJson(kv, runKey(id, kind), run);
}

/** The key a run ticket of `kind` lives under: `runticket:<id>` or `lintticket:<id>`. */
function ticketKey(id: string, kind: RunKind): string {
  return kind === 'lint' ? keys.lintTicket(id) : keys.runTicket(id);
}

/**
 * Stores the hash of the ticket for the user's current run of `kind`,
 * replacing any earlier one (so a new run's ticket retires the old run's).
 * KV drops it after `ttlSeconds` (at least 60, KV's minimum); `expiresAt`
 * inside it is what the check reads, so it holds even before KV's own
 * expiry runs.
 */
export async function putRunTicket(
  kv: KVNamespace,
  id: string,
  kind: RunKind,
  ticket: RunTicket,
  ttlSeconds: number,
): Promise<void> {
  await putJson(kv, ticketKey(id, kind), ticket, {
    expirationTtl: Math.max(60, ttlSeconds),
  });
}

export async function getRunTicket(
  kv: KVNamespace,
  id: string,
  kind: RunKind,
): Promise<RunTicket | undefined> {
  return getJson<RunTicket>(kv, ticketKey(id, kind));
}

/** Retires the user's run ticket of `kind`, if any. */
export async function deleteRunTicket(
  kv: KVNamespace,
  id: string,
  kind: RunKind,
): Promise<void> {
  await kv.delete(ticketKey(id, kind));
}

/**
 * Increments today's (or `date`'s) request count for `userId` and returns
 * the new value. KV has no atomic increment, so this is a read-then-write:
 * two requests racing on the same user and date can both read the same
 * count and both write back the same increment, undercounting by one.
 * Acceptable here — this is a soft per-user daily limit, not a billing
 * figure.
 */
export async function incrQuota(
  kv: KVNamespace,
  userId: string,
  date: string,
): Promise<number> {
  const key = keys.quota(userId, date);
  const current = await kv.get(key, 'text');
  const next = (current === null ? 0 : Number(current)) + 1;
  await kv.put(key, String(next), { expirationTtl: QUOTA_TTL_SECONDS });
  return next;
}

/** Reads `date`'s request count for `userId` without changing it; 0 if none. */
export async function getQuota(
  kv: KVNamespace,
  userId: string,
  date: string,
): Promise<number> {
  const current = await kv.get(keys.quota(userId, date), 'text');
  return current === null ? 0 : Number(current);
}

export async function listPushSubs(
  kv: KVNamespace,
  userId: string,
): Promise<PushSubscription[]> {
  const prefix = keys.pushPrefix(userId);
  const subs: PushSubscription[] = [];
  let cursor: string | undefined;
  for (;;) {
    const listed = await kv.list({ prefix, cursor });
    for (const entry of listed.keys) {
      const sub = await getJson<PushSubscription>(kv, entry.name);
      if (sub !== undefined) subs.push(sub);
    }
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
  return subs;
}

export async function putPushSub(
  kv: KVNamespace,
  userId: string,
  sub: PushSubscription,
): Promise<void> {
  await putJson(kv, keys.push(userId, sub.id), sub);
}

export async function deletePushSub(
  kv: KVNamespace,
  userId: string,
  subId: string,
): Promise<void> {
  await kv.delete(keys.push(userId, subId));
}

/**
 * Caches a Drive access token (with its expiry) for `userId`. `ttlSeconds`
 * is the caller's to set (the token's own remaining lifetime), not a fixed
 * constant here.
 */
export async function putDriveToken(
  kv: KVNamespace,
  userId: string,
  token: DriveToken,
  ttlSeconds: number,
): Promise<void> {
  await putJson(kv, keys.driveToken(userId), token, {
    expirationTtl: ttlSeconds,
  });
}

export async function getDriveToken(
  kv: KVNamespace,
  userId: string,
): Promise<DriveToken | undefined> {
  return getJson<DriveToken>(kv, keys.driveToken(userId));
}

/** Drops the cached Drive access token for `userId`, if any. */
export async function deleteDriveToken(
  kv: KVNamespace,
  userId: string,
): Promise<void> {
  await kv.delete(keys.driveToken(userId));
}

/**
 * Deletes every key belonging to `userId`: `user:`, its `email:` index
 * (looked up from the user record before deleting it), `run:`, `lintrun:`,
 * `runticket:`, `lintticket:`, every `quota:<id>:*`, every `push:<id>:*`, `drivetoken:<id>` and
 * `sessiongen:<id>`. Never touches `allow:<email>` — the allowlist is the
 * operator's, not the user's.
 *
 * Writes the `deleted:<id>` tombstone first and keeps it: a request that
 * read the record before the deletion and writes it back afterwards cannot
 * bring the account (or its sessions) back.
 */
export async function deleteUserData(
  kv: KVNamespace,
  userId: string,
): Promise<void> {
  await kv.put(keys.deleted(userId), '1');
  const user = await getUser(kv, userId);
  const deletions: Promise<void>[] = [
    kv.delete(keys.user(userId)),
    kv.delete(keys.run(userId)),
    kv.delete(keys.lintRun(userId)),
    kv.delete(keys.runTicket(userId)),
    kv.delete(keys.lintTicket(userId)),
    kv.delete(keys.driveToken(userId)),
    kv.delete(keys.sessionGen(userId)),
    deleteByPrefix(kv, keys.quotaPrefix(userId)),
    deleteByPrefix(kv, keys.pushPrefix(userId)),
  ];
  if (user !== undefined) {
    deletions.push(kv.delete(keys.email(user.email)));
  }
  await Promise.all(deletions);
}
