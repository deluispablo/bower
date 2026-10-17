import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import personSource from '../src/person.ts?raw';
import schemaSource from '../src/person-schema.ts?raw';
import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { GENERAL_ERRORS } from '../src/errors.js';
import { SUBREQUEST_BUDGET } from '../../src/data/spine/budget.js';
import { holderOf, press, pressGitHub } from './admission-support.js';
import { driveFolder } from './drive-v3.js';

const env = testEnv as unknown as Env;
const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));
const gh = pressGitHub();
const TOO_LARGE = GENERAL_ERRORS['payload-too-large'].message;

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

/** A signed-in person whose newest run ended with `snapshot` stored as its open questions. */
async function runWithSnapshot(snapshot: string): Promise<string> {
  const sub = `audit-worker-status-${crypto.randomUUID()}`;
  const enc = await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY));
  await person(sub).signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: enc });
  await runInDurableObject(person(sub), (_instance, state) => {
    state.storage.sql.exec(
      `INSERT INTO runs (id, seq, request_id, scope, allow_web, phase, requested_at, phase_at, finished_at, total, open_questions_snapshot)
       VALUES ('run-1', 1, 'press-1', 'all', 0, 'done', 1, 2, 3, 0, ?)`,
      snapshot,
    );
  });
  return sub;
}

