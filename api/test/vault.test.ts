import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { GOOGLE_TOKEN_URL } from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';
import { OLD_RULES_TEMPLATE, VAULT_TEMPLATE } from '../src/vault.js';
import { RULES_TEMPLATE } from '../../src/data/contracts/rules-format.js';
import { md5Hex } from '../../src/data/contracts/hashes.js';

const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const APP = 'https://app.example.com';
const EMAIL = 'you@example.com';
const FOLDER = 'application/vnd.google-apps.folder';
const DRIVE = 'https://www.googleapis.com';

beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

/** The lease headers each person's window holds (the Worker fences POST /vault), by cookie. */
const leases = new Map<string, Record<string, string>>();

async function someone(): Promise<{ sub: string; cookie: string }> {
  const sub = `vault-sub-${crypto.randomUUID()}`;
  await kv.put(allowKey(EMAIL), '1');
  const enc = await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
  const token = await signSession({ sub, gen: generation }, env.SESSION_SECRET);
  const cookie = `${SESSION_COOKIE}=${token}`;
  const { epoch } = await person(sub).session('laptop', 'take', 0, Date.now());
  leases.set(cookie, { 'x-bower-place': 'laptop', 'x-bower-epoch': String(epoch) });
  return { sub, cookie };
}

/** The Worker forgets the folder pointer (the Drive folder stays), as no product call does. */
async function forgetFolder(sub: string): Promise<void> {
  await runInDurableObject(person(sub), (_instance, state) => { state.storage.sql.exec('UPDATE account SET folder_id = NULL, folder_complete = 0 WHERE id = 1'); });
}

interface Item {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  trashed: boolean;
  appProperties: Record<string, string>;
  content?: string;
  modifiedTime?: string;
}

/** A pretend Google: the token endpoint plus the few Drive v3 calls the route may make, recording every one. */
class FakeGoogle {
  items = new Map<string, Item>();
  calls: { method: string; url: string }[] = [];
  /** Create the next folder, then lose the answer (the network drops it). */
  loseNextFolderReply = false;
  /** Fail the next folder create before Drive makes anything (503). */
  failNextFolderCreate = false;
  /** Fail the next upload of a file with this name (503), once. */
  failUploadNamed: string | null = null;
  /** Answer the marker search this many ms late (two calls overlap). */
  markedListDelayMs = 0;
  /** The marked-folder list stays unanswered until this settles (an answer held back by the test, not by the clock). */
  markedListHold: Promise<void> | null = null;
  /** The marker search finds nothing (Drive's search lags behind a create). */
  searchBlind = false;
  /** Hold the next upload of a file with this name until `release` is called; `stalled` resolves when it is held. */
  stallUploadNamed: string | null = null;
  release: () => void = () => undefined;
  stalled: Promise<void> = Promise.resolve();
  /** Refuse the next upload of a file with this name outright, once (Drive's 400 for an id it will not take). */
  refuseUploadNamed: string | null = null;
  /** Make the next upload of a file with this name, then lose its answer and fail its read-back by id, once. */
  loseUploadReplyNamed: string | null = null;
  /** Refuse the next read of this id (403), once: a lost answer's read-back fails too. */
  refuseNextGetOf: string | null = null;
  /** Runs once, right after a file's text is read: another device changes it between our read and our write. */
  afterMediaRead: (() => void) | null = null;
  private n = 0;
  private reserved = 0;
  private clock = 0;

