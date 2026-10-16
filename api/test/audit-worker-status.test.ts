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
afterEach(() => { vi.restoreAllMocks(); });

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
    // A list an earlier or later build kept, in a shape this build does not read, and one that is not JSON at all.
    for (const snapshot of ['[{"surprise":true}]', '[{']) {
      const sub = await runWithSnapshot(snapshot);
      const reply = await person(sub).runStatus(10);
      expect(reply.run?.phase, snapshot).toBe('done');
      expect(reply.run && 'questions' in reply.run, snapshot).toBe(false);
    }
    expect(console.error).toHaveBeenCalled();
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
