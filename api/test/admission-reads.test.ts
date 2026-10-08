/**
 * What admission costs in Drive calls and time (TL-P4-04): a folder shaped like staging's (five piles added in the
 * app, each with its list of things and a note, ten notes in the areas, two of your changes), read over a pretend
 * Drive v3 that takes about 150 ms to answer each call, as the live tail measured.
 */
import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';
import { sha256 } from '../../src/data/contracts/hashes.js';
import type { Declaration } from '../../src/data/contracts/pile-declaration.js';
import { DriveHttp } from '../../src/data/drive/drive-http.js';
import { declarationRecord } from '../../src/data/pile-readiness.js';
import type { AdmissionManifest } from '../../src/data/spine/admission.js';
import { planAdmission } from '../../src/data/spine/plan.js';
import { driveRead } from '../../src/data/spine/read.js';
import { driveFolder, type DriveFolder } from './drive-v3.js';

const env = testEnv as unknown as Env;
const APP = 'https://app.example.com';
const EMAIL = 'you@example.com';
/** About what one Drive call took in the live tail. */
const DRIVE_MS = 150;
/** The budget for admission's reads on a folder like staging's. */
const BUDGET_MS = 3000;

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

/** A pile as the app adds it: its declaration in `.bower/piles`, then its folder, its note and its two things. */
async function declaredPile(folder: DriveFolder, piles: string, n: number): Promise<void> {
  const { drive, root, inbox } = folder;
  const content = async (text: string) => ({ size: new TextEncoder().encode(text).byteLength, sha256: await sha256(new Blob([text])) });
  const note = `Papers ${n} from Alex`;
  const things = [`a${n}.pdf`, `b${n}.pdf`].map((name, i) => ({ name, key: `member-${n}-${i}`, text: `%PDF ${name}` }));
  const declaration: Declaration = {
    v: 1,
    kind: 'pile-declaration',
    scope: { rootId: root },
    declarationId: `decl-${n}`,
    pileId: `pile-${n}`,
    createdAt: Date.UTC(2026, 9, 7, 8, n),
    anchor: { kind: 'folder', inboxId: inbox, name: `Papers ${n}`, createKey: `anchor-${n}` },
    members: await Promise.all(things.map(async (t) => ({ memberKey: t.key, name: t.name, kind: 'pdf' as const, origin: 'From this computer', content: { encoding: 'blob' as const, ...(await content(t.text)) } }))),
    context: { kind: 'text', memberKey: `context-${n}`, originalText: note, content: { encoding: 'utf8', ...(await content(note)) } },
  };
  const record = await declarationRecord(declaration, root);
  if (!record) throw new Error('the declaration was refused');
  await drive.createText(piles, record.name, record.text);
  const made = await drive.createFolder(inbox, `Papers ${n}`, { pile: declaration.pileId, bowerDeclaration: declaration.declarationId });
  await drive.createText(made.id, 'Pile note.md', note, { bowerItem: `context-${n}` });
  for (const t of things) await drive.createText(made.id, t.name, t.text, { bowerItem: t.key });
}

/** A folder like staging's: five piles added in the app, ten notes in the areas, two of your changes. */
async function stagingLike(): Promise<DriveFolder> {
  const folder = await driveFolder();
  const { drive, root, bower } = folder;
  const piles = await drive.createFolder(bower, 'piles');
  for (let n = 1; n <= 5; n += 1) await declaredPile(folder, piles.id, n);
  const areas = await drive.createFolder(root, 'Areas');
  for (let i = 1; i <= 10; i += 1) {
    const topic = await drive.createFolder(areas.id, `Topic ${i}`);
    await drive.createText(topic.id, `Note ${i}.md`, `# Note ${i}\n\nSomething Alex keeps.\n`);
  }
  const changes = (await drive.listAll(root)).find((f) => f.folder && f.name === 'changes');
  for (let i = 1; i <= 2; i += 1) {
    const line = { v: 1, id: `change-${i}`, device: 'laptop', at: i, what: 'A rule', kind: 'rule', text: `Receipts go to Money ${i}` };
    await drive.createText(changes?.id ?? '', `change-${i}.json`, JSON.stringify(line));
  }
  return folder;
}