  readonly fetchImpl: FetchLike = async (input, init) => {
    const method = init?.method ?? 'GET';
    const url = new URL(input);
    if (input === GOOGLE_TOKEN_URL) return Response.json({ access_token: 'access-1', expires_in: 3599 });
    this.calls.push({ method, url: `${url.pathname}${url.search}` });
    if (url.origin !== DRIVE) throw new Error(`unexpected fetch in test: ${input}`);
    if (url.pathname === '/drive/v3/files/generateIds' && method === 'GET') {
      const count = Number(url.searchParams.get('count') ?? '10');
      const ids = Array.from({ length: count }, () => `reserved-${(this.reserved += 1)}`);
      return Response.json({ ids, space: 'drive', kind: 'drive#generatedIds' });
    }
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      // The answer is what Drive held when asked, delivered late.
      const answer = this.list(q);
      if (q.includes('appProperties has') && this.markedListHold) await this.markedListHold;
      if (q.includes('appProperties has') && this.markedListDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.markedListDelayMs));
      }
      return answer;
    }
    if (url.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
      const asked = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      if (this.refuseNextGetOf === asked) {
        this.refuseNextGetOf = null;
        return Response.json({ error: { code: 403, errors: [{ reason: 'forbidden' }] } }, { status: 403 });
      }
      const item = this.items.get(asked);
      if (item === undefined) return Response.json({ error: { code: 404 } }, { status: 404 });
      if (url.searchParams.get('alt') === 'media') {
        const text = item.content ?? '';
        const hook = this.afterMediaRead;
        this.afterMediaRead = null;
        hook?.();
        return new Response(text);
      }
      return Response.json(answered(item));
    }
    if (url.pathname.startsWith('/upload/drive/v3/files/') && method === 'PATCH') {
      const item = this.items.get(decodeURIComponent(url.pathname.split('/').pop() ?? ''));
      if (item === undefined) return Response.json({ error: { code: 404 } }, { status: 404 });
      const { metadata, content } = parseMultipart(typeof init?.body === 'string' ? init.body : await new Response(init?.body).text());
      item.content = content;
      item.appProperties = { ...item.appProperties, ...metadata.appProperties };
      item.modifiedTime = this.tick();
      return Response.json(answered(item));
    }
    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as Partial<Item>;
      if (this.failNextFolderCreate) {
        this.failNextFolderCreate = false;
        return Response.json({ error: { code: 503 } }, { status: 503 });
      }
      // Drive refuses a second file with an id it already has (files.create with a generated id).
      if (body.id !== undefined && this.items.has(body.id)) return Response.json({ error: { code: 409 } }, { status: 409 });
      const item = this.add({ ...body, mimeType: body.mimeType ?? FOLDER });
      if (this.loseNextFolderReply) {
        this.loseNextFolderReply = false;
        throw new TypeError('network lost');
      }
      return Response.json(item);
    }
    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const { metadata, content } = parseMultipart(typeof init?.body === 'string' ? init.body : await new Response(init?.body).text());
      if (this.stallUploadNamed !== null && metadata.name === this.stallUploadNamed) {
        this.stallUploadNamed = null;
        await new Promise<void>((resolve) => {
          this.release = resolve;
          this.markStalled();
        });
      }
      if (metadata.id !== undefined && this.items.has(metadata.id)) return Response.json({ error: { code: 409 } }, { status: 409 });
      if (this.failUploadNamed !== null && metadata.name === this.failUploadNamed) {
        this.failUploadNamed = null;
        return Response.json({ error: { code: 503 } }, { status: 503 });
      }
      if (this.refuseUploadNamed !== null && metadata.name === this.refuseUploadNamed) {
        this.refuseUploadNamed = null;
        return Response.json({ error: { code: 400, errors: [{ reason: 'badRequest' }] } }, { status: 400 });
      }
      const item = this.add({ ...metadata, content, mimeType: metadata.mimeType ?? 'text/plain' });
      if (this.loseUploadReplyNamed !== null && metadata.name === this.loseUploadReplyNamed) {
        this.loseUploadReplyNamed = null;
        // Its read-back by id fails once too, so the call cannot tell whether it landed.
        this.refuseNextGetOf = item.id;
        throw new TypeError('network lost');
      }
      return Response.json(answered(item));
    }
    return Response.json({ error: 'unexpected' }, { status: 500 });
  };

  private markStalled: () => void = () => undefined;
  /** Arm a stall: the next upload named `name` waits for `release()`. */
  stallNext(name: string): void {
    this.stallUploadNamed = name;
    this.stalled = new Promise<void>((resolve) => {
      this.markStalled = resolve;
    });
  }

  tick(): string {
    this.clock += 1;
    return new Date(Date.UTC(2026, 9, 7, 8, 0, 0) + this.clock * 1000).toISOString();
  }

  add(partial: Partial<Item>): Item {
    this.n += 1;
    const item: Item = {
      id: partial.id ?? `drive-${this.n}`,
      name: partial.name ?? 'x',
      mimeType: partial.mimeType ?? FOLDER,
      parents: partial.parents ?? [],
      trashed: false,
      appProperties: partial.appProperties ?? {},
      modifiedTime: this.tick(),
      ...(partial.content === undefined ? {} : { content: partial.content }),
    };
    this.items.set(item.id, item);
    return item;
  }

  private list(q: string): Response {
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    const marked = q.includes('appProperties has');
    const named = /name = '([^']+)'/.exec(q)?.[1];
    if (marked && this.searchBlind) return Response.json({ files: [] });
    const files = [...this.items.values()].filter(
      (i) => !i.trashed && (parent === undefined || i.parents.includes(parent)) && (named === undefined || i.name === named) && (!marked || i.appProperties['bowerFolder'] === '1'),
    );
    return Response.json({ files });
  }

  get created(): Item[] {
    return [...this.items.values()];
  }
  get marked(): Item[] {
    return this.created.filter((i) => i.appProperties['bowerFolder'] === '1');
  }
  /** Every path of the folder `root`, `/`-joined. */
  paths(root: string): string[] {
    const out: string[] = [];
    const walk = (id: string, prefix: string): void => {
      for (const i of this.items.values()) {
        if (!i.parents.includes(id)) continue;
        out.push(`${prefix}${i.name}`);
        if (i.mimeType === FOLDER) walk(i.id, `${prefix}${i.name}/`);
      }
    };
    walk(root, '');
    return out;
  }
}

