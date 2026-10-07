import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { Env } from '../src/env.js';
import type { GitHubAccess } from '../src/github.js';
import { createApp } from '../src/index.js';
import { QUEUED_STALE_MS, RUNNING_STALE_MS, STALE_FAILURE } from '../src/process.js';
import type { RunReply } from '../src/process.js';
import { hashTicket } from '../src/run-ticket.js';

const env = testEnv as unknown as Env;
const API = 'https://api.example.com';
const GITHUB = `https://api.github.com/repos/${env.GITHUB_REPO}`;
const MINUTE = 60_000;

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

let log: MockInstance<typeof console.error>;
beforeEach(() => {
  log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  log.mockRestore();
});

interface JobJson {
  id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
}

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  payload?: { run_id: string; attempt: number; ticket: string; scope: string; allow_web: boolean };
}

/**
 * A pretend GitHub: the repository's `repository_dispatch` runs (by display title), each run's jobs, and the
 * dispatch endpoint. `status` answers every call with that status, or fails the network when null.
 */
function github(opts: { runs?: { id: number; display_title: string }[]; jobs?: Record<number, JobJson[]>; status?: number | null; token?: string | undefined } = {}) {
  const sent: Call[] = [];
  const fetchImpl = (url: string, init: RequestInit = {}): Promise<Response> => {
    const call: Call = { method: init.method ?? 'GET', url, headers: (init.headers ?? {}) as Record<string, string> };
    if (init.body !== undefined) call.payload = (JSON.parse(String(init.body)) as { client_payload: Call['payload'] }).client_payload;
    sent.push(call);
    if (opts.status === null) return Promise.reject(new Error('network down, ticket-secret'));
    if (opts.status !== undefined) return Promise.resolve(new Response(null, { status: opts.status }));
    if (call.method === 'POST' && url === `${GITHUB}/dispatches`) return Promise.resolve(new Response(null, { status: 204 }));
    if (url.startsWith(`${GITHUB}/actions/runs?`)) {
      const runs = opts.runs ?? [];
      return Promise.resolve(Response.json({ total_count: runs.length, workflow_runs: runs }));
    }
    const jobs = /\/actions\/runs\/(\d+)\/jobs/.exec(url);
    if (jobs !== null) {
      const list = opts.jobs?.[Number(jobs[1])] ?? [];
      return Promise.resolve(Response.json({ total_count: list.length, jobs: list }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  };
  const access: GitHubAccess = { repo: env.GITHUB_REPO, token: 'token' in opts ? opts.token : 'test-github-token', fetchImpl };
  return { sent, access };
}

/** A signed-in person with one queued run admitted at `t0`, dispatched as attempt 1 with its ticket. */
async function aRun(): Promise<{ sub: string; runId: string; ticket: string; t0: number }> {
  const sub = `recovery-sub-${crypto.randomUUID()}`;
  const p = person(sub);
  await p.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
  await p.setFolderId('FOLDER_ID');
  await p.cacheDriveToken({ accessToken: 'access-cached', expiresAt: Date.now() + 120 * MINUTE });
  const t0 = Date.now();
  const admitted = await p.admit({ scope: 'instructions', allowWeb: true, requestId: 'press-1', now: t0, dailyLimit: 100 });
  if (!admitted.admitted) throw new Error('not admitted');
  const ticket = await p.mintTicket(admitted.run.id, 1, t0);
  if (ticket === null) throw new Error('no ticket');
  return { sub, runId: admitted.run.id, ticket, t0 };
}

async function recover(sub: string, now: number, access: GitHubAccess): Promise<void> {
  await runInDurableObject(person(sub), async (instance) => {
    await instance.recover(now, access);
  });
}

async function alarmOf(sub: string): Promise<number | null> {
  return await runInDurableObject(person(sub), (_i, state) => state.storage.getAlarm());
}

async function status(sub: string, now: number): Promise<RunReply> {
  return await person(sub).runStatus(now);
}

async function report(runId: string, ticket: string, body: object): Promise<Response> {
  return await createApp().request(
    `${API}/runner/runs/${runId}/status`,
    { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(body) },
    env,
  );
}

async function tokenStatus(runId: string, ticket: string): Promise<number> {
  return (await createApp().request(`${API}/runner/runs/${runId}/token`, { headers: { authorization: `Bearer ${ticket}` } }, env)).status;
}

const iso = (ms: number) => new Date(ms).toISOString();
const lookups = (sent: Call[]) => sent.filter((c) => c.method === 'GET' && c.url.startsWith(`${GITHUB}/actions/runs?`));
const dispatches = (sent: Call[]) => sent.filter((c) => c.method === 'POST');

/** Nothing logged carries the token or a ticket. */
function expectNoSecretLogged(...tickets: string[]): void {
  const lines = log.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
  expect(lines).not.toContain('test-github-token');
  expect(lines).not.toContain('ticket-secret');
  for (const t of tickets) expect(lines).not.toContain(t);
}

describe('stale run recovery', () => {
  it('an alarm on a run that progressed changes nothing', async () => {
    const { sub, runId, ticket, t0 } = await aRun();
    const p = person(sub);
    const reading = await p.runnerReport(runId, await hashTicket(ticket), { attempt: 1, seq: 1, phase: 'reading', total: 2 }, t0 + 10 * MINUTE);
    if (!reading.accepted) throw new Error('report refused');
    const before = await status(sub, t0 + 10 * MINUTE);
    const gh = github();
    // The queued deadline passes, but a report moved the run's own deadline.
    await recover(sub, t0 + QUEUED_STALE_MS + 1, gh.access);
    expect(gh.sent).toEqual([]);
    expect(await status(sub, t0 + QUEUED_STALE_MS + 1)).toEqual(before);
    expect(await alarmOf(sub)).toBe(t0 + 10 * MINUTE + RUNNING_STALE_MS);
    // A run that ended needs no alarm.
    const done = await p.runnerReport(runId, await hashTicket(ticket), { attempt: 1, seq: 2, phase: 'done' }, t0 + 11 * MINUTE);
    if (!done.accepted) throw new Error('report refused');
    await recover(sub, t0 + 11 * MINUTE + RUNNING_STALE_MS + 1, gh.access);
    expect(gh.sent).toEqual([]);
    expect(await status(sub, t0 + 12 * MINUTE)).toEqual(done.reply);
    expect(await alarmOf(sub)).toBeNull();
  });

  it('a lost dispatch is redispatched once with a new ticket', async () => {
    const { sub, runId, ticket, t0 } = await aRun();
    const before = await status(sub, t0);
    const now = t0 + QUEUED_STALE_MS + 1;
    // Another run of this person, and attempt 2 of this one, are not attempt 1's run.
    const gh = github({ runs: [{ id: 7, display_title: `tidy ${runId}x 1` }, { id: 8, display_title: `tidy ${runId} 2` }] });
    await recover(sub, now, gh.access);
    expect(lookups(gh.sent)).toHaveLength(1);
    const lookup = lookups(gh.sent)[0];
    expect(lookup?.url).toContain('event=repository_dispatch');
    expect(lookup?.url).toMatch(/per_page=\d+/);
    expect(lookup?.headers.Authorization).toBe('Bearer test-github-token');
    const sent = dispatches(gh.sent);
    expect(sent).toHaveLength(1);
    const payload = sent[0]?.payload;
    expect(sent[0]?.url).toBe(`${GITHUB}/dispatches`);
    expect(payload).toMatchObject({ run_id: runId, attempt: 2, scope: 'instructions', allow_web: true });
    const second = payload?.ticket ?? '';
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(ticket);
    // The run stays queued, nothing new is shown, and the alarm waits for the new queued deadline.
    expect(await status(sub, now)).toEqual(before);
    expect(await alarmOf(sub)).toBe(now + QUEUED_STALE_MS);
    expect((await status(sub, now + QUEUED_STALE_MS - 1)).run?.phase).toBe('queued');
    // Attempt 1 is fenced: its ticket and its reports are a stale attempt.
    expect(await tokenStatus(runId, ticket)).toBe(409);
    const stale = await report(runId, second, { attempt: 1, seq: 1, phase: 'reading' });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: { code: string } }).error.code).toBe('stale-attempt');
    expect(await tokenStatus(runId, second)).toBe(200);
    expectNoSecretLogged(ticket, second);
  });

  it('a live job is left alone until its own deadline', async () => {
    const { sub, runId, t0 } = await aRun();
    const before = await status(sub, t0);
    const now = t0 + QUEUED_STALE_MS + 1;
    const started = now - 5 * MINUTE;
    const gh = github({
      runs: [{ id: 41, display_title: `tidy ${runId} 1` }],
      jobs: { 41: [{ id: 1, status: 'in_progress', started_at: iso(started), completed_at: null }] },
    });
    await recover(sub, now, gh.access);
    expect(dispatches(gh.sent)).toEqual([]);
    expect(gh.sent.some((c) => c.url === `${GITHUB}/actions/runs/41/jobs`)).toBe(true);
    expect(await status(sub, now)).toEqual(before);
    expect(await alarmOf(sub)).toBe(started + RUNNING_STALE_MS);
    expect((await status(sub, started + RUNNING_STALE_MS - 1)).run?.phase).toBe('queued');

    // A job still queued on GitHub is given a queued window from now.
    const queued = await aRun();
    const qNow = queued.t0 + QUEUED_STALE_MS + 1;
    const qh = github({
      runs: [{ id: 42, display_title: `tidy ${queued.runId} 1` }],
      jobs: { 42: [{ id: 2, status: 'queued', started_at: iso(queued.t0), completed_at: null }] },
    });
    await recover(queued.sub, qNow, qh.access);
    expect(dispatches(qh.sent)).toEqual([]);
    expect(await alarmOf(queued.sub)).toBe(qNow + QUEUED_STALE_MS);
    expect((await status(queued.sub, qNow + 1)).run?.phase).toBe('queued');
  });

  it('a finished job with no report is marked failed stale', async () => {
    const { sub, runId, ticket, t0 } = await aRun();
    const before = await status(sub, t0);
    const now = t0 + QUEUED_STALE_MS + 1;
    const gh = github({
      runs: [{ id: 51, display_title: `tidy ${runId} 1` }],
      jobs: { 51: [{ id: 3, status: 'completed', started_at: iso(t0 + MINUTE), completed_at: iso(t0 + 3 * MINUTE) }] },
    });
    await recover(sub, now, gh.access);
    expect(lookups(gh.sent)).toHaveLength(1);
    expect(dispatches(gh.sent)).toEqual([]);
    const after = await status(sub, now);
    expect(after.run).toMatchObject({ id: runId, phase: 'failed', failure: STALE_FAILURE, finishedAt: now });
    expect(after.revision).toBe(before.revision + 1);
    expect(await tokenStatus(runId, ticket)).toBe(401);
    expect(await alarmOf(sub)).toBeNull();
    // Once: a later alarm changes nothing and asks nobody.
    await recover(sub, now + MINUTE, gh.access);
    expect(gh.sent.filter((c) => c.url.includes('/actions/runs?'))).toHaveLength(1);
    expect(await status(sub, now + MINUTE)).toEqual(after);
  });

  it('a run stuck twice is marked failed stale', async () => {
    // A redispatched run that never showed up.
    const lost = await aRun();
    const before = await status(lost.sub, lost.t0);
    const gh = github();
    const first = lost.t0 + QUEUED_STALE_MS + 1;
    await recover(lost.sub, first, gh.access);
    expect(dispatches(gh.sent)).toHaveLength(1);
    const second = first + QUEUED_STALE_MS;
    await recover(lost.sub, second, gh.access);
    expect(lookups(gh.sent)).toHaveLength(2);
    expect(dispatches(gh.sent)).toHaveLength(1);
    const failed = await status(lost.sub, second);
    expect(failed.run).toMatchObject({ phase: 'failed', failure: STALE_FAILURE });
    expect(failed.revision).toBe(before.revision + 1);
    expect(await tokenStatus(lost.runId, dispatches(gh.sent)[0]?.payload?.ticket ?? '')).toBe(401);

    // A live job that is still not heard from at its own deadline.
    const live = await aRun();
    const liveBefore = await status(live.sub, live.t0);
    const now = live.t0 + QUEUED_STALE_MS + 1;
    const lh = github({
      runs: [{ id: 61, display_title: `tidy ${live.runId} 1` }],
      jobs: { 61: [{ id: 4, status: 'in_progress', started_at: iso(now - MINUTE), completed_at: null }] },
    });
    await recover(live.sub, now, lh.access);
    expect((await status(live.sub, now)).run?.phase).toBe('queued');
    const deadline = now - MINUTE + RUNNING_STALE_MS;
    await recover(live.sub, deadline, lh.access);
    const stuck = await status(live.sub, deadline);
    expect(stuck.run).toMatchObject({ phase: 'failed', failure: STALE_FAILURE });
    expect(stuck.revision).toBe(liveBefore.revision + 1);
    expect(dispatches(lh.sent)).toEqual([]);
    expect(await tokenStatus(live.runId, live.ticket)).toBe(401);
  });

  it('a failed lookup or no token marks the run failed stale at the deadline', async () => {
    for (const gh of [github({ status: 500 }), github({ status: null }), github({ token: undefined })]) {
      const { sub, runId, ticket, t0 } = await aRun();
      const before = await status(sub, t0);
      // Before the deadline, nothing is asked.
      await recover(sub, t0 + QUEUED_STALE_MS - 1, gh.access);
      expect(gh.sent).toEqual([]);
      const now = t0 + QUEUED_STALE_MS + 1;
      await recover(sub, now, gh.access);
      expect(dispatches(gh.sent)).toEqual([]);
      const after = await status(sub, now);
      expect(after.run).toMatchObject({ id: runId, phase: 'failed', failure: STALE_FAILURE });
      expect(after.revision).toBe(before.revision + 1);
      expectNoSecretLogged(ticket);
    }
    const lines = log.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(lines).toContain('500');
    expect(lines).toContain('network');
  });
});
