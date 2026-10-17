import { env as testEnv, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env.js';
import type { Person } from '../src/person.js';
import { SCHEMA_VERSION } from '../src/person-schema.js';
import { QUEUED_STALE_MS, STALE_FAILURE } from '../src/process.js';
import { MANIFEST } from './drive-v3.js';
import { pretendGitHub } from './github-support.js';
import { HOUR, MINUTE, farAhead, inWindow } from './time.js';

const env = testEnv as unknown as Env;

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

interface Row {
  kind: string;
  key: string;
  at: number;
}

async function rowsOf(sub: string): Promise<Row[]> {
  return await runInDurableObject(person(sub), (_i, state) =>
    state.storage.sql.exec<{ kind: string; key: string; at: number }>('SELECT kind, key, at FROM deadlines ORDER BY kind, key').toArray(),
  );
}

const noGitHub = { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN, fetchImpl: () => Promise.reject(new Error('not asked')) };

async function alarmOf(sub: string): Promise<number | null> {
  return await runInDurableObject(person(sub), (_i, state) => state.storage.getAlarm());
}

/** Signed in with a folder, and one queued run admitted at `now` and dispatched by the alarm then (its ticket expires an hour later). */
async function admitted(sub: string, requestId: string, now: number): Promise<string> {
  const p = person(sub);
  const { generation } = await p.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
  await p.pointFolder(generation, null, 'FOLDER_ID');
  const r = await p.admit({ accountEpoch: (await p.account())?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId, now, dailyLimit: 100, manifest: MANIFEST });
  if (!r.admitted) throw new Error('not admitted');
  const gh = pretendGitHub(env);
  try {
    await runInDurableObject(p, async (instance: Person) => {
      await instance.wake(now, gh.access);
    });
  } finally {
    gh.restore();
  }
  return r.run.id;
}

/** Takes back schema step 14 (the run's dispatch deadline and version), for the tests that rewind further. */
function undoV14(sql: SqlStorage): void {
  sql.exec('ALTER TABLE runs DROP COLUMN deadline_at');
  sql.exec('ALTER TABLE runs DROP COLUMN version');
}

describe('worker deadlines (TL-P4-14)', () => {
  it('one deadline table rearms the alarm', async () => {
    const sub = `deadlines-sub-${crypto.randomUUID()}`;
    const p = person(sub);
    const t0 = farAhead();
    // A ticket that lives 10 minutes more: after Delete me its gone row is kept until then.
    await admitted(sub, 'press-1', t0);
    const expiry = t0 + 10 * MINUTE;
    await runInDurableObject(p, (_i, state) => {
      state.storage.sql.exec('UPDATE run_ticket SET expires_at = ?', expiry);
    });
    await p.forget();
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
    expect(await runInDurableObject(p, (_i, state) => state.storage.sql.exec(`SELECT hash FROM run_ticket WHERE run_id = ''`).toArray())).toEqual([]);
    expect(await alarmOf(sub)).toBeNull();
  });

  it('storage from before the deadline table keeps its deadlines', async () => {
    const sub = `deadlines-v11-${crypto.randomUUID()}`;
    const p = person(sub);
    const t0 = farAhead();
    const runId = await admitted(sub, 'press-1', t0);
    // A person object as v11 left it: a run going, a gone row kept, and the alarm somewhere.
    const gone = { hash: 'a'.repeat(64), expiresAt: t0 + 30 * MINUTE, attempt: 1 };
    await runInDurableObject(p, (_i, state) => {
      state.storage.sql.exec('ALTER TABLE runs DROP COLUMN open_questions_snapshot');
      undoV14(state.storage.sql);
      state.storage.sql.exec('DROP TABLE deadlines');
      state.storage.sql.exec('UPDATE schema_version SET version = 11 WHERE id = 1');
      state.storage.kv.put('goneTickets', [gone]);
    });
    await evictDurableObject(p);
    const before = Date.now();
    expect(await p.schemaVersion()).toBe(SCHEMA_VERSION);
    const rows = await runInDurableObject(p, (_i, state) =>
      state.storage.sql.exec<{ kind: string; key: string; at: number }>('SELECT kind, key, at FROM deadlines ORDER BY kind').toArray(),
    );
    // The gone row keeps its expiry; the run is looked at once, and its recovery sets its own deadline again.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ kind: 'gone', key: gone.hash, at: gone.expiresAt });
    expect(rows[1]).toMatchObject({ kind: 'run', key: runId });
    // The migration arms it at once and the object's real alarm may already have set its own deadline: both are correct.
    inWindow(rows[1]?.at, before, t0 + QUEUED_STALE_MS);
    await runInDurableObject(p, async (instance: Person) => {
      await instance.wake(Date.now(), { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN, fetchImpl: () => Promise.reject(new Error('not asked')) });
    });
    expect(await alarmOf(sub)).toBe(t0 + QUEUED_STALE_MS);
    // v14 moves the gone ticket into its table, with no run id, and the key-value entry goes.
    expect(await runInDurableObject(p, (_i, state) => state.storage.sql.exec(`SELECT hash, attempt, expires_at FROM run_ticket WHERE run_id = ''`).toArray())).toEqual([
      { hash: gone.hash, attempt: 1, expires_at: gone.expiresAt },
    ]);
    expect(await runInDurableObject(p, (_i, state) => state.storage.kv.get('goneTickets'))).toBeUndefined();
  });

  it('a v13 object with a run going and a gone ticket moves to v14 with no second dispatch', async () => {
    const sub = `deadlines-v13-${crypto.randomUUID()}`;
    const p = person(sub);
    const t0 = farAhead();
    const runId = await admitted(sub, 'press-1', t0);
    // A person object as v13 left it: the run going, dispatched by the press, and a gone ticket in the key-value entry.
    const gone = { hash: 'b'.repeat(64), expiresAt: t0 + 30 * MINUTE, attempt: 1 };
    await runInDurableObject(p, (_i, state) => {
      state.storage.sql.exec('ALTER TABLE runs DROP COLUMN open_questions_snapshot');
      undoV14(state.storage.sql);
      state.storage.sql.exec('UPDATE schema_version SET version = 13 WHERE id = 1');
      state.storage.sql.exec(`INSERT INTO deadlines (kind, key, at) VALUES ('gone', ?, ?)`, gone.hash, gone.expiresAt);
      state.storage.kv.put('goneTickets', [gone]);
    });
    await evictDurableObject(p);
    expect(await p.schemaVersion()).toBe(SCHEMA_VERSION);
    // The run kept from v13 has no dispatch due: an alarm before its stale deadline sends nothing.
    expect(await runInDurableObject(p, (_i, state) => state.storage.sql.exec('SELECT deadline_at, version FROM runs').toArray())).toEqual([
      { deadline_at: null, version: 0 },
    ]);
    const gh = pretendGitHub(env);
    try {
      await runInDurableObject(p, async (instance: Person) => {
        await instance.wake(t0 + MINUTE, gh.access);
      });
      expect(gh.dispatched.filter((d) => d.run_id === runId)).toEqual([]);
    } finally {
      gh.restore();
    }
    // The gone ticket is a row with no run id, with its expiry deadline; the key-value entry is gone.
    expect(await runInDurableObject(p, (_i, state) => state.storage.sql.exec(`SELECT hash, attempt, expires_at FROM run_ticket WHERE run_id = ''`).toArray())).toEqual([
      { hash: gone.hash, attempt: 1, expires_at: gone.expiresAt },
    ]);
    expect(await runInDurableObject(p, (_i, state) => state.storage.kv.get('goneTickets'))).toBeUndefined();
    expect((await rowsOf(sub)).filter((r) => r.kind === 'gone')).toEqual([{ kind: 'gone', key: gone.hash, at: gone.expiresAt }]);
  });

  it('a handler that always throws stops after 6 attempts and its run ends failed', async () => {
    const sub = `deadlines-throws-${crypto.randomUUID()}`;
    const p = person(sub);
    const t0 = farAhead();
    const runId = await admitted(sub, 'press-1', t0);
    const [row] = await rowsOf(sub);
    if (row === undefined) throw new Error('no deadline');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    try {
      // Cloudflare retries a throwing alarm with exponential backoff from 2 seconds, up to 6 times: so does each deadline.
      let at = row.at;
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        await runInDurableObject(p, async (instance: Person) => {
          vi.spyOn(instance, 'recover').mockImplementation(() => {
            calls += 1;
            return Promise.reject(new Error('recovery broke'));
          });
          await instance.wake(at, noGitHub).catch(() => undefined);
        });
        expect(calls).toBe(attempt);
        if (attempt < 6) {
          const next = at + 2000 * 2 ** (attempt - 1);
          expect(await rowsOf(sub)).toEqual([{ kind: 'run', key: runId, at: next }]);
          expect(await alarmOf(sub)).toBe(next);
          expect((await p.runStatus(at)).run?.phase).toBe('queued');
          at = next;
        }
      }
      // The sixth failure is the last: the run ends failed with its sentence, nothing is left to wake for, and the
      // details are logged.
      const status = await p.runStatus(at);
      expect(status.run?.phase).toBe('failed');
      expect(status.run?.failure).toBe(STALE_FAILURE);
      expect(await rowsOf(sub)).toEqual([]);
      expect(await alarmOf(sub)).toBeNull();
      expect(log.mock.calls.some((c) => String(c[0]).includes('gave up') && c.some((a) => a instanceof Error && a.message === 'recovery broke'))).toBe(true);
    } finally {
      log.mockRestore();
    }
  });

  it('a deadline its handler set again is kept, and only what was due as read goes', async () => {
    const sub = `deadlines-rearmed-${crypto.randomUUID()}`;
    const p = person(sub);
    const t0 = farAhead();
    const runId = await admitted(sub, 'press-1', t0);
    const [row] = await rowsOf(sub);
    if (row === undefined) throw new Error('no deadline');
    // The handler moves the run's deadline while the alarm handles it: compare-and-delete keeps the new one.
    await runInDurableObject(p, async (instance: Person, state) => {
      vi.spyOn(instance, 'recover').mockImplementation(() => {
        state.storage.sql.exec('UPDATE deadlines SET at = ? WHERE kind = ?', row.at + 5000, 'run');
        return Promise.resolve();
      });
      await instance.wake(row.at, noGitHub);
    });
    expect(await rowsOf(sub)).toEqual([{ kind: 'run', key: runId, at: row.at + 5000 }]);
    expect(await alarmOf(sub)).toBe(row.at + 5000);
    // Handled as read, it goes.
    await runInDurableObject(p, async (instance: Person) => {
      vi.spyOn(instance, 'recover').mockResolvedValue(undefined);
      await instance.wake(row.at + 5000, noGitHub);
    });
    expect(await rowsOf(sub)).toEqual([]);
    expect(await alarmOf(sub)).toBeNull();
  });

  it('deadlines kept at schema v12 keep their times and start with no attempts', async () => {
    const sub = `deadlines-v12-${crypto.randomUUID()}`;
    const p = person(sub);
    const runId = await admitted(sub, 'press-1', farAhead());
    const before = await rowsOf(sub);
    await runInDurableObject(p, (_i, state) => {
      state.storage.sql.exec('ALTER TABLE runs DROP COLUMN open_questions_snapshot');
      undoV14(state.storage.sql);
      state.storage.sql.exec('ALTER TABLE deadlines DROP COLUMN attempts');
      state.storage.sql.exec('UPDATE schema_version SET version = 12 WHERE id = 1');
    });
    await evictDurableObject(p);
    expect(await p.schemaVersion()).toBe(SCHEMA_VERSION);
    const after = await runInDurableObject(p, (_i, state) =>
      state.storage.sql.exec<{ kind: string; key: string; at: number; attempts: number }>('SELECT kind, key, at, attempts FROM deadlines').toArray(),
    );
    expect(after).toEqual(before.map((r) => ({ ...r, attempts: 0 })));
    expect(after[0]?.key).toBe(runId);
  });
});
