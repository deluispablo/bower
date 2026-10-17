import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import type { RunPhase } from '../../src/data/contracts/run-phases.js';
import type { RunReply } from '../src/process.js';
import type { Person } from '../src/person.js';
import { hashTicket } from '../src/run-ticket.js';
import { MANIFEST } from './drive-v3.js';
import { dispatchOf, pretendGitHubForFile } from './github-support.js';
import { SEQUENCES } from '../../src/data/fake/ordered-reports.fixture';

const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const API = 'https://api.example.com';
const HOUR = 3600_000;

beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

/** The GitHub every alarm of this file reaches: runs are admitted at the wall clock, and the runtime fires the alarm. */
const gh = pretendGitHubForFile(env);

interface Report {
  attempt: number;
  seq: number;
  phase: RunPhase;
  total?: number;
  failure?: string;
}

/** A pretend GitHub Actions runner: it holds only the run id and its ticket, never a cookie. */
class FakeRunner {
  constructor(
    readonly runId: string,
    public ticket: string,
  ) {}

  async token(ticket: string | null = this.ticket): Promise<Response> {
    const headers: Record<string, string> = ticket === null ? {} : { authorization: `Bearer ${ticket}` };
    return await createApp().request(`${API}/runner/runs/${this.runId}/token`, { headers }, env);
  }

  async report(body: Report | string, ticket: string | null = this.ticket): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json', origin: 'https://elsewhere.example.com' };
    if (ticket !== null) headers.authorization = `Bearer ${ticket}`;
    return await createApp().request(
      `${API}/runner/runs/${this.runId}/status`,
      { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) },
      env,
    );
  }
}

/**
 * A signed-in person with a folder and a cached Drive token, one queued run (its id carries the person object's id),
 * and a runner holding attempt 1's ticket, as the alarm dispatched it; it expires at `expiresAt` when given.
 */
async function aRun(expiresAt?: number): Promise<{ sub: string; runner: FakeRunner }> {
  const sub = `runner-sub-${crypto.randomUUID()}`;
  const p = person(sub);
  const { generation } = await p.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
  await p.pointFolder(generation, null, 'FOLDER_ID');
  await p.cacheDriveToken({ accessToken: 'access-cached', expiresAt: Date.now() + HOUR });
  const admitted = await p.admit({ accountEpoch: (await p.account())?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId: 'press-1', now: Date.now(), dailyLimit: 100, manifest: MANIFEST });
  if (!admitted.admitted) throw new Error('not admitted');
  const { ticket } = await dispatchOf(gh, admitted.run.id);
  if (expiresAt !== undefined) {
    await runInDurableObject(p, (_instance, state) => {
      state.storage.sql.exec('UPDATE run_ticket SET expires_at = ?', expiresAt);
    });
  }
  return { sub, runner: new FakeRunner(admitted.run.id, ticket) };
}

/**
 * Attempt 2 takes over: recovery finds attempt 1's run past its deadline with no job on GitHub, and the alarm
 * redispatches it with a new ticket (the only way a ticket is minted).
 */
async function takeOver(sub: string, runId: string): Promise<string> {
  await runInDurableObject(person(sub), async (instance: Person) => {
    await instance.recover(Date.now() + 2 * HOUR, gh.access);
  });
  return (await dispatchOf(gh, runId, 2)).ticket;
}

async function code(r: Response): Promise<string> {
  return ((await r.json()) as { error: { code: string } }).error.code;
}

async function reply(r: Response): Promise<RunReply> {
  expect(r.status).toBe(200);
  return (await r.json()) as RunReply;
}