/** A file as Drive answers it when `fields` asks for its `md5Checksum` (every write and read of a text does). */
const answered = (item: Item): Item & { md5Checksum?: string } => (item.content === undefined ? item : { ...item, md5Checksum: md5Hex(new TextEncoder().encode(item.content)) });

/** The metadata and the text of a Drive multipart upload. */
function parseMultipart(raw: string): { metadata: Partial<Item>; content: string } {
  const [meta, media] = `\r\n${raw}`.split(/\r\n--bower[-0-9a-z]*(?:\r\n)?/).filter((p) => p.trim() !== '');
  const metadata = JSON.parse((meta ?? '').split('\r\n\r\n')[1] ?? '{}') as Partial<Item>;
  const text = media ?? '';
  const content = text.slice(text.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
  return { metadata, content };
}

async function post(g: FakeGoogle, cookie: string, lease: Record<string, string> = leases.get(cookie) ?? {}): Promise<Response> {
  return await createApp({ fetchImpl: g.fetchImpl }).request(
    `${APP}/vault`,
    { method: 'POST', headers: { cookie, origin: APP, 'content-type': 'application/json', ...lease }, body: '{}' },
    env,
  );
}

const body = async (r: Response) => (await r.json()) as { folderId: string; found: boolean };
/** What the template should leave in the folder: every file, and the folder of every path. */
const expectedPaths = (): string[] => {
  const out = new Set<string>();
  for (const { path } of VAULT_TEMPLATE) {
    const parts = path.split('/');
    parts.forEach((_, i) => {
      const p = parts.slice(0, i + 1).join('/');
      if (!p.endsWith('.gitkeep')) out.add(p);
    });
  }
  return [...out];
};

describe('POST /vault', () => {
  it('the real template writes Rules.md as the fake does', async () => {
    const { cookie } = await someone();
    const g = new FakeGoogle();
    const { folderId } = await body(await post(g, cookie));
    const real = [...g.items.values()].find((i) => i.name === 'Rules.md' && i.parents.includes(folderId));

    if (real === undefined) throw new Error('Rules.md missing');
    // The fake Worker makes its Rules.md from the same constant (`fake-worker.test.ts` checks that side).
    expect(real.content).toBe(RULES_TEMPLATE.text);
    expect(real.appProperties).toEqual(RULES_TEMPLATE.appProperties);
    expect(real.appProperties).toEqual({ by: 'bower' });
  });

  it('the old template Rules.md is repaired once and nothing else is touched', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    const { folderId } = await body(await post(g, cookie));
    const rules = [...g.items.values()].find((i) => i.name === 'Rules.md' && i.parents.includes(folderId));
    if (rules === undefined) throw new Error('Rules.md missing');
    const patches = (): number => g.calls.filter((c) => c.method === 'PATCH').length;
    const snapshot = (): string => JSON.stringify([...g.items.values()].filter((i) => i.id !== rules.id));

    // A folder made before the fix: the old text, no mark.
    rules.content = OLD_RULES_TEMPLATE;
    rules.appProperties = {};
    const others = snapshot();
    await post(g, cookie);
    expect(rules.content).toBe(RULES_TEMPLATE.text);
    // With the stamp it was sent with (`write-once.ts`).
    expect(rules.appProperties).toEqual({ by: 'bower', bowerOp: expect.any(String) });
    expect(patches()).toBe(1);
    expect(snapshot()).toBe(others);
    // Once: the second check sends no write.
    await post(g, cookie);
    expect(patches()).toBe(1);

    // Anything else is left as it is: a Rules.md the person edited, and the original app's plain file.
    for (const text of [`${OLD_RULES_TEMPLATE}\n- Receipts go to Money.\n`, '# Rules\n\nPlain file from the original app.\n', `${OLD_RULES_TEMPLATE} `]) {
      rules.content = text;
      rules.appProperties = {};
      await post(g, cookie);
      expect(rules.content).toBe(text);
      expect(rules.appProperties).toEqual({});
    }
    expect(patches()).toBe(1);

    // Changed between our read and our write: still as seen, or no write.
    rules.content = OLD_RULES_TEMPLATE;
    g.afterMediaRead = () => {
      rules.content = `${OLD_RULES_TEMPLATE}\n- Typed on another device.\n`;
      rules.modifiedTime = g.tick();
    };
    await post(g, cookie);
    expect(rules.content).toBe(`${OLD_RULES_TEMPLATE}\n- Typed on another device.\n`);
    expect(patches()).toBe(1);
    expect(g.calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(await person(sub).folderId()).toBe(folderId);
  });

  it('vault makes a new Bower folder from the template', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    const response = await post(g, cookie);
    expect(response.status).toBe(200);
    const result = await body(response);
    expect(result.found).toBe(false);
    expect(g.marked).toHaveLength(1);
    expect(g.marked[0]?.id).toBe(result.folderId);
    expect(g.paths(result.folderId).sort()).toEqual(expectedPaths().sort());
    expect(g.paths(result.folderId)).toEqual(expect.arrayContaining(['Inbox', 'Projects', 'Areas', 'Resources', 'Archive', 'Rules.md', 'About me.md', '.bower']));
    expect(await person(sub).folderId()).toBe(result.folderId);
  });

  it('vault finds the existing Bower folder and says found', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    const first = await body(await post(g, cookie));
    // The person signs out and in again: the Worker forgot the pointer, the Drive folder stayed.
    await forgetFolder(sub);
    const before = g.created.length;
    const again = await post(g, cookie);
    expect(await body(again)).toEqual({ folderId: first.folderId, found: true });
    expect(g.created).toHaveLength(before);
    expect(await person(sub).folderId()).toBe(first.folderId);
    // With the pointer kept, it is answered after one check of the folder.
    expect(await body(await post(g, cookie))).toEqual({ folderId: first.folderId, found: true });
  });

  it('vault makes a new folder when the pointed folder is in the Bin', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    const first = await body(await post(g, cookie));
    const old = g.items.get(first.folderId);
    if (old === undefined) throw new Error('missing');
    old.trashed = true;
    const second = await body(await post(g, cookie));
    expect(second.found).toBe(false);
    expect(second.folderId).not.toBe(first.folderId);
    expect(await person(sub).folderId()).toBe(second.folderId);
  });

  it('vault never deletes or overwrites anything in Drive', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    await post(g, cookie);
    await forgetFolder(sub);
    await post(g, cookie);
    await post(g, cookie);
    const writes = g.calls.filter((c) => c.method !== 'GET');
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((c) => c.method === 'POST' && (c.url.startsWith('/drive/v3/files?') || c.url.startsWith('/upload/drive/v3/files?')))).toBe(true);
    expect(g.calls.some((c) => ['DELETE', 'PUT'].includes(c.method))).toBe(false);
    expect(g.calls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(g.calls.some((c) => c.url.includes('/files/') && c.method !== 'GET')).toBe(false);
  });

  it('vault does not make a second folder after a lost reply', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    g.loseNextFolderReply = true;
    // Drive's search has not caught up with the create yet: only the reserved id can tell.
    g.searchBlind = true;
    // The create whose reply was lost is read back by its reserved id in the same call (`createById`).
    const made = await body(await post(g, cookie));
    expect(made.found).toBe(false);
    expect(g.marked).toHaveLength(1);
    expect(made.folderId).toBe(g.marked[0]?.id);
    expect(g.paths(made.folderId).sort()).toEqual(expectedPaths().sort());
    expect(await person(sub).folderId()).toBe(made.folderId);
    // A retry finds it, still one folder.
    expect((await body(await post(g, cookie))).folderId).toBe(made.folderId);
    expect(g.marked).toHaveLength(1);
  });

  it('a reserved folder id that was never created is created on the next call', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    g.failNextFolderCreate = true;
    expect((await post(g, cookie)).status).toBe(500);
    expect(g.marked).toHaveLength(0);
    const retry = await body(await post(g, cookie));
    expect(retry).toEqual({ folderId: 'reserved-1', found: false });
    expect(g.marked.map((i) => i.id)).toEqual(['reserved-1']);
    expect(g.calls.filter((c) => c.url.startsWith('/drive/v3/files/generateIds'))).toHaveLength(1);
    expect(g.paths(retry.folderId).sort()).toEqual(expectedPaths().sort());
    expect(await person(sub).folderId()).toBe('reserved-1');
  });

  it('a failure mid-fill is completed on the next call', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    g.failUploadNamed = 'Rules.md';
    expect((await post(g, cookie)).status).toBe(500);
    expect(g.marked).toHaveLength(1);
    const retry = await body(await post(g, cookie));
    expect(retry.found).toBe(false);
    const paths = g.paths(retry.folderId);
    // Every path present, nothing created twice.
    expect(paths.sort()).toEqual(expectedPaths().sort());
    expect(new Set(paths).size).toBe(paths.length);
    expect(g.marked).toHaveLength(1);
    expect(await person(sub).folderId()).toBe(retry.folderId);
  });

  it("the template files' ids are reserved with the folder's", async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    g.failUploadNamed = 'Rules.md';
    expect((await post(g, cookie)).status).toBe(500);
    // One generateIds call reserved the folder id and one id per template folder and file.
    const generate = g.calls.filter((c) => c.url.startsWith('/drive/v3/files/generateIds'));
    expect(generate).toHaveLength(1);
    expect(new URLSearchParams(generate[0]?.url.split('?')[1]).get('count')).toBe(String(expectedPaths().length + 1));
    // All of them are kept in the person object, with the pointer, and every create used one.
    const state = await person(sub).vaultState();
    expect(state.pending).toBe('reserved-1');
    expect(state.templateIds?.folderId).toBe('reserved-1');
    expect(Object.keys(state.templateIds?.ids ?? {}).sort()).toEqual(expectedPaths().sort());
    const reservedIds = new Set(Object.values(state.templateIds?.ids ?? {}));
    expect(reservedIds.size).toBe(expectedPaths().length);
    expect(g.created.every((i) => i.id === 'reserved-1' || reservedIds.has(i.id))).toBe(true);
    // The retry reserves nothing new and, once complete, the ids are forgotten.
    const retry = await body(await post(g, cookie));
    expect(g.calls.filter((c) => c.url.startsWith('/drive/v3/files/generateIds'))).toHaveLength(1);
    expect(g.paths(retry.folderId).sort()).toEqual(expectedPaths().sort());
    expect((await person(sub).vaultState()).templateIds).toBeNull();
  });

  it('the Worker template retried after a lost answer makes one file per intent', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    // Rules.md is made but its answer is lost, and the read-back by its reserved id fails too: not known whether it landed.
    g.loseUploadReplyNamed = 'Rules.md';
    expect((await post(g, cookie)).status).toBe(500);
    const kept = (await person(sub).vaultState()).templateIds?.ids['Rules.md'];
    expect(kept).toBeDefined();
    expect(g.created.filter((i) => i.name === 'Rules.md').map((i) => i.id)).toEqual([kept]);
    // The retry sends that same id: Drive's 409 says it is there, found by its id, so one file per path.
    const retry = await body(await post(g, cookie));
    const paths = g.paths(retry.folderId);
    expect(paths.sort()).toEqual(expectedPaths().sort());
    expect(new Set(paths).size).toBe(paths.length);
    expect(g.created.filter((i) => i.name === 'Rules.md').map((i) => i.id)).toEqual([kept]);
    expect(g.calls.filter((c) => c.url.startsWith('/drive/v3/files/generateIds'))).toHaveLength(1);
  });

  it('the Worker keeps reserved ids in Durable Object storage through the write-once port', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    // Every id is kept in the person object before the first create; a create refused outright (a permanent 4xx)
    // lets its own id go there, and only that one: the next call reserves anew for it and keeps the others.
    g.refuseUploadNamed = 'Rules.md';
    expect((await post(g, cookie)).status).toBe(500);
    const after = await person(sub).vaultState();
    expect(after.pending).toBe('reserved-1');
    const ids = after.templateIds?.ids ?? {};
    expect(ids['Rules.md']).toBeUndefined();
    expect(Object.keys(ids).sort()).toEqual(expectedPaths().filter((p) => p !== 'Rules.md').sort());
    const retry = await body(await post(g, cookie));
    const generate = g.calls.filter((c) => c.url.startsWith('/drive/v3/files/generateIds'));
    expect(generate).toHaveLength(2);
    expect(new URLSearchParams(generate[1]?.url.split('?')[1]).get('count')).toBe('1');
    const rules = g.created.filter((i) => i.name === 'Rules.md');
    expect(rules).toHaveLength(1);
    expect(Object.values(ids)).not.toContain(rules[0]?.id);
    const paths = g.paths(retry.folderId);
    expect(paths.sort()).toEqual(expectedPaths().sort());
    expect(new Set(paths).size).toBe(paths.length);
    expect((await person(sub).vaultState()).templateIds).toBeNull();
  });

  it('a fill resumed after the claim expires makes no duplicate file', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    g.stallNext('Rules.md');
    const first = post(g, cookie);
    await g.stalled;
    // The first call is stuck past its 60 s claim (lapsed here without waiting).
    await runInDurableObject(person(sub), (_instance, state) => {
      state.storage.sql.exec('UPDATE account SET vault_claim_until = 0 WHERE id = 1');
    });
    const second = await post(g, cookie);
    expect(second.status).toBe(200);
    const done = await body(second);
    g.release();
    const resumed = await first;
    expect(resumed.status).toBe(200);
    const paths = g.paths(done.folderId);
    expect(paths.sort()).toEqual(expectedPaths().sort());
    expect(new Set(paths).size).toBe(paths.length);
    expect(g.marked).toHaveLength(1);
  });

  it('a complete folder is not filled again', async () => {
    const { cookie } = await someone();
    const g = new FakeGoogle();
    const first = await body(await post(g, cookie));
    // The person deletes a file on purpose: once the folder was complete, Bower leaves it be.
    const rules = [...g.items.values()].find((i) => i.name === 'Rules.md' && i.parents.includes(first.folderId));
    if (rules === undefined) throw new Error('missing');
    rules.trashed = true;
    const before = g.calls.length;
    expect(await body(await post(g, cookie))).toEqual({ folderId: first.folderId, found: true });
    const later = g.calls.slice(before);
    // One look at the pointed folder, and the one look for an old-template Rules.md (`repairRules`): reads only.
    expect(later.every((c) => c.method === 'GET' && (c.url.startsWith(`/drive/v3/files/${first.folderId}?`) || c.url.startsWith('/drive/v3/files?')))).toBe(true);
    expect([...g.items.values()].filter((i) => i.name === 'Rules.md' && !i.trashed)).toHaveLength(0);
  });

  it('two first calls at once make one Bower folder', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    g.markedListDelayMs = 50;
    const [a, b] = await Promise.all([post(g, cookie), post(g, cookie)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const [ra, rb] = [await body(a), await body(b)];
    expect(g.marked).toHaveLength(1);
    expect(ra.folderId).toBe(g.marked[0]?.id);
    expect(rb.folderId).toBe(ra.folderId);
    expect([ra.found, rb.found].sort()).toEqual([false, true]);
    const paths = g.paths(ra.folderId);
    expect(paths.sort()).toEqual(expectedPaths().sort());
    expect(new Set(paths).size).toBe(paths.length);
    expect(await person(sub).folderId()).toBe(ra.folderId);
  });

  it('GET /me answers the folder pointer after POST /vault', async () => {
    const { cookie } = await someone();
    const g = new FakeGoogle();
    const me = async () =>
      (await (await createApp({ fetchImpl: g.fetchImpl }).request(`${APP}/me`, { headers: { cookie } }, env)).json()) as {
        folderId: string | null;
      };
    expect((await me()).folderId).toBeNull();
    const made = await body(await post(g, cookie));
    expect((await me()).folderId).toBe(made.folderId);
  });

  it('vault needs a session and the app origin', async () => {
    const g = new FakeGoogle();
    const none = await createApp({ fetchImpl: g.fetchImpl }).request(`${APP}/vault`, { method: 'POST', headers: { origin: APP } }, env);
    expect(none.status).toBe(401);
    const { cookie } = await someone();
    const wrong = await createApp({ fetchImpl: g.fetchImpl }).request(`${APP}/vault`, { method: 'POST', headers: { cookie, origin: 'https://evil.example.com' } }, env);
    expect(wrong.status).toBe(403);
    expect(g.calls).toHaveLength(0);
  });

  it('POST /vault refuses a stale or missing session epoch', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    const holder = leases.get(cookie) ?? {};
    const epoch = Number(holder['x-bower-epoch']);
    const refused = async (lease: Record<string, string>) => {
      const r = await post(g, cookie, lease);
      expect(r.status, JSON.stringify(lease)).toBe(409);
      expect(await r.json()).toEqual({ error: { code: 'stale-session', message: 'Bower is open in another window.' } });
    };
    await refused({});
    await refused({ 'x-bower-place': 'laptop' });
    await refused({ 'x-bower-place': 'laptop', 'x-bower-epoch': 'one' });
    await refused({ 'x-bower-place': 'laptop', 'x-bower-epoch': String(epoch - 1) });
    await refused({ 'x-bower-place': 'phone', 'x-bower-epoch': String(epoch) });
    expect(g.calls).toHaveLength(0);
    // The holder's epoch works as before.
    expect((await post(g, cookie)).status).toBe(200);
    // Another place takes it: the old holder's epoch is stale now, the new one's works.
    const moved = await person(sub).session('phone', 'take', 0, Date.now());
    await refused(holder);
    expect((await post(g, cookie, { 'x-bower-place': 'phone', 'x-bower-epoch': String(moved.epoch) })).status).toBe(200);
  });
});

