import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { main } from '../src/main';
import { RunnerToken } from '../src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive } from './drive-v3';

const AT = Date.UTC(2026, 9, 7, 9);

/** A token route that answers a new grant per call, each after a tick, and records the URLs it was asked. */
function tokenRoute(): { fetch: (url: string) => Promise<Response>; asked: URL[] } {
  const asked: URL[] = [];
  let minted = 0;
  return {
    asked,
    fetch: async (url) => {
      asked.push(new URL(url));
      await new Promise((r) => setTimeout(r, 5));
      return Response.json({ accessToken: `drive-token-${++minted}`, expiresAt: 1_000_000 + 3_600_000, folderId: 'FOLDER_ID', attempt: 1 });
    },
  };
}

const runnerToken = (fetch: (url: string) => Promise<Response>): RunnerToken =>
  new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch, now: () => 1_000_000 });

describe('audit-runner-token', () => {
  it('AC1 audit-runner-token-fresh-asks-fresh: after a Drive 401 the runner asks the token route with fresh=1', async () => {
    const route = tokenRoute();
    const token = runnerToken(route.fetch);
    await token.token(false);
    await token.token(true);
    expect(route.asked.map((u) => u.searchParams.get('fresh'))).toEqual([null, '1']);
  });

  it('AC2 audit-runner-token-single-flight: parallel callers share one in-flight grant', async () => {
    const route = tokenRoute();
    const token = runnerToken(route.fetch);
    const plain = await Promise.all([token.token(false), token.token(false), token.token(false)]);
    expect(new Set(plain).size).toBe(1);
    expect(route.asked).toHaveLength(1);
    // Two Drive requests refused with 401 at once ask for one fresh token, not two.
    const fresh = await Promise.all([token.token(true), token.token(true)]);
    expect(new Set(fresh).size).toBe(1);
    expect(route.asked).toHaveLength(2);
  });

  it('AC2 audit-runner-token-late-plain: a plain grant that ends after a fresh one never replaces the fresh token', async () => {
    // Spec review round 1 (ruling gap): only the grant still in flight when it settles keeps its token.
    const answers: Array<(token: string) => void> = [];
    const asked: URL[] = [];
    const token = runnerToken((url) => {
      asked.push(new URL(url));
      return new Promise((resolve) => answers.push((accessToken) => resolve(Response.json({ accessToken, expiresAt: 1_000_000 + 3_600_000, folderId: 'FOLDER_ID', attempt: 1 }))));
    });
    const plain = token.token(false);
    await new Promise((r) => setTimeout(r, 0));
    const fresh = token.token(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(asked.map((u) => u.searchParams.get('fresh'))).toEqual([null, '1']);
    answers[1]?.('drive-token-fresh');
    expect(await fresh).toBe('drive-token-fresh');
    answers[0]?.('drive-token-refused');
    await plain;
    expect(await token.token(false)).toBe('drive-token-fresh');
    expect(asked).toHaveLength(2);
  });

  it('AC3 audit-runner-token-one-grant: a new run asks the token route once', async () => {
    const drive = fixedDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const inbox = (await drive.createFolder(root, 'Inbox')).id;
    for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
    const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
    await drive.createFolder(sys, 'changes');
    await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
    await drive.createText(inbox, 'Payslip_Aug.pdf', '%PDF payslip', { pile: 'p-payslip' });
    const pile = (await drive.createFolder(inbox, 'Flat photos', { pile: 'p-photos' })).id;
    await drive.createText(pile, PILE_NOTE, 'The kitchen at the viewing.\n');
    const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
    if (admitted.kind !== 'manifest') throw new Error(`nothing admitted: ${admitted.cause}`);
    const wire = driveV3(drive);
    wire.folderId = root;
    wire.manifest = admitted.manifest;
    // main keeps tokens by the wall clock: grants last an hour from now.
    wire.now = Date.now();
    const dir = await mkdtemp(join(tmpdir(), 'bower-runner-'));
    const event = join(dir, 'event.json');
    await writeFile(event, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: RUN_ID, attempt: 1, ticket: TICKET, scope: 'all', allow_web: false } }));

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: event }, { fetch: wire.fetch })).toBe(0);
    expect(wire.statuses.at(-1)?.phase).toBe('done');
    // The manifest comes from the run's first grant; the Drive token it gave lasts the whole run.
    expect(wire.tokenCalls).toBe(1);
  });
});