describe('runner wire', () => {
  it('a runner ticket gets the folder and a Drive token', async () => {
    const { sub, runner } = await aRun();
    expect(runner.runId).toMatch(/^[0-9a-f]{64}-[A-Za-z0-9_-]+$/);
    expect(runner.runId.startsWith(`${env.PERSON.idFromName(sub).toString()}-`)).toBe(true);
    expect(runner.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const r = await runner.token();
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ accessToken: 'access-cached', folderId: 'FOLDER_ID', attempt: 1 });
    expect(typeof body.expiresAt).toBe('number');
    // Only the ticket's SHA-256 is kept, never the ticket.
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(runner.ticket)));
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
    const rows = await runInDurableObject(person(sub), (_instance, state) =>
      state.storage.sql.exec<Record<string, SqlStorageValue>>('SELECT * FROM run_ticket').toArray(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hash: hex, run_id: runner.runId, attempt: 1, retired: 0 });
    expect(JSON.stringify(rows)).not.toContain(runner.ticket);
  });

  it('the token request that finds access revoked or unreadable answers gone', async () => {
    // Unreadable: no cached Drive token, and the kept refresh token cannot be read (TOKEN_ENC_KEY rotated).
    const unreadable = await aRun();
    const p = person(unreadable.sub);
    const oldKey = await importEncryptionKey(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));
    await p.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: await encrypt('test-refresh-token', oldKey) });
    await p.cacheDriveToken({ accessToken: 'access-old', expiresAt: Date.now() - HOUR });
    const before = (await p.account())?.generation ?? -1;
    const r = await unreadable.runner.token();
    expect(r.status).toBe(410);
    expect(await code(r)).toBe('gone');
    // Access is forgotten and the sessions retired, as for the app's own token route.
    expect((await p.account())?.generation).toBe(before + 1);
    expect(await p.encryptedRefreshToken()).toBeNull();

    // Revoked: Google refuses the kept refresh token (`invalid_grant`).
    const revoked = await aRun();
    const q = person(revoked.sub);
    await q.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY)) });
    await q.cacheDriveToken({ accessToken: 'access-old', expiresAt: Date.now() - HOUR });
    const fetchImpl: typeof fetch = async () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    const t = await createApp({ fetchImpl }).request(`${API}/runner/runs/${revoked.runner.runId}/token`, { headers: { authorization: `Bearer ${revoked.runner.ticket}` } }, env);
    expect(t.status).toBe(410);
    expect(await code(t)).toBe('gone');
    expect(await q.encryptedRefreshToken()).toBeNull();
  });

  it('a wrong ticket after delete me still gets 401', async () => {
    const { sub, runner } = await aRun();
    await person(sub).forget();
    for (const ticket of [null, 'not-the-ticket', 'A'.repeat(43)]) {
      const t = await runner.token(ticket);
      expect(t.status, String(ticket)).toBe(401);
      expect(await code(t)).toBe('signed-out');
      const headers: Record<string, string> = ticket === null ? {} : { authorization: `Bearer ${ticket}` };
      const a = await createApp().request(`${API}/runner/runs/${runner.runId}/attempt`, { headers }, env);
      expect(a.status, String(ticket)).toBe(401);
    }
    // The run's own ticket is still told the person is gone.
    expect((await runner.token()).status).toBe(410);
  });

  it('after delete me a valid ticket gets gone and a wrong one 401', async () => {
    const { sub, runner } = await aRun();
    await person(sub).forget();
    const gone = await runner.token();
    expect(gone.status).toBe(410);
    expect(await code(gone)).toBe('gone');
    for (const ticket of [null, 'not-the-ticket', 'A'.repeat(43)]) {
      const t = await runner.token(ticket);
      expect(t.status, String(ticket)).toBe(401);
      expect(await code(t)).toBe('signed-out');
    }
  });

  it('after the last ticket expires no gone row is kept', async () => {
    // A ticket that lives about 3 s more.
    const { sub, runner } = await aRun(Date.now() + 3000);
    const p = person(sub);
    await p.forget();
    const kept = (): Promise<unknown> => runInDurableObject(p, (_i, state) => state.storage.sql.exec('SELECT hash FROM run_ticket').toArray()[0]);
    expect(await kept()).toBeDefined();
    // The alarm is set at the earliest expiry.
    const alarm = await runInDurableObject(p, (_i, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
    // The alarm does its work at the expiry and prunes: no access in between. Its handler is run at that moment
    // (a time 3.2 s on), since waiting out the real clock only tests the runtime's alarm clock, not Bower.
    await runInDurableObject(p, async (instance: Person) => {
      await instance.wake(Date.now() + 3200, { repo: 'owner/repo', apiOrigin: 'https://api.example.com', token: undefined, fetchImpl: () => Promise.reject(new Error('no network in this test')) });
    });
    expect(await kept()).toBeUndefined();
    expect((await runner.token()).status).toBe(401);

    // The next access prunes too, with no alarm run.
    const next = await aRun(Date.now() + 3000);
    const q = person(next.sub);
    await q.forget();
    // 3.2 s on: the clock is faked for Date only, so nothing waits.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 3200);
      expect((await next.runner.token()).status).toBe(401);
    } finally {
      vi.useRealTimers();
    }
    expect(await runInDurableObject(q, (_i, state) => state.storage.sql.exec('SELECT hash FROM run_ticket').toArray())).toEqual([]);
  }, 20_000);

  it('a gone row holds only the hash, expiry and attempt', async () => {
    const { sub, runner } = await aRun();
    const p = person(sub);
    await p.forget();
    const rows = await runInDurableObject(p, (_i, state) => state.storage.sql.exec('SELECT * FROM run_ticket').toArray());
    expect(rows).toEqual([{ hash: await hashTicket(runner.ticket), run_id: '', attempt: 1, retired: 1, expires_at: expect.any(Number), report_seq: null, report_phase: null }]);
    const all = await runInDurableObject(p, (_i, state) =>
      [JSON.stringify(state.storage.sql.exec('SELECT * FROM run_ticket').toArray()), ...Array.from(state.storage.kv.list(), ([k, v]) => `${k}=${JSON.stringify(v)}`)].join('\n'),
    );
    for (const secret of [runner.runId, runner.ticket, 'FOLDER_ID', 'Alex', 'you@example.com']) expect(all).not.toContain(secret);
  });

  it('a wrong or expired ticket is signed out', async () => {
    const { runner } = await aRun();
    const other = await aRun();
    const expired = await aRun(Date.now() - 61 * 60_000);
    const report: Report = { attempt: 1, seq: 1, phase: 'reading' };
    const refused: [FakeRunner, string | null][] = [
      [runner, null],
      [runner, ''],
      [runner, 'not-the-ticket'],
      [runner, other.runner.ticket],
      [expired.runner, expired.runner.ticket],
      [new FakeRunner('not-a-run-id', runner.ticket), runner.ticket],
      [new FakeRunner(`${'0'.repeat(64)}-x`, runner.ticket), runner.ticket],
      [new FakeRunner(`${runner.runId.slice(0, 65)}other`, runner.ticket), runner.ticket],
    ];
    for (const [who, ticket] of refused) {
      const t = await who.token(ticket);
      expect(t.status, `${who.runId} ${ticket}`).toBe(401);
      expect(await code(t)).toBe('signed-out');
      const s = await who.report(report, ticket);
      expect(s.status, `${who.runId} ${ticket}`).toBe(401);
      expect(await code(s)).toBe('signed-out');
    }
    // Another scheme carrying the right ticket is not a bearer ticket.
    const basic = await createApp().request(
      `${API}/runner/runs/${runner.runId}/token`,
      { headers: { authorization: `Basic ${runner.ticket}` } },
      env,
    );
    expect(basic.status).toBe(401);
    // The right ticket still works.
    expect((await runner.token()).status).toBe(200);
  });

  it('a new attempt fences the old one', async () => {
    const { sub, runner } = await aRun();
    const first = runner.ticket;
    await reply(await runner.report({ attempt: 1, seq: 5, phase: 'reading', total: 2 }));
    const second = await takeOver(sub, runner.runId);
    expect(second).not.toBe(first);
    // The older attempt's ticket stops working.
    expect((await runner.token(first)).status).toBe(409);
    expect((await runner.report({ attempt: 1, seq: 6, phase: 'writing' }, first)).status).toBe(409);
    // The new ticket names its attempt; a report for another attempt is refused.
    expect(((await (await runner.token(second)).json()) as { attempt: number }).attempt).toBe(2);
    const stale = await runner.report({ attempt: 1, seq: 6, phase: 'writing' }, second);
    expect(stale.status).toBe(409);
    expect(await code(stale)).toBe('stale-attempt');
    // The new attempt counts its own reports from the start.
    const ok = await reply(await runner.report({ attempt: 2, seq: 1, phase: 'reading', total: 2 }, second));
    expect(ok.run?.phase).toBe('reading');
    expect((await runner.token(second)).status).toBe(200);
  });

  it('a superseded attempt\'s ticket answers stale-attempt', async () => {
    const { sub, runner } = await aRun();
    const first = runner.ticket;
    const second = await takeOver(sub, runner.runId);
    const token = await runner.token(first);
    expect(token.status).toBe(409);
    expect(await code(token)).toBe('stale-attempt');
    const report = await runner.report({ attempt: 1, seq: 1, phase: 'reading' }, first);
    expect(report.status).toBe(409);
    expect(await code(report)).toBe('stale-attempt');
    // The older ticket is retired, never deleted.
    const rows = await runInDurableObject(person(sub), (_instance, state) =>
      state.storage.sql.exec<{ attempt: number; retired: number }>('SELECT attempt, retired FROM run_ticket ORDER BY attempt').toArray(),
    );
    expect(rows).toEqual([
      { attempt: 1, retired: 1 },
      { attempt: 2, retired: 0 },
    ]);
    expect((await runner.token(second)).status).toBe(200);
  });

  it('an unknown ticket is signed out', async () => {
    const { runner } = await aRun();
    const res = await runner.token('A'.repeat(43));
    expect(res.status).toBe(401);
    expect(await code(res)).toBe('signed-out');
    const report = await runner.report({ attempt: 1, seq: 1, phase: 'reading' }, 'A'.repeat(43));
    expect(report.status).toBe(401);
    expect(await code(report)).toBe('signed-out');
  });

  it('the attempt route answers from the person object alone', async () => {
    const { sub, runner } = await aRun();
    // The kept Drive token has expired, so the token route would ask Google; the attempt route must not.
    await person(sub).cacheDriveToken({ accessToken: 'access-old', expiresAt: Date.now() - HOUR });
    let google = 0;
    const fetchImpl: typeof fetch = async () => {
      google++;
      return new Response('{}', { status: 500 });
    };
    const attempt = async (ticket: string | null): Promise<Response> => {
      const headers: Record<string, string> = ticket === null ? {} : { authorization: `Bearer ${ticket}` };
      return await createApp({ fetchImpl }).request(`${API}/runner/runs/${runner.runId}/attempt`, { headers }, env);
    };
    const first = runner.ticket;
    const ok = await attempt(first);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ attempt: 1 });
    // A missing or wrong ticket is signed out, as on the token route.
    for (const ticket of [null, 'not-the-ticket', 'A'.repeat(43)]) {
      const refused = await attempt(ticket);
      expect(refused.status).toBe(401);
      expect(await code(refused)).toBe('signed-out');
    }
    // A newer attempt: the older ticket answers 409 stale-attempt, the new one names its attempt.
    const second = await takeOver(sub, runner.runId);
    const stale = await attempt(first);
    expect(stale.status).toBe(409);
    expect(await code(stale)).toBe('stale-attempt');
    expect(await (await attempt(second)).json()).toEqual({ attempt: 2 });
    expect(google).toBe(0);
  });

  it('the attempt route answers gone after delete me or revoked access', async () => {
    const attempt = async (runner: FakeRunner): Promise<Response> =>
      await createApp().request(`${API}/runner/runs/${runner.runId}/attempt`, { headers: { authorization: `Bearer ${runner.ticket}` } }, env);
    // Revoked, or the kept refresh token unreadable: `forgetGoogleAccess` clears it, and the run's ticket opens nothing more.
    const revoked = await aRun();
    expect((await attempt(revoked.runner)).status).toBe(200);
    expect(await person(revoked.sub).forgetGoogleAccess('enc-token')).toBe(true);
    for (const r of [await attempt(revoked.runner), await revoked.runner.token()]) {
      expect(r.status).toBe(410);
      expect(await code(r)).toBe('gone');
    }
    // Delete me: the person object is emptied, tickets and all.
    const deleted = await aRun();
    await person(deleted.sub).forget();
    for (const r of [await attempt(deleted.runner), await deleted.runner.token()]) {
      expect(r.status).toBe(410);
      expect(await code(r)).toBe('gone');
    }
  });

  it('a plain sign-out leaves the attempt route answering', async () => {
    const { sub, runner } = await aRun();
    expect(await person(sub).retireSessions()).not.toBeNull();
    const r = await createApp().request(`${API}/runner/runs/${runner.runId}/attempt`, { headers: { authorization: `Bearer ${runner.ticket}` } }, env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ attempt: 1 });
    expect((await runner.token()).status).toBe(200);
  });

  it('a resent final report answers the current state', async () => {
    const { runner } = await aRun();
    await reply(await runner.report({ attempt: 1, seq: 1, phase: 'reading', total: 1 }));
    const done = await reply(await runner.report({ attempt: 1, seq: 2, phase: 'done' }));
    const again = await reply(await runner.report({ attempt: 1, seq: 2, phase: 'done' }));
    expect(again).toEqual(done);
    // Anything else on the retired ticket is signed out.
    expect((await runner.report({ attempt: 1, seq: 3, phase: 'done' })).status).toBe(401);
    expect((await runner.report({ attempt: 2, seq: 2, phase: 'done' })).status).toBe(401);
  });

  it('reports move forward by seq and phase', async () => {
    const { sub, runner } = await aRun();
    const before = (await person(sub).runStatus(Date.now())).revision;
    const reading = await reply(await runner.report({ attempt: 1, seq: 1, phase: 'reading', total: 3 }));
    expect(reading.run).toMatchObject({ id: runner.runId, phase: 'reading', total: 3 });
    expect(reading.revision).toBe(before + 1);
    const writing = await reply(await runner.report({ attempt: 1, seq: 3, phase: 'writing' }));
    expect(writing.run).toMatchObject({ phase: 'writing', total: 3 });
    expect(writing.revision).toBe(before + 2);
    // A lower seq, or a phase going back, is refused and changes nothing.
    for (const late of [
      { attempt: 1, seq: 2, phase: 'saving' },
      { attempt: 1, seq: 4, phase: 'reading' },
      { attempt: 1, seq: 5, phase: 'queued' },
    ] as Report[]) {
      const r = await runner.report(late);
      expect(r.status, JSON.stringify(late)).toBe(409);
      expect(await code(r)).toBe('stale-report');
    }
    expect(await person(sub).runStatus(Date.now())).toEqual(writing);
    const saving = await reply(await runner.report({ attempt: 1, seq: 4, phase: 'saving' }));
    expect(saving.run?.phase).toBe('saving');
    expect(saving.revision).toBe(before + 3);
    // A body that fails validation answers 415.
    for (const bad of [
      'not json',
      JSON.stringify([]),
      JSON.stringify({ seq: 9, phase: 'saving' }),
      JSON.stringify({ attempt: 1, phase: 'saving' }),
      JSON.stringify({ attempt: 1, seq: 9, phase: 'sleeping' }),
      JSON.stringify({ attempt: 1, seq: 1.5, phase: 'saving' }),
      JSON.stringify({ attempt: 1, seq: 9, phase: 'saving', total: -1 }),
      JSON.stringify({ attempt: 1, seq: 9, phase: 'saving', failure: 'Too soon.' }),
      JSON.stringify({ attempt: 1, seq: 9, phase: 'failed', failure: 7 }),
    ]) {
      const r = await runner.report(bad);
      expect(r.status, bad).toBe(415);
      expect(await code(r)).toBe('unsupported-media-type');
    }
  });

  it('a report says an answer stayed only with done', async () => {
    const { runner } = await aRun();
    // The answer that stayed (TL-P4-19 addendum 15) is said only at the run's end, and only as true.
    for (const bad of [
      JSON.stringify({ attempt: 1, seq: 1, phase: 'saving', answersStayed: true }),
      JSON.stringify({ attempt: 1, seq: 1, phase: 'failed', failure: 'Bower could not reach your folder.', answersStayed: true }),
      JSON.stringify({ attempt: 1, seq: 1, phase: 'done', answersStayed: false }),
      JSON.stringify({ attempt: 1, seq: 1, phase: 'done', answersStayed: 'yes' }),
    ]) {
      const r = await runner.report(bad);
      expect(r.status, bad).toBe(415);
      expect(await code(r)).toBe('unsupported-media-type');
    }
  });

  it('a stale report answers the current seq and phase', async () => {
    const { sub, runner } = await aRun();
    await reply(await runner.report({ attempt: 1, seq: 1, phase: 'writing' }));
    await reply(await runner.report({ attempt: 1, seq: 2, phase: 'saving' }));
    // A restarted runner starts its seq again: the refusal says where the Worker is, so it can go on from there.
    const late = await runner.report({ attempt: 1, seq: 1, phase: 'done' });
    expect(late.status).toBe(409);
    const body = (await late.json()) as { error: { code: string; message: string }; current?: { seq: number; phase: string } };
    expect(body.error).toEqual({ code: 'stale-report', message: 'That update arrived late.' });
    expect(body.current).toEqual({ seq: 2, phase: 'saving' });
    // A phase going back answers the same, and changes nothing.
    const back = await runner.report({ attempt: 1, seq: 3, phase: 'writing' });
    expect(back.status).toBe(409);
    expect(((await back.json()) as { current?: unknown }).current).toEqual({ seq: 2, phase: 'saving' });
    expect((await person(sub).runStatus(Date.now())).run?.phase).toBe('saving');
    // Going on from there is accepted.
    expect((await reply(await runner.report({ attempt: 1, seq: 3, phase: 'done' }))).run?.phase).toBe('done');
  });

  it('a repeated report changes nothing', async () => {
    const { sub, runner } = await aRun();
    const first = await reply(await runner.report({ attempt: 1, seq: 1, phase: 'reading', total: 3 }));
    // The same seq again, even carrying something else, answers the current state.
    const again = await reply(await runner.report({ attempt: 1, seq: 1, phase: 'reading', total: 3 }));
    expect(again).toEqual(first);
    const other = await reply(await runner.report({ attempt: 1, seq: 1, phase: 'writing', total: 9 }));
    expect(other).toEqual(first);
    expect(await person(sub).runStatus(Date.now())).toEqual(first);
  });

  it('an ended run retires its ticket', async () => {
    const { sub, runner } = await aRun();
    await reply(await runner.report({ attempt: 1, seq: 1, phase: 'reading', total: 1 }));
    const done = await reply(await runner.report({ attempt: 1, seq: 2, phase: 'done' }));
    expect(done.run).toMatchObject({ phase: 'done', total: 1 });
    expect(typeof done.run?.finishedAt).toBe('number');
    expect((await runner.token()).status).toBe(401);
    expect((await runner.report({ attempt: 1, seq: 3, phase: 'done' })).status).toBe(401);
    expect(await person(sub).runStatus(Date.now())).toEqual(done);

    const failing = await aRun();
    const failure = 'Bower could not reach your folder.';
    const failed = await reply(await failing.runner.report({ attempt: 1, seq: 1, phase: 'failed', failure }));
    expect(failed.run).toMatchObject({ phase: 'failed', failure });
    expect(typeof failed.run?.finishedAt).toBe('number');
    expect((await failing.runner.token()).status).toBe(401);
    const retired = await runInDurableObject(person(failing.sub), (_instance, state) =>
      state.storage.sql.exec<{ retired: number }>('SELECT retired FROM run_ticket').toArray(),
    );
    expect(retired).toEqual([{ retired: 1 }]);

    // A run that went stale is ended by the Worker, and its ticket goes with it.
    const stale = await aRun();
    await runInDurableObject(person(stale.sub), (_instance, state) => {
      state.storage.sql.exec('UPDATE runs SET requested_at = requested_at - ?, phase_at = phase_at - ?', HOUR, HOUR);
    });
    expect((await stale.runner.token()).status).toBe(401);
    expect((await person(stale.sub).runStatus(Date.now())).run?.phase).toBe('failed');
  });

  /** Feeds each shared sequence to the Worker: the same one the fake takes (`src/data/fake/ledger-contract.test.ts`). */
  async function playSequences(): Promise<void> {
    for (const sequence of SEQUENCES) {
      const { sub, runner } = await aRun();
      const tickets = new Map<number, string>([[1, runner.ticket]]);
      let revision = (await person(sub).runStatus(Date.now())).revision;
      for (const [i, step] of sequence.steps.entries()) {
        const where = `${sequence.name}, step ${i + 1}`;
        if ('takeover' in step) {
          if (step.takeover !== 2) throw new Error(`only attempt 2 takes over, at ${where}`);
          tickets.set(step.takeover, await takeOver(sub, runner.runId));
          continue;
        }
        const res = await runner.report(step.send, tickets.get(step.send.attempt));
        const want = step.expect;
        expect(res.status, where).toBe(want.status);
        if (want.status === 409) expect(await code(res), where).toBe(want.code);
        revision += want.bump;
        const now = await person(sub).runStatus(Date.now());
        expect(now.revision, where).toBe(revision);
        expect(now.run?.phase, where).toBe(want.phase);
        expect(now.run?.total, where).toBe(want.total);
        expect(now.run?.failure, where).toBe(want.failure);
        if (want.status === 200) expect(await res.json(), where).toEqual(now);
      }
    }
  }

  it('a later attempt never moves the phase backward', playSequences);
  it('the revision rises only when the visible run changes', playSequences);
});
