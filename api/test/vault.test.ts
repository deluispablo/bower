import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { GOOGLE_TOKEN_URL } from '../src/google.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';
import { TEMPLATE_FILES } from '../src/template.generated.js';

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

async function someone(): Promise<{ sub: string; cookie: string }> {
  const sub = `vault-sub-${crypto.randomUUID()}`;
  await kv.put(allowKey(EMAIL), '1');
  const enc = await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
  const token = await signSession({ sub, gen: generation }, env.SESSION_SECRET);
  return { sub, cookie: `${SESSION_COOKIE}=${token}` };
}

interface Item {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  trashed: boolean;
  appProperties: Record<string, string>;
  content?: string;
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
  /** The marker search finds nothing (Drive's search lags behind a create). */
  searchBlind = false;
  /** Hold the next upload of a file with this name until `release` is called; `stalled` resolves when it is held. */
  stallUploadNamed: string | null = null;
  release: () => void = () => undefined;
  stalled: Promise<void> = Promise.resolve();
  private n = 0;
  private reserved = 0;

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
      if (q.includes('appProperties has') && this.markedListDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.markedListDelayMs));
      }
      return answer;
    }
    if (url.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
      const item = this.items.get(decodeURIComponent(url.pathname.split('/').pop() ?? ''));
      return item === undefined ? Response.json({ error: { code: 404 } }, { status: 404 }) : Response.json(item);
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
      const [meta] = String(init?.body).split(/--bower-[0-9a-f-]+(?:--)?\r\n?/).filter((p) => p.trim() !== '');
      const metadata = JSON.parse((meta ?? '').split('\r\n\r\n')[1] ?? '{}') as Partial<Item>;
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
      return Response.json(this.add({ ...metadata, mimeType: metadata.mimeType ?? 'text/plain' }));
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

  add(partial: Partial<Item>): Item {
    this.n += 1;
    const item: Item = {
      id: partial.id ?? `drive-${this.n}`,
      name: partial.name ?? 'x',
      mimeType: partial.mimeType ?? FOLDER,
      parents: partial.parents ?? [],
      trashed: false,
      appProperties: partial.appProperties ?? {},
    };
    this.items.set(item.id, item);
    return item;
  }

  private list(q: string): Response {
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    const marked = q.includes('appProperties has');
    if (marked && this.searchBlind) return Response.json({ files: [] });
    const files = [...this.items.values()].filter(
      (i) => !i.trashed && (parent === undefined || i.parents.includes(parent)) && (!marked || i.appProperties['bowerFolder'] === '1'),
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

async function post(g: FakeGoogle, cookie: string): Promise<Response> {
  return await createApp({ fetchImpl: g.fetchImpl }).request(
    `${APP}/vault`,
    { method: 'POST', headers: { cookie, origin: APP, 'content-type': 'application/json' }, body: '{}' },
    env,
  );
}

const body = async (r: Response) => (await r.json()) as { folderId: string; found: boolean };
/** What the template should leave in the folder: every file, and the folder of every path. */
const expectedPaths = (): string[] => {
  const out = new Set<string>();
  for (const { path } of TEMPLATE_FILES) {
    const parts = path.split('/');
    parts.forEach((_, i) => {
      const p = parts.slice(0, i + 1).join('/');
      if (!p.endsWith('.gitkeep')) out.add(p);
    });
  }
  return [...out];
};

describe('POST /vault', () => {
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
    await person(sub).setFolderId(null);
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
    await person(sub).setFolderId(null);
    await post(g, cookie);
    await post(g, cookie);
    const writes = g.calls.filter((c) => c.method !== 'GET');
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((c) => c.method === 'POST' && (c.url.startsWith('/drive/v3/files?') || c.url.startsWith('/upload/drive/v3/files?')))).toBe(true);
    expect(g.calls.some((c) => ['DELETE', 'PATCH', 'PUT'].includes(c.method))).toBe(false);
    expect(g.calls.some((c) => c.url.includes('/files/') && c.method !== 'GET')).toBe(false);
  });

  it('vault does not make a second folder after a lost reply', async () => {
    const { sub, cookie } = await someone();
    const g = new FakeGoogle();
    g.loseNextFolderReply = true;
    // Drive's search has not caught up with the create yet: only the reserved id can tell.
    g.searchBlind = true;
    const lost = await post(g, cookie);
    expect(lost.status).toBe(500);
    expect(g.marked).toHaveLength(1);
    const retry = await body(await post(g, cookie));
    // The retry is the first answer about a brand-new folder.
    expect(retry.found).toBe(false);
    expect(g.marked).toHaveLength(1);
    expect(retry.folderId).toBe(g.marked[0]?.id);
    expect(g.paths(retry.folderId).sort()).toEqual(expectedPaths().sort());
    expect(await person(sub).folderId()).toBe(retry.folderId);
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
    expect(later.every((c) => c.method === 'GET' && c.url.startsWith(`/drive/v3/files/${first.folderId}?`))).toBe(true);
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
});
