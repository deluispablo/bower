import { env as testEnv } from 'cloudflare:test';
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
  private n = 0;

  readonly fetchImpl: FetchLike = async (input, init) => {
    const method = init?.method ?? 'GET';
    const url = new URL(input);
    if (input === GOOGLE_TOKEN_URL) return Response.json({ access_token: 'access-1', expires_in: 3599 });
    this.calls.push({ method, url: `${url.pathname}${url.search}` });
    if (url.origin !== DRIVE) throw new Error(`unexpected fetch in test: ${input}`);
    if (url.pathname === '/drive/v3/files' && method === 'GET') return this.list(url.searchParams.get('q') ?? '');
    if (url.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
      const item = this.items.get(decodeURIComponent(url.pathname.split('/').pop() ?? ''));
      return item === undefined ? Response.json({ error: { code: 404 } }, { status: 404 }) : Response.json(item);
    }
    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as Partial<Item>;
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
      return Response.json(this.add({ ...metadata, mimeType: metadata.mimeType ?? 'text/plain' }));
    }
    return Response.json({ error: 'unexpected' }, { status: 500 });
  };

  add(partial: Partial<Item>): Item {
    this.n += 1;
    const item: Item = {
      id: `drive-${this.n}`,
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
    const lost = await post(g, cookie);
    expect(lost.status).toBe(500);
    expect(g.marked).toHaveLength(1);
    const retry = await body(await post(g, cookie));
    expect(retry.found).toBe(true);
    expect(g.marked).toHaveLength(1);
    expect(retry.folderId).toBe(g.marked[0]?.id);
    expect(g.paths(retry.folderId).sort()).toEqual(expectedPaths().sort());
    expect(await person(sub).folderId()).toBe(retry.folderId);
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
