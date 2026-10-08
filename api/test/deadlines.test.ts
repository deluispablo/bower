import { env as testEnv, runInDurableObject } from 'cloudflare:test';
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
    const runId = await admitted(sub, 'press-1', t0 - 50 * MINUTE);
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
});