describe('audit-worker-status', () => {
  it('AC1 audit-worker-status-tolerant-questions: a stored questions list that fails today\'s check is logged and left out', async () => {
    // workerd's `console.error` reads back as a bound function: the spy itself is what is asserted.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // A list an earlier or later build kept, in a shape this build does not read, and one that is not JSON at all.
    for (const snapshot of ['[{"surprise":true}]', '[{']) {
      const sub = await runWithSnapshot(snapshot);
      const reply = await person(sub).runStatus(10);
      expect(reply.run?.phase, snapshot).toBe('done');
      expect(reply.run && 'questions' in reply.run, snapshot).toBe(false);
    }
    // One line each, with the run id and none of the stored content.
    expect(errors).toHaveBeenCalledTimes(2);
    for (const [line] of errors.mock.calls) {
      expect(String(line)).toContain('run-1');
      expect(String(line)).not.toContain('surprise');
    }
  });

  it('AC2 audit-worker-status-listing-limit: a folder whose listing needs more pages than a press may fetch is refused in one sentence', async () => {
    const folder = await driveFolder();
    const who = await holderOf(folder);
    let fetches = 0;
    const r = await press(async (url, init) => {
      fetches += 1;
      // What the platform does past a free invocation's 50 subrequests.
      if (fetches > 50) throw new Error('Too many subrequests.');
      // A listing that never ends: every page says there is another.
      if (url.includes('/drive/v3/files?') && url.includes('q=')) return Response.json({ files: [], nextPageToken: `page-${fetches}` });
      return await folder.fetchImpl(url, init);
    }, who.headers, gh);
    expect(r.status).toBe(413);
    expect(((await r.json()) as { error: { code: string; message: string } }).error).toEqual({ code: 'payload-too-large', message: TOO_LARGE });
    expect(fetches).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
  }, 60_000);

  it('AC2 audit-worker-status-listing-limit-retry: a page that refreshes its token near the limit still keeps the press within the budget', async () => {
    // Spec review r1: 32 is a page-start threshold; a page started under it may refresh and resend inside the reserve.
    const folder = await driveFolder();
    const who = await holderOf(folder);
    let fetches = 0;
    const refused = new Set<string>();
    const r = await press(async (url, init) => {
      fetches += 1;
      if (fetches > 50) throw new Error('Too many subrequests.');
      if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: `access-${fetches}`, expires_in: 3600 });
      if (url.includes('/drive/v3/files?') && url.includes('q=')) {
        // Every page's first try is refused (an expired token): a refresh and a resend, then a page that says there is another.
        if (!refused.has(url)) {
          refused.add(url);
          return new Response('{}', { status: 401 });
        }
        return Response.json({ files: [], nextPageToken: `page-${fetches}` });
      }
      return await folder.fetchImpl(url, init);
    }, who.headers, gh);
    expect(r.status).toBe(413);
    expect(fetches).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
  }, 60_000);

  it('AC2 audit-worker-status-listing-limit-combined: three 503s, a 401 and three more 503s on a page started under the threshold stay inside the platform limit', async () => {
    // Spec review r2: 32 is a page-start threshold, not a fetch ceiling. The worst page started at 31 sends 8 times and
    // refreshes once (9 fetches): 40 in all, under the platform's 50, so the refusal stays 413, never the platform's.
    const folder = await driveFolder();
    const who = await holderOf(folder);
    let fetches = 0;
    const sent = new Map<string, number>();
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const pressed = press(async (url, init) => {
      fetches += 1;
      if (fetches > 50) throw new Error('Too many subrequests.');
      if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: `access-${fetches}`, expires_in: 3600 });
      if (url.includes('/drive/v3/files?') && url.includes('q=')) {
        const n = sent.get(url) ?? 0;
        sent.set(url, n + 1);
        if (n === 3) return new Response('{}', { status: 401 });
        if (n < 7) return new Response('{}', { status: 503 });
        return Response.json({ files: [], nextPageToken: `page-${fetches}` });
      }
      return await folder.fetchImpl(url, init);
    }, who.headers, gh);
    // The backoff waits are the transport's own timers: advance them, never wait the clock.
    let done = false;
    void pressed.then(() => { done = true; }, () => { done = true; });
    while (!done) await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    const r = await pressed;
    expect(r.status).toBe(413);
    expect(fetches).toBeLessThanOrEqual(40);
  }, 120_000);

  /** Endless one-fetch listing pages; `onPage(spent, url)` answers the page first asked for with `spent` subrequests used. */
  async function pressListing(onPage: (spent: number, url: string) => Response, retries = false) {
    const folder = await driveFolder();
    const who = await holderOf(folder);
    let fetches = 0;
    let lastPageAt = -1;
    const sent = new Map<string, number>();
    if (retries) vi.useFakeTimers({ toFake: ['setTimeout'] });
    const pressed = press(async (url, init) => {
      fetches += 1;
      if (fetches > 50) throw new Error('Too many subrequests.');
      if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: `access-${fetches}`, expires_in: 3600 });
      if (url.includes('/drive/v3/files?') && url.includes('q=')) {
        if (!sent.has(url)) lastPageAt = fetches - 1;
        const n = sent.get(url) ?? 0;
        sent.set(url, n + 1);
        // The page asked for at 31 used gets the worst retries: three 503s, a 401 (refresh), three 503s.
        if (retries && lastPageAt === 31) {
          if (n === 3) return new Response('{}', { status: 401 });
          if (n < 7) return new Response('{}', { status: 503 });
        }
        return onPage(lastPageAt, url);
      }
      return await folder.fetchImpl(url, init);
    }, who.headers, gh);
    let done = false;
    void pressed.then(() => { done = true; }, () => { done = true; });
    while (retries && !done) await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    return { r: await pressed, fetches: () => fetches, lastPageAt: () => lastPageAt };
  }

  it('AC2 audit-worker-status-listing-limit-last-page: the last page, started at 31 used, succeeds through three 503s, a 401 and three more 503s', async () => {
    // Spec review r4: 32 is a page-start threshold, so a page that starts at 31 is allowed and may use the reserve.
    const { r, fetches, lastPageAt } = await pressListing((spent, url) => Response.json(
      spent >= 31 ? { files: [] } : { files: [], nextPageToken: `page-${url.length}-${spent}` },
    ), true);
    expect(lastPageAt()).toBe(31);
    expect(r.status).not.toBe(413);
    // The listing finished (an empty inbox is the stub's doing), so the press ends as "nothing waiting", not as too large.
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('nothing');
    expect(fetches()).toBeLessThanOrEqual(50);
  }, 120_000);

  it('AC2 audit-worker-status-listing-limit-refused-at-32: a further page asked for at 32 used is refused before any fetch for it', async () => {
    const { r, fetches, lastPageAt } = await pressListing((spent) => Response.json({ files: [], nextPageToken: `page-${spent}` }));
    expect(r.status).toBe(413);
    // The page asked for at 31 was fetched (its fetch is the 32nd); the one at 32 never was.
    expect(lastPageAt()).toBe(31);
    expect(fetches()).toBe(32);
  }, 60_000);

  it('AC2 audit-worker-status-manifest-limit: what a press would admit past 1 MiB is refused before anything is kept', async () => {
    const folder = await driveFolder();
    const pile = await folder.drive.createFolder(folder.inbox, 'Papers', { pile: 'pile-1' });
    await folder.drive.createText(pile.id, 'Pile note.md', 'Papers from Alex');
    // 600 things with long names: about 1.2 MB of manifest, under the row's 2 MB but past the stated 1 MiB.
    for (let n = 0; n < 600; n += 1) await folder.drive.createText(pile.id, `${'x'.repeat(1900)}-${n}.pdf`, `%PDF ${n}`);
    const who = await holderOf(folder);
    const r = await press(folder.fetchImpl, who.headers, gh);
    expect(r.status).toBe(413);
    expect(((await r.json()) as { error: { message: string } }).error.message).toBe(TOO_LARGE);
    const kept = await runInDurableObject(person(who.sub), (_instance, state) => ({
      runs: state.storage.sql.exec('SELECT id FROM runs').toArray().length,
      quota: state.storage.sql.exec('SELECT counter FROM quota').toArray().length,
    }));
    expect(kept).toEqual({ runs: 0, quota: 0 });
  }, 120_000);

  it('AC3 audit-worker-status-one-surface: no test-only folder setter, one list of tables, the quota counter internal', () => {
    expect(personSource).not.toMatch(/\bsetFolderId\s*\(/);
    expect(schemaSource).toMatch(/PERSON_TABLES\s*=\s*Object\.keys\(TABLES_AT_DELETE\)/);
    expect(personSource).toMatch(/^\s+private countQuota\(/m);
  });
});