describe('POST /vault after a lapsed claim', () => {
  const lapse = async (sub: string) =>
    runInDurableObject(person(sub), (_i, state) => {
      state.storage.sql.exec('UPDATE account SET vault_claim_until = 0 WHERE id = 1');
    });
  const until = async (cond: () => boolean) => {
    for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  };

  it('a call whose claim lapsed before reserving makes no second folder', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    let answer: () => void = () => undefined;
    g.markedListHold = new Promise<void>((resolve) => { answer = resolve; });
    const a = post(g, cookie);
    await until(() => g.calls.some((c) => c.url.includes('appProperties')));
    await lapse(sub);
    g.markedListHold = null;
    const b = await body(await post(g, cookie));
    answer();
    expect((await a).status).toBe(200);
    expect(g.marked).toHaveLength(1);
    expect(await person(sub).folderId()).toBe(b.folderId);
  });

  it('a lapsed call on a found folder makes no duplicate item', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    const m = g.add({ name: 'Bower', mimeType: FOLDER, appProperties: { bowerFolder: '1' } });
    const inner = g.fetchImpl;
    let held = false;
    let releaseGen: () => void = () => undefined;
    (g as unknown as { fetchImpl: typeof inner }).fetchImpl = async (input, init) => {
      if (String(input).includes('generateIds') && !held) {
        held = true;
        await new Promise<void>((r) => { releaseGen = r; });
      }
      return inner(input, init);
    };
    const a = post(g, cookie);
    await until(() => held);
    await lapse(sub);
    g.stallNext('Rules.md');
    const b = post(g, cookie);
    await g.stalled;
    releaseGen();
    expect((await a).status).toBe(200);
    g.release();
    expect((await b).status).toBe(200);
    const paths = g.paths(m.id);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('POST /vault over the Drive transport', () => {
  it('a Drive read that loses the network waits the options it was given, not a real backoff', async () => {
    const { cookie } = await someone();
    const g = new FakeGoogle();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const slept: number[] = [];
    const pacing = { baseMs: 0, sleep: (ms: number): Promise<void> => { slept.push(ms); return Promise.resolve(); } };
    const down: FetchLike = async (input, init) => {
      if (input === GOOGLE_TOKEN_URL) return g.fetchImpl(input, init);
      throw new TypeError('network lost');
    };
    const t0 = Date.now();
    const res = await createApp({ fetchImpl: down, pacing }).request(`${APP}/vault`, { method: 'POST', headers: { cookie, origin: APP, 'content-type': 'application/json', ...(leases.get(cookie) ?? {}) }, body: '{}' }, env);
    expect(res.status).toBe(500);
    expect(slept).toHaveLength(3);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe('POST /vault repairs Rules without a blind resend', () => {
  it('a repair PATCH that landed and answered 503 is not sent again', async () => {
    const { cookie } = await someone();
    const g = new FakeGoogle();
    const { folderId } = await body(await post(g, cookie));
    const rules = [...g.items.values()].find((i) => i.name === 'Rules.md' && i.parents.includes(folderId));
    if (rules === undefined) throw new Error('Rules.md missing');
    rules.content = OLD_RULES_TEMPLATE;
    rules.appProperties = {};
    const inner = g.fetchImpl;
    let patches = 0;
    (g as unknown as { fetchImpl: typeof inner }).fetchImpl = async (input, init) => {
      const res = await inner(input, init);
      if ((init?.method ?? 'GET') === 'PATCH') {
        patches += 1;
        if (patches === 1) {
          // Landed; the person types a rule on another device; Google answers 503.
          rules.content = `${RULES_TEMPLATE.text}\n- Typed on another device.\n`;
          rules.modifiedTime = g.tick();
          return Response.json({ error: { code: 503 } }, { status: 503 });
        }
      }
      return res;
    };
    await post(g, cookie);
    expect(rules.content).toBe(`${RULES_TEMPLATE.text}\n- Typed on another device.\n`);
    expect(patches).toBe(1);
  });
});

describe('c2-create-by-id fix round: the Worker repair by its stamp', () => {
  it("the Worker's Rules.md repair whose answer was lost is resolved by its stamp", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cookie } = await someone();
    const g = new FakeGoogle();
    const { folderId } = await body(await post(g, cookie));
    const rules = [...g.items.values()].find((i) => i.name === 'Rules.md' && i.parents.includes(folderId));
    if (rules === undefined) throw new Error('Rules.md missing');
    rules.content = OLD_RULES_TEMPLATE;
    rules.appProperties = {};
    const inner = g.fetchImpl;
    let patches = 0;
    (g as unknown as { fetchImpl: typeof inner }).fetchImpl = async (input, init) => {
      const res = await inner(input, init);
      // The repair lands and its answer is lost.
      if ((init?.method ?? 'GET') === 'PATCH' && (patches += 1) === 1) throw new TypeError('network lost');
      return res;
    };
    expect((await post(g, cookie)).status).toBe(200);
    expect(patches).toBe(1);
    expect(rules.content).toBe(RULES_TEMPLATE.text);
    expect(rules.appProperties).toMatchObject({ by: 'bower', bowerOp: expect.any(String) });
  });
});

describe('POST /vault against delete me and sign-out', () => {
  /** A Drive fetch that holds the first folder-id request until `release` is called. */
  function held(g: FakeGoogle): { release: () => void; reached: () => boolean } {
    const inner = g.fetchImpl;
    let reached = false;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    (g as unknown as { fetchImpl: typeof inner }).fetchImpl = async (input, init) => {
      if (String(input).includes('generateIds') && !reached) {
        reached = true;
        await gate;
      }
      return inner(input, init);
    };
    return { release, reached: () => reached };
  }
  const until = async (cond: () => boolean) => {
    for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  };
  const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

  it('a folder request that started before delete me writes nothing after it', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    const hold = held(g);
    const a = post(g, cookie);
    await until(hold.reached);
    const del = await createApp({ fetchImpl: async () => new Response('{}') }).request(
      `${APP}/me`,
      { method: 'DELETE', headers: { cookie, origin: APP, ...leases.get(cookie) } },
      env,
    );
    expect(del.status).toBe(204);
    hold.release();
    const r = await a;
    expect(r.status).toBe(401);
    expect(await code(r)).toBe('signed-out');
    expect(await person(sub).account()).toBeNull();
    expect(await person(sub).folderId()).toBeNull();
    await runInDurableObject(person(sub), (_i, state) => {
      const rows = state.storage.sql.exec('SELECT * FROM account').toArray();
      expect(rows).toHaveLength(0);
    });
  });

  it('a folder request that started before sign-out writes nothing after it', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    const hold = held(g);
    const a = post(g, cookie);
    await until(hold.reached);
    expect(await person(sub).retireSessions()).not.toBeNull();
    hold.release();
    const r = await a;
    expect(r.status).toBe(401);
    expect(await code(r)).toBe('signed-out');
    expect(await person(sub).folderId()).toBeNull();
    await runInDurableObject(person(sub), (_i, state) => {
      const row = state.storage.sql
        .exec<{ pending_folder_id: string | null }>('SELECT pending_folder_id FROM account WHERE id = 1')
        .toArray()[0];
      expect(row?.pending_folder_id).toBeNull();
    });
  });
});

/**
 * c4-retry-fence (TL-P4-24 finding 1): the Worker's `replaceText` through `POST /vault`, its repair PATCH answered 429
 * while the person types a rule on another device. The resend reads the file again first, and the change stops it.
 */
describe('POST /vault repairs Rules with a fence before any resend', () => {
  const pacing = { baseMs: 0, sleep: (): Promise<void> => Promise.resolve() };
  async function rateLimitedRepair(typedElsewhere: boolean): Promise<{ patches: () => number; rules: Item }> {
    const { cookie } = await someone();
    const g = new FakeGoogle();
    const { folderId } = await body(await post(g, cookie));
    const rules = [...g.items.values()].find((i) => i.name === 'Rules.md' && i.parents.includes(folderId));
    if (rules === undefined) throw new Error('Rules.md missing');
    rules.content = OLD_RULES_TEMPLATE;
    rules.appProperties = {};
    const inner = g.fetchImpl;
    let patches = 0;
    const limited: FetchLike = async (input, init) => {
      if ((init?.method ?? 'GET') === 'PATCH' && ++patches === 1) {
        if (typedElsewhere) {
          rules.content = `${OLD_RULES_TEMPLATE}\n- Typed on another device.\n`;
          rules.modifiedTime = g.tick();
        }
        return Response.json({ error: { code: 429, message: 'Slow down.', errors: [] } }, { status: 429 });
      }
      return inner(input, init);
    };
    const res = await createApp({ fetchImpl: limited, pacing }).request(`${APP}/vault`, { method: 'POST', headers: { cookie, origin: APP, 'content-type': 'application/json', ...(leases.get(cookie) ?? {}) }, body: '{}' }, env);
    expect(res.status).toBe(200);
    return { patches: () => patches, rules };
  }

  it('a repair answered 429 while the person typed a rule elsewhere is not sent again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { patches, rules } = await rateLimitedRepair(true);
    expect(patches()).toBe(1);
    expect(rules.content).toBe(`${OLD_RULES_TEMPLATE}\n- Typed on another device.\n`);
  });

  it('a repair answered 429 with nothing changed lands on the resend', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { patches, rules } = await rateLimitedRepair(false);
    expect(patches()).toBe(2);
    expect(rules.content).toBe(RULES_TEMPLATE.text);
  });
});
