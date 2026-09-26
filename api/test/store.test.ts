import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  deleteUserData,
  deletePushSub,
  findUserByEmail,
  getRun,
  getUser,
  incrQuota,
  isAllowed,
  keys,
  listPushSubs,
  putDriveToken,
  putPushSub,
  putRun,
  putUser,
} from '../src/store.js';
import type { PushSubscription, Run, User } from '../src/types.js';

/**
 * `Cloudflare.Env` is empty in this repo (no `wrangler types` has been run),
 * so the `BOWER_KV` binding `wrangler.toml` declares is not reflected in
 * its type even though the workers pool provides it at runtime. Asserted
 * once here rather than adding a global type declaration this module does
 * not own.
 */
const kv = (env as unknown as { BOWER_KV: KVNamespace }).BOWER_KV;

/** A `User` fixture; every field but `id` and `email` is fixed test data. */
function testUser(id: string, email: string): User {
  return {
    id,
    email,
    createdAt: '2026-01-01T00:00:00.000Z',
    encRefreshToken: 'v1.test-iv.test-ciphertext',
  };
}

function testRun(): Run {
  return { state: 'queued', requestedAt: '2026-01-01T00:00:00.000Z' };
}

function testPushSub(id: string): PushSubscription {
  return {
    id,
    endpoint: 'https://push.example.test/endpoint',
    keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

// The workers pool isolates storage per test by default; this clears the
// keys each test below touches so the suite still passes if that changes.
beforeEach(async () => {
  const prefixes = [
    'user:',
    'email:',
    'allow:',
    'run:',
    'quota:',
    'push:',
    'drivetoken:',
  ];
  await Promise.all(
    prefixes.map(async (prefix) => {
      const listed = await kv.list({ prefix });
      await Promise.all(listed.keys.map((entry) => kv.delete(entry.name)));
    }),
  );
});

describe('users', () => {
  it('puts and gets a user by id', async () => {
    const user = testUser('user-1', 'person@example.test');
    await putUser(kv, user);

    expect(await getUser(kv, 'user-1')).toEqual(user);
  });

  it('returns undefined for a user id that does not exist', async () => {
    expect(await getUser(kv, 'missing-user')).toBeUndefined();
  });

  it('finds a user by email regardless of case or surrounding space', async () => {
    const user = testUser('user-2', 'Person.Two@Example.Test');
    await putUser(kv, user);

    expect(await findUserByEmail(kv, 'person.two@example.test')).toEqual(user);
    expect(await findUserByEmail(kv, '  PERSON.TWO@EXAMPLE.TEST  ')).toEqual(
      user,
    );
  });

  it('returns undefined for an email with no user', async () => {
    expect(await findUserByEmail(kv, 'nobody@example.test')).toBeUndefined();
  });
});

describe('isAllowed', () => {
  it('is true once the operator has allowlisted the email', async () => {
    await kv.put(keys.allow('allowed@example.test'), '1');

    expect(await isAllowed(kv, 'allowed@example.test')).toBe(true);
    expect(await isAllowed(kv, 'ALLOWED@example.test')).toBe(true);
  });

  it('is false for an email that was never allowlisted', async () => {
    expect(await isAllowed(kv, 'stranger@example.test')).toBe(false);
  });
});

describe('runs', () => {
  it('puts and gets a run by id', async () => {
    const run = testRun();
    await putRun(kv, 'run-1', run);

    expect(await getRun(kv, 'run-1')).toEqual(run);
  });

  it('returns undefined for a run id that does not exist', async () => {
    expect(await getRun(kv, 'missing-run')).toBeUndefined();
  });
});

describe('incrQuota', () => {
  it('increments across calls for the same user and date', async () => {
    expect(await incrQuota(kv, 'user-3', '2026-01-01')).toBe(1);
    expect(await incrQuota(kv, 'user-3', '2026-01-01')).toBe(2);
    expect(await incrQuota(kv, 'user-3', '2026-01-01')).toBe(3);
  });

  it('keeps different dates independent', async () => {
    await incrQuota(kv, 'user-4', '2026-01-01');
    await incrQuota(kv, 'user-4', '2026-01-01');

    expect(await incrQuota(kv, 'user-4', '2026-01-02')).toBe(1);
    expect(await incrQuota(kv, 'user-4', '2026-01-01')).toBe(3);
  });
});

describe('push subscriptions', () => {
  it('lists what was put and not what was deleted', async () => {
    const first = testPushSub('sub-1');
    const second = testPushSub('sub-2');
    await putPushSub(kv, 'user-5', first);
    await putPushSub(kv, 'user-5', second);

    expect(await listPushSubs(kv, 'user-5')).toEqual(
      expect.arrayContaining([first, second]),
    );

    await deletePushSub(kv, 'user-5', 'sub-1');

    expect(await listPushSubs(kv, 'user-5')).toEqual([second]);
  });

  it('does not mix subscriptions between users', async () => {
    await putPushSub(kv, 'user-6', testPushSub('sub-a'));
    await putPushSub(kv, 'user-7', testPushSub('sub-b'));

    expect(await listPushSubs(kv, 'user-6')).toHaveLength(1);
    expect(await listPushSubs(kv, 'user-7')).toHaveLength(1);
  });
});

describe('deleteUserData', () => {
  it('removes every key of the user but leaves the allowlist entry', async () => {
    const user = testUser('user-8', 'leaving@example.test');
    await putUser(kv, user);
    await putRun(kv, 'user-8', testRun());
    await incrQuota(kv, 'user-8', '2026-01-01');
    await incrQuota(kv, 'user-8', '2026-01-02');
    await putPushSub(kv, 'user-8', testPushSub('sub-1'));
    await putPushSub(kv, 'user-8', testPushSub('sub-2'));
    await putDriveToken(
      kv,
      'user-8',
      {
        accessToken: 'test-access-token',
        expiresAt: '2026-01-01T01:00:00.000Z',
      },
      3600,
    );
    await kv.put(keys.allow('leaving@example.test'), '1');

    await deleteUserData(kv, 'user-8');

    const prefixesThatMustBeEmpty = [
      keys.user('user-8'),
      keys.email('leaving@example.test'),
      keys.run('user-8'),
      keys.quotaPrefix('user-8'),
      keys.pushPrefix('user-8'),
      keys.driveToken('user-8'),
    ];
    for (const prefix of prefixesThatMustBeEmpty) {
      const listed = await kv.list({ prefix });
      expect(listed.keys).toEqual([]);
    }

    expect(await isAllowed(kv, 'leaving@example.test')).toBe(true);
  });

  it('is safe to call for a user id that was never stored', async () => {
    await expect(deleteUserData(kv, 'never-existed')).resolves.toBeUndefined();
  });
});