/** Drive calls as the Worker sends them, each answered after `ms`, counted. */
function slowed(folder: DriveFolder, ms: number): { fetchImpl: DriveFolder['fetchImpl']; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    fetchImpl: async (url, init) => {
      if (new URL(url).origin === 'https://www.googleapis.com') {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
      return await folder.fetchImpl(url, init);
    },
  };
}

/** A signed-in person holding the lease, whose folder is `folder`, with a cached Drive token. */
async function holderOf(folder: DriveFolder): Promise<{ sub: string; headers: Record<string, string> }> {
  const sub = `admission-reads-${crypto.randomUUID()}`;
  await env.BOWER_KV.put(allowKey(EMAIL), '1');
  const enc = await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
  const cookie = `${SESSION_COOKIE}=${await signSession({ sub, gen: generation }, env.SESSION_SECRET)}`;
  const epoch = (await person(sub).session('laptop', 'check', 0, Date.now())).epoch;
  await person(sub).setFolderId(folder.root);
  await person(sub).cacheDriveToken({ accessToken: 'access-cached', expiresAt: Date.now() + 3600_000 });
  return { sub, headers: { cookie, origin: APP, 'content-type': 'application/json', 'x-bower-place': 'laptop', 'x-bower-epoch': String(epoch) } };
}

async function press(fetchImpl: DriveFolder['fetchImpl'], headers: Record<string, string>): Promise<Response> {
  const body = JSON.stringify({ scope: 'all', allowWeb: false, requestId: 'press-1' });
  return await createApp({ fetchImpl }).request(`${APP}/process`, { method: 'POST', headers, body }, env);
}

async function storedManifest(sub: string): Promise<AdmissionManifest> {
  const rows = await runInDurableObject(person(sub), (_instance, state) => state.storage.sql.exec('SELECT manifest FROM runs').toArray());
  return JSON.parse(String((rows[0] as { manifest?: unknown } | undefined)?.manifest)) as AdmissionManifest;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('admission reads', () => {
  it('admission reads finish under the budget with modelled Drive latency', async () => {
    const folder = await stagingLike();
    const who = await holderOf(folder);
    const drive = slowed(folder, DRIVE_MS);
    const log = vi.spyOn(console, 'log');
    const r = await press(drive.fetchImpl, who.headers);
    expect(r.status).toBe(200);
    const timing = log.mock.calls.map((args) => String(args[0])).find((line) => line.startsWith('admission timing:')) ?? '';
    const reads = Number(/reads=(\d+)ms/.exec(timing)?.[1] ?? NaN);
    console.info(`modelled admission reads: ${reads} ms in ${drive.calls()} Drive calls`);
    expect(reads).toBeLessThan(BUDGET_MS);
    // All five piles are admitted, with your changes.
    const manifest = await storedManifest(who.sub);
    expect(manifest.piles).toHaveLength(5);
    expect(manifest.piles.every((p) => p.declaration !== null && p.items.length === 3)).toBe(true);
    expect(manifest.journal).toHaveLength(2);
  }, 60_000);

  it('admission reads give the same result in fewer calls', async () => {
    const folder = await stagingLike();
    const who = await holderOf(folder);
    // The shared plan over the plain Drive adapter, as admission read before: the result to match.
    const plain = slowed(folder, 0);
    const http = new DriveHttp({ token: async () => 'access-cached', fetch: async (input, init) => await plain.fetchImpl(String(input), init) });
    const before = await planAdmission(driveRead(http), folder.root, { scope: 'all', clock: () => 0, newId: () => 'same' });
    expect(before.kind).toBe('manifest');
    if (before.kind !== 'manifest') return;
    const now = slowed(folder, 0);
    expect((await press(now.fetchImpl, who.headers)).status).toBe(200);
    const after = await storedManifest(who.sub);
    expect({ ...after, id: 'same', at: 0 }).toEqual(before.manifest);
    console.info(`admission Drive calls: ${plain.calls()} before, ${now.calls()} now`);
    expect(now.calls()).toBeLessThan(plain.calls());
  }, 60_000);
});
