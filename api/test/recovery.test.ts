import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { Env } from '../src/env.js';
import type { GitHubAccess } from '../src/github.js';
import { createApp } from '../src/index.js';
import { QUEUED_STALE_MS, RUNNING_STALE_MS, SAVING_FAILURE, STALE_FAILURE } from '../src/process.js';
import { unrecoveredCeiling } from '../src/recovery.js';
import type { RunReply } from '../src/process.js';
import { hashTicket } from '../src/run-ticket.js';
import { MANIFEST } from './drive-v3.js';
import { dispatchOf, pretendGitHubForFile } from './github-support.js';
import { inWindow } from './time.js';

const env = testEnv as unknown as Env;
const API = 'https://api.example.com';
const GITHUB = `https://api.github.com/repos/${env.GITHUB_REPO}`;
const MINUTE = 60_000;

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

/** The GitHub the runtime's own alarm reaches: runs are admitted at the wall clock, and their dispatch is due then. */
const alarmGitHub = pretendGitHubForFile(env);

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
  const { generation } = await p.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
  await p.pointFolder(generation, null, 'FOLDER_ID');
  await p.cacheDriveToken({ accessToken: 'access-cached', expiresAt: Date.now() + 120 * MINUTE });
  const t0 = Date.now();
  const admitted = await p.admit({ accountEpoch: (await p.account())?.accountEpoch ?? -1, scope: 'instructions', allowWeb: true, requestId: 'press-1', now: t0, dailyLimit: 100, manifest: MANIFEST });
  if (!admitted.admitted) throw new Error('not admitted');
  const { ticket } = await dispatchOf(alarmGitHub, admitted.run.id);
  return { sub, runId: admitted.run.id, ticket, t0 };
}

async function recover(sub: string, now: number, access: GitHubAccess): Promise<void> {
  await runInDurableObject(person(sub), async (instance) => {
    await instance.recover(now, access);
  });
}

