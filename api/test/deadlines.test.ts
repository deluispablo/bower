import { env as testEnv, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import type { Env } from '../src/env.js';
import type { Person } from '../src/person.js';
import { QUEUED_STALE_MS } from '../src/process.js';
import { MANIFEST } from './drive-v3.js';

const env = testEnv as unknown as Env;
const HOUR = 3600_000;
const MINUTE = 60_000;

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

async function alarmOf(sub: string): Promise<number | null> {
  return await runInDurableObject(person(sub), (_i, state) => state.storage.getAlarm());
}

/** Signed in with a folder, and one queued run admitted at `now`. */
async function admitted(sub: string, requestId: string, now: number): Promise<string> {
  const p = person(sub);
  await p.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
  await p.setFolderId('FOLDER_ID');
  const r = await p.admit({ scope: 'all', allowWeb: false, requestId, now, dailyLimit: 100, manifest: MANIFEST });
  if (!r.admitted) throw new Error('not admitted');
  return r.run.id;
}

describe('worker deadlines (TL-P4-14)', () => {
  it('one deadline table rearms the alarm', async () => {
    const sub = `deadlines-sub-${crypto.randomUUID()}`;
    const p = person(sub);
    const t0 = Date.now();
    // A ticket minted 50 minutes ago lives 10 minutes more: after Delete me its gone row is kept until then.
    const runId = await admitted(sub, 'press-1', t0);
    const minted = t0 - 50 * MINUTE;
    if ((await p.mintTicket(runId, 1, minted)) === null) throw new Error('no ticket');
    await p.forget();
    const expiry = minted + HOUR;
    expect(await alarmOf(sub)).toBe(expiry);

    // Signed in again, a new run is admitted: its stale deadline (17 minutes) is later than the gone row's
    // expiry, and the alarm stays at the earliest of the two.
    await admitted(sub, 'press-2', t0);
    expect(t0 + QUEUED_STALE_MS).toBeGreaterThan(expiry);
    expect(await alarmOf(sub)).toBe(expiry);

    // A poll long past the run's ceiling ends it as stale: the run's deadline goes, the gone row's stays.
    expect((await p.runStatus(t0 + 10 * HOUR)).run?.phase).toBe('failed');
    expect(await alarmOf(sub)).toBe(expiry);

    // The alarm at the expiry prunes the gone row, asks GitHub nothing, and nothing is left to wake for.
    const asked: string[] = [];
    await runInDurableObject(p, async (instance: Person) => {
      await instance.wake(expiry, {
        repo: env.GITHUB_REPO,
        token: env.GITHUB_TOKEN,
        fetchImpl: async (input) => {
          asked.push(input);
          return new Response(null, { status: 503 });
        },
      });
    });
    expect(asked).toEqual([]);
    expect(await runInDurableObject(p, (_i, state) => state.storage.kv.get('goneTickets'))).toBeUndefined();
    expect(await alarmOf(sub)).toBeNull();
  });

  it('storage from before the deadline table keeps its deadlines', async () => {
    const sub = `deadlines-v11-${crypto.randomUUID()}`;
    const p = person(sub);
    const t0 = Date.now() + HOUR;
    const runId = await admitted(sub, 'press-1', t0);
    // A person object as v11 left it: a run going, a gone row kept, and the alarm somewhere.
    const gone = { hash: 'a'.repeat(64), expiresAt: t0 + 30 * MINUTE, attempt: 1 };
    await runInDurableObject(p, (_i, state) => {
      state.storage.sql.exec('DROP TABLE deadlines');
      state.storage.sql.exec('UPDATE schema_version SET version = 11 WHERE id = 1');
      state.storage.kv.put('goneTickets', [gone]);
    });
    await evictDurableObject(p);
    const before = Date.now();
    expect(await p.schemaVersion()).toBe(12);
    const rows = await runInDurableObject(p, (_i, state) =>
      state.storage.sql.exec<{ kind: string; key: string; at: number }>('SELECT kind, key, at FROM deadlines ORDER BY kind').toArray(),
    );
    // The gone row keeps its expiry; the run is looked at once, and its recovery sets its own deadline again.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ kind: 'gone', key: gone.hash, at: gone.expiresAt });
    expect(rows[1]).toMatchObject({ kind: 'run', key: runId });
    expect(rows[1]?.at).toBeGreaterThanOrEqual(before);
    expect(rows[1]?.at).toBeLessThanOrEqual(Date.now());
    await runInDurableObject(p, async (instance: Person) => {
      await instance.wake(Date.now(), { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN, fetchImpl: () => Promise.reject(new Error('not asked')) });
    });
    expect(await alarmOf(sub)).toBe(t0 + QUEUED_STALE_MS);
  });
});
