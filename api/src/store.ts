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

import type { DriveToken, PushSubscription, Run, User } from './types.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Key layout, documented in `docs/api.md`. The only place prefixes live. */
export const keys = {
  user: (id: string): string => `user:${id}`,
  email: (email: string): string => `email:${normalizeEmail(email)}`,
  allow: (email: string): string => `allow:${normalizeEmail(email)}`,
  run: (id: string): string => `run:${id}`,
  quota: (userId: string, date: string): string => `quota:${userId}:${date}`,
  quotaPrefix: (userId: string): string => `quota:${userId}:`,
  push: (userId: string, subId: string): string => `push:${userId}:${subId}`,
  pushPrefix: (userId: string): string => `push:${userId}:`,
  driveToken: (userId: string): string => `drivetoken:${userId}`,
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
 * Stores `user` and keeps the `email:<email>` → id index in sync with its
 * (normalized) `email` field.
 */
export async function putUser(kv: KVNamespace, user: User): Promise<void> {
  await Promise.all([
    putJson(kv, keys.user(user.id), user),
    kv.put(keys.email(user.email), user.id),
  ]);
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

export async function getRun(
  kv: KVNamespace,
  id: string,
): Promise<Run | undefined> {
  return getJson<Run>(kv, keys.run(id));
}

export async function putRun(
  kv: KVNamespace,
  id: string,
  run: Run,
): Promise<void> {
  await putJson(kv, keys.run(id), run);
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

/**
 * Deletes every key belonging to `userId`: `user:`, its `email:` index
 * (looked up from the user record before deleting it), `run:`, every
 * `quota:<id>:*`, every `push:<id>:*` and `drivetoken:<id>`. Never touches
 * `allow:<email>` — the allowlist is the operator's, not the user's.
 */
export async function deleteUserData(
  kv: KVNamespace,
  userId: string,
): Promise<void> {
  const user = await getUser(kv, userId);
  const deletions: Promise<void>[] = [
    kv.delete(keys.user(userId)),
    kv.delete(keys.run(userId)),
    kv.delete(keys.driveToken(userId)),
    deleteByPrefix(kv, keys.quotaPrefix(userId)),
    deleteByPrefix(kv, keys.pushPrefix(userId)),
  ];
  if (user !== undefined) {
    deletions.push(kv.delete(keys.email(user.email)));
  }
  await Promise.all(deletions);
}