/** Takes the GitHub token out of this person object's own env, as on an instance with dispatch not configured. */
async function withoutToken(sub: string): Promise<void> {
  await runInDurableObject(person(sub), (instance) => {
    const own = instance as unknown as { env: Env };
    own.env = { ...own.env, GITHUB_TOKEN: undefined };
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

  it('the alarm redispatches a run whose first job finished without a report', async () => {
    // Attempt 1 started writing, then its job was cancelled (`gh run cancel`): completed, with no further report.
    const { sub, runId, ticket, t0 } = await aRun();
    const p = person(sub);
    const hash1 = await hashTicket(ticket);
    const reading = await p.runnerReport(runId, hash1, { attempt: 1, seq: 1, phase: 'reading', total: 2 }, t0 + MINUTE);
    const writing = await p.runnerReport(runId, hash1, { attempt: 1, seq: 2, phase: 'writing' }, t0 + 2 * MINUTE);
    if (!reading.accepted || !writing.accepted) throw new Error('report refused');
    const before = await status(sub, t0 + 2 * MINUTE);
    const now = t0 + 2 * MINUTE + RUNNING_STALE_MS + 1;
    const gh = github({
      runs: [{ id: 51, display_title: `tidy ${runId} 1` }],
      jobs: { 51: [{ id: 3, status: 'completed', started_at: iso(t0 + MINUTE), completed_at: iso(t0 + 3 * MINUTE) }] },
    });
    await recover(sub, now, gh.access);
    expect(lookups(gh.sent)).toHaveLength(1);
    // Redispatched once, as attempt 2 with a new ticket; the run a person sees is unchanged.
    const sent = dispatches(gh.sent);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toMatchObject({ run_id: runId, attempt: 2, scope: 'instructions', allow_web: true });
    const second = sent[0]?.payload?.ticket ?? '';
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(ticket);
    expect(await status(sub, now)).toEqual(before);
    expect(await alarmOf(sub)).toBe(now + QUEUED_STALE_MS);
    // The old ticket is retired: a late attempt-1 job is a stale attempt.
    expect(await tokenStatus(runId, ticket)).toBe(409);
    const late = await report(runId, ticket, { attempt: 1, seq: 3, phase: 'saving' });
    expect(late.status).toBe(409);
    expect(((await late.json()) as { error: { code: string } }).error.code).toBe('stale-attempt');
    // The resumed runner (attempt 2) reports through the runner routes and the run ends done.
    expect(await tokenStatus(runId, second)).toBe(200);
    for (const [seq, phase] of [[1, 'reading'], [2, 'writing'], [3, 'saving'], [4, 'done']] as const) {
      const sentReport = await report(runId, second, { attempt: 2, seq, phase, ...(phase === 'reading' ? { total: 2 } : {}) });
      expect(sentReport.status).toBe(200);
    }
    const after = await status(sub, now + MINUTE);
    expect(after.run).toMatchObject({ id: runId, phase: 'done' });
    expect(after.run?.failure).toBeUndefined();
    // The next alarm asks nobody, changes nothing and is not set again.
    await recover(sub, now + 2 * QUEUED_STALE_MS, gh.access);
    expect(lookups(gh.sent)).toHaveLength(1);
    expect(await status(sub, now + 2 * QUEUED_STALE_MS)).toEqual(after);
    expect(await alarmOf(sub)).toBeNull();
    expectNoSecretLogged(ticket, second);
  });

  it('an attempt ended report arms the run deadline at +60 s and the alarm redispatches', async () => {
    // Actions 37843268864: attempt 1 stopped before any report (queued, status=0); it says it ended.
    const { sub, runId, ticket, t0 } = await aRun();
    const before = await status(sub, t0);
    const sentAt = Date.now();
    const ended = await report(runId, ticket, { attempt: 1, ended: true });
    const tookAt = Date.now();
    expect(ended.status).toBe(200);
    expect(((await ended.json()) as RunReply).run).toMatchObject({ id: runId, phase: 'queued' });
    // Nothing a person sees changes; the alarm looks in a minute, not at the queued deadline (17 min).
    expect(await status(sub, tookAt)).toEqual(before);
    const alarm = (await alarmOf(sub)) ?? undefined;
    inWindow(alarm, sentAt + MINUTE, tookAt + MINUTE);
    const at = alarm ?? 0;
    expect(at - t0).toBeLessThan(2 * MINUTE);
    const gh = github({
      runs: [
        { id: 61, display_title: `tidy ${runId} 1` },
        { id: 62, display_title: `tidy ${runId} 2` },
      ],
      jobs: {
        61: [{ id: 6, status: 'completed', started_at: iso(t0), completed_at: iso(t0 + 30_000) }],
        62: [{ id: 7, status: 'completed', started_at: iso(at + MINUTE), completed_at: iso(at + 3 * MINUTE) }],
      },
    });
    await recover(sub, at, gh.access);
    // The job finished with no report: redispatched as attempt 2, which owns the run from now.
    const sent = dispatches(gh.sent);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toMatchObject({ run_id: runId, attempt: 2 });
    const second = sent[0]?.payload?.ticket ?? '';
    expect(await alarmOf(sub)).toBe(at + QUEUED_STALE_MS);
    const late = await report(runId, ticket, { attempt: 1, ended: true });
    expect(late.status).toBe(409);
    expect(((await late.json()) as { error: { code: string } }).error.code).toBe('stale-attempt');
    expect(await alarmOf(sub)).toBe(at + QUEUED_STALE_MS);

    // Attempt 2 is left in saving and says it ended: no attempt 3, the run ends saying the changes were made.
    const saving = await report(runId, second, { attempt: 2, seq: 1, phase: 'saving' });
    expect(saving.status).toBe(200);
    const again = await report(runId, second, { attempt: 2, ended: true });
    expect(again.status).toBe(200);
    const next = (await alarmOf(sub)) ?? 0;
    inWindow(next, tookAt + MINUTE, Date.now() + MINUTE);
    await recover(sub, next, gh.access);
    expect(dispatches(gh.sent)).toHaveLength(1);
    const after = await status(sub, next);
    expect(after.run).toMatchObject({ id: runId, phase: 'failed', failure: SAVING_FAILURE });
    expect(await alarmOf(sub)).toBeNull();
    // Once ended, the report answers the run as it is and arms nothing.
    const done = await report(runId, second, { attempt: 2, ended: true });
    expect(done.status).toBe(200);
    expect(((await done.json()) as RunReply).run).toMatchObject({ id: runId, phase: 'failed' });
    expect(await alarmOf(sub)).toBeNull();
    expectNoSecretLogged(ticket, second);
  });

  it('a second attempt with no live job ends stale', async () => {
    for (const lastPhase of [null, 'saving'] as const) {
      const { sub, runId, ticket, t0 } = await aRun();
      const before = await status(sub, t0);
      const first = t0 + QUEUED_STALE_MS + 1;
      // Attempt 1's job finished with no report: redispatched as attempt 2.
      const gh = github({
        runs: [
          { id: 81, display_title: `tidy ${runId} 1` },
          { id: 82, display_title: `tidy ${runId} 2` },
        ],
        jobs: {
          81: [{ id: 8, status: 'completed', started_at: iso(t0 + MINUTE), completed_at: iso(t0 + 2 * MINUTE) }],
          82: [{ id: 9, status: 'completed', started_at: iso(first + MINUTE), completed_at: iso(first + 3 * MINUTE) }],
        },
      });
      await recover(sub, first, gh.access);
      expect(dispatches(gh.sent)).toHaveLength(1);
      const second = dispatches(gh.sent)[0]?.payload?.ticket ?? '';
      let deadline = first + QUEUED_STALE_MS;
      if (lastPhase === 'saving') {
        // Attempt 2 got as far as saving, then its job finished too.
        const saving = await person(sub).runnerReport(runId, await hashTicket(second), { attempt: 2, seq: 1, phase: 'saving' }, first + 2 * MINUTE);
        if (!saving.accepted) throw new Error('report refused');
        deadline = first + 2 * MINUTE + RUNNING_STALE_MS;
      }
      // Attempt 2's job finished with no report: no third attempt, the run ends failed stale.
      await recover(sub, deadline, gh.access);
      expect(lookups(gh.sent)).toHaveLength(2);
      expect(dispatches(gh.sent)).toHaveLength(1);
      const after = await status(sub, deadline);
      expect(after.run).toMatchObject({ id: runId, phase: 'failed', failure: lastPhase === 'saving' ? SAVING_FAILURE : STALE_FAILURE, finishedAt: deadline });
      expect(after.revision).toBe(before.revision + (lastPhase === 'saving' ? 2 : 1));
      expect(await tokenStatus(runId, second)).toBe(401);
      expect(await alarmOf(sub)).toBeNull();
      // Once: a later alarm changes nothing and asks nobody.
      await recover(sub, deadline + MINUTE, gh.access);
      expect(lookups(gh.sent)).toHaveLength(2);
      expect(await status(sub, deadline + MINUTE)).toEqual(after);
      expectNoSecretLogged(ticket, second);
    }
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

  it('a status poll during the lookup leaves a live job\'s run alone', async () => {
    const { sub, runId, ticket, t0 } = await aRun();
    const before = await status(sub, t0);
    const now = t0 + QUEUED_STALE_MS + 1;
    const gh = github({
      runs: [{ id: 71, display_title: `tidy ${runId} 1` }],
      jobs: { 71: [{ id: 5, status: 'queued', started_at: null, completed_at: null }] },
    });
    // The app polls `/status` while the alarm waits for GitHub.
    let polled: RunReply | null = null;
    const access: GitHubAccess = {
      ...gh.access,
      fetchImpl: async (url, init) => {
        if (polled === null) polled = await status(sub, now + 1);
        return await gh.access.fetchImpl(url, init);
      },
    };
    await recover(sub, now, access);
    expect(polled).toEqual(before);
    expect(dispatches(gh.sent)).toEqual([]);
    expect(await status(sub, now + 1)).toEqual(before);
    expect(await alarmOf(sub)).toBe(now + QUEUED_STALE_MS);
    expect(await tokenStatus(runId, ticket)).toBe(200);
  });

  it('a status poll past the deadline waits for recovery when dispatch is configured', async () => {
    const { sub, runId, ticket, t0 } = await aRun();
    const before = await status(sub, t0);
    const deadline = t0 + QUEUED_STALE_MS;
    const ceiling = deadline + unrecoveredCeiling({ phase: 'queued' });
    expect(ceiling).toBe(deadline + 2 * QUEUED_STALE_MS);
    // No alarm has run yet: the poll leaves the run to recovery.
    expect(await status(sub, deadline + 1)).toEqual(before);
    expect(await person(sub).runnerAccess(runId, await hashTicket(ticket), deadline + 1)).not.toBeNull();
    expect(await alarmOf(sub)).toBe(deadline);
    // If no alarm ever decides, the hard ceiling past the deadline still ends the run, once.
    expect(await status(sub, ceiling - 1)).toEqual(before);
    const ended = await status(sub, ceiling);
    expect(ended.run).toMatchObject({ id: runId, phase: 'failed', failure: STALE_FAILURE });
    expect(ended.revision).toBe(before.revision + 1);
    expect(await tokenStatus(runId, ticket)).toBe(401);
  });

  it('a run past the ceiling in saving fails saying changes were made', async () => {
    const saving = await aRun();
    const writing = await aRun();
    const at = (t0: number) => t0 + MINUTE;
    for (const [run, phase] of [[saving, 'saving'], [writing, 'writing']] as const) {
      const sent = await person(run.sub).runnerReport(run.runId, await hashTicket(run.ticket), { attempt: 1, seq: 1, phase }, at(run.t0));
      if (!sent.accepted) throw new Error('report refused');
    }
    const ceiling = (t0: number) => at(t0) + RUNNING_STALE_MS + unrecoveredCeiling({ phase: 'saving' });
    expect((await status(saving.sub, ceiling(saving.t0) - 1)).run?.phase).toBe('saving');
    // Its effects were done and only the summary was not saved: the sentence says so, never that nothing happened.
    const ended = await status(saving.sub, ceiling(saving.t0));
    expect(ended.run).toMatchObject({ id: saving.runId, phase: 'failed', failure: SAVING_FAILURE });
    expect(SAVING_FAILURE).toBe("Bower made changes but couldn't save the summary of this tidy-up.");
    // Other phases keep the stale sentence.
    expect((await status(writing.sub, ceiling(writing.t0))).run).toMatchObject({ id: writing.runId, phase: 'failed', failure: STALE_FAILURE });
  });

  it('without a GitHub token a status poll still expires the run', async () => {
    const configured = await aRun();
    const plain = await aRun();
    await withoutToken(plain.sub);
    const before = await status(plain.sub, plain.t0);
    const late = (t0: number) => t0 + QUEUED_STALE_MS;
    // With a token the same poll waits for recovery; without one it expires the run at the deadline, as before.
    expect((await status(configured.sub, late(configured.t0))).run?.phase).toBe('queued');
    expect(await status(plain.sub, late(plain.t0) - 1)).toEqual(before);
    const expired = await status(plain.sub, late(plain.t0));
    expect(expired.run).toMatchObject({ id: plain.runId, phase: 'failed', failure: STALE_FAILURE, finishedAt: late(plain.t0) });
    expect(expired.revision).toBe(before.revision + 1);
    expect(await tokenStatus(plain.runId, plain.ticket)).toBe(401);
    expect(await alarmOf(plain.sub)).toBeNull();
  });
});
