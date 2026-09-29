import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import {
  DRIVE_FILES_URL,
  DRIVE_UPLOAD_URL,
  FOLDER_MIME_TYPE,
  createDriveApi,
} from '../src/drive-api.js';
import type { Env } from '../src/env.js';
import type { FetchLike } from '../src/google.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import {
  getRun,
  getRunTicket,
  getUser,
  listRuns,
  putDriveToken,
  putRun,
  putRunTicket,
  putUser,
} from '../src/store.js';
import { TEMPLATE_FILES } from '../src/template.generated.js';
import type { User } from '../src/types.js';
import { isDeadPointer, parseFolderCheck } from '../src/vault.js';

/**
 * `Cloudflare.Env` is empty in this repo (no `wrangler types`), so the
 * bindings from `wrangler.toml` and `vitest.config.ts` are asserted once.
 */
const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;

const API = 'https://api.example.com';
const USER_ID = 'user-1';
const EMAIL = 'you@example.com';
const ACCESS_TOKEN = 'test-access-token';

interface FakeItem {
  id: string;
  name: string;
  mimeType: string;
  parent: string;
  content?: string;
  trashed?: boolean;
  driveId?: string;
  canAddChildren?: boolean;
}

interface FakeCall {
  method: string;
  url: string;
  authorization: string | null;
}

/** Unescapes a Drive `q` string literal body. */
function unquote(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

const Q_PATTERN =
  /^'((?:[^'\\]|\\.)*)' in parents and trashed = false(?: and name = '((?:[^'\\]|\\.)*)')?$/;

/** Reads the metadata and content parts of a multipart/related upload. */
function parseMultipart(
  body: string,
  contentType: string,
): { metadata: Record<string, unknown>; content: string; partType: string } {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
  if (boundary === undefined) throw new Error('no boundary');
  const parts = body.split(`--${boundary}`).slice(1, -1);
  const read = (part: string): { headers: string; data: string } => {
    const split = part.indexOf('\r\n\r\n');
    return {
      headers: part.slice(0, split),
      data: part.slice(split + 4, -2),
    };
  };
  const [meta, content] = parts.map(read);
  if (meta === undefined || content === undefined) {
    throw new Error('expected two parts');
  }
  return {
    metadata: JSON.parse(meta.data) as Record<string, unknown>,
    content: content.data,
    partType: content.headers.replace(/^\r\nContent-Type: /, ''),
  };
}

/**
 * An in-memory Drive answering the four calls `drive-api.ts` makes:
 * list (`files?q=`), get (`files/:id`), create folder (`POST files`) and
 * multipart upload. `failWith` makes every call answer that status.
 */
class FakeDrive {
  readonly items = new Map<string, FakeItem>();
  readonly calls: FakeCall[] = [];
  failWith: number | undefined;
  private nextId = 1;

  constructor() {
    this.items.set('root', {
      id: 'root',
      name: 'My Drive',
      mimeType: FOLDER_MIME_TYPE,
      parent: '',
    });
  }

  add(
    name: string,
    parent: string,
    mimeType = FOLDER_MIME_TYPE,
    content?: string,
  ): string {
    const id = `id-${this.nextId++}`;
    this.items.set(id, { id, name, mimeType, parent, content });
    return id;
  }

  childrenOf(parent: string): FakeItem[] {
    return [...this.items.values()].filter((item) => item.parent === parent);
  }

  /** The item at `path` (`/`-separated) under `rootId`, if any. */
  find(rootId: string, path: string): FakeItem | undefined {
    let current: FakeItem | undefined = this.items.get(rootId);
    for (const name of path.split('/')) {
      if (current === undefined) return undefined;
      const parentId: string = current.id;
      current = this.childrenOf(parentId).find((item) => item.name === name);
    }
    return current;
  }

  snapshot(): FakeItem[] {
    return [...this.items.values()].map((item) => ({ ...item }));
  }

  readonly fetchImpl: FetchLike = (input, init) => {
    try {
      return Promise.resolve(this.answer(input, init));
    } catch (err) {
      return Promise.reject(
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  };

  private answer(input: string, init?: RequestInit): Response {
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    this.calls.push({
      method,
      url: input,
      authorization: headers.get('authorization'),
    });
    if (this.failWith !== undefined) {
      return new Response('boom', { status: this.failWith });
    }
    const url = new URL(input);
    const base = `${url.origin}${url.pathname}`;
    const body = typeof init?.body === 'string' ? init.body : '';

    if (base === DRIVE_FILES_URL && method === 'GET') {
      const match = Q_PATTERN.exec(url.searchParams.get('q') ?? '');
      if (match === null) return new Response('bad q', { status: 400 });
      const parent = unquote(match[1] ?? '');
      const name = match[2] === undefined ? undefined : unquote(match[2]);
      const files = this.childrenOf(parent)
        .filter((item) => item.trashed !== true)
        .filter((item) => name === undefined || item.name === name)
        .map(({ id, name: itemName, mimeType }) => ({
          id,
          name: itemName,
          mimeType,
        }));
      return Response.json({ files });
    }
    if (base.startsWith(`${DRIVE_FILES_URL}/`) && method === 'GET') {
      const id = decodeURIComponent(base.slice(DRIVE_FILES_URL.length + 1));
      const item = this.items.get(id);
      if (item === undefined) return new Response('', { status: 404 });
      return Response.json({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        trashed: item.trashed === true,
        ...(item.driveId === undefined ? {} : { driveId: item.driveId }),
        capabilities: { canAddChildren: item.canAddChildren ?? true },
      });
    }
    if (base === DRIVE_FILES_URL && method === 'POST') {
      const meta = JSON.parse(body) as {
        name: string;
        mimeType: string;
        parents: string[];
      };
      const id = this.add(meta.name, meta.parents[0] ?? '', meta.mimeType);
      return Response.json({ id, name: meta.name, mimeType: meta.mimeType });
    }
    if (
      base === DRIVE_UPLOAD_URL &&
      method === 'POST' &&
      url.searchParams.get('uploadType') === 'multipart'
    ) {
      const { metadata, content, partType } = parseMultipart(
        body,
        headers.get('content-type') ?? '',
      );
      const name = String(metadata.name);
      const mimeType = String(metadata.mimeType);
      expect(partType).toBe(`${mimeType}; charset=UTF-8`);
      const parents = metadata.parents as string[];
      const id = this.add(name, parents[0] ?? '', mimeType, content);
      return Response.json({ id, name, mimeType });
    }
    return new Response('unexpected call', { status: 500 });
  }
}

/** Stores a user and a cached Drive token, so no Google token call happens. */
async function seedUser(extra: Partial<User> = {}): Promise<User> {
  const key = await importEncryptionKey(env.TOKEN_ENC_KEY);
  const user: User = {
    id: USER_ID,
    email: EMAIL,
    createdAt: '2026-01-01T00:00:00.000Z',
    encRefreshToken: await encrypt('test-refresh-token', key),
    ...extra,
  };
  await putUser(kv, user);
  await putDriveToken(
    kv,
    USER_ID,
    {
      accessToken: ACCESS_TOKEN,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    },
    3600,
  );
  return user;
}

async function sessionCookie(): Promise<string> {
  const token = await signSession({ userId: USER_ID }, env.SESSION_SECRET);
  return `${SESSION_COOKIE}=${token}`;
}

async function postVault(
  drive: FakeDrive,
  body: unknown,
  cookie?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: env.APP_ORIGIN,
  };
  if (cookie !== undefined) headers.cookie = cookie;
  return createApp({ fetchImpl: drive.fetchImpl }).request(
    `${API}/vault`,
    {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env,
  );
}

interface VaultBody {
  vault: {
    folderId: string;
    inboxFolderId: string;
    name: string;
    setAt?: string;
  };
}

interface ErrorBody {
  error: { code: string; message: string };
}

const FILES = TEMPLATE_FILES.filter((file) => !file.path.endsWith('.gitkeep'));
const PLACEHOLDER_FOLDERS = TEMPLATE_FILES.filter((file) =>
  file.path.endsWith('/.gitkeep'),
).map((file) => file.path.slice(0, -'/.gitkeep'.length));

beforeEach(async () => {
  const listed = await kv.list({});
  await Promise.all(listed.keys.map((entry) => kv.delete(entry.name)));
});

describe('TEMPLATE_FILES', () => {
  it('bundles the vault template, sorted, without the repo README', () => {
    const paths = TEMPLATE_FILES.map((file) => file.path);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toEqual(
      expect.arrayContaining([
        'CLAUDE.md',
        'index.md',
        'log.md',
        'About-Me.md',
        '0-Inbox/_Inbox.md',
        '0-Inbox/Processed/.gitkeep',
        '1-Projects/_Projects.md',
        '2-Areas/_Areas.md',
        '3-Resources/_Resources.md',
        '4-Archives/_Archives.md',
      ]),
    );
    expect(paths).not.toContain('README.md');
    for (const file of TEMPLATE_FILES) {
      if (file.path.endsWith('.gitkeep')) expect(file.content).toBe('');
      else expect(file.content.length).toBeGreaterThan(0);
    }
  });
});

describe('POST /vault create', () => {
  it('creates the folder at the root of Drive from the template', async () => {
    await seedUser();
    const drive = new FakeDrive();
    const cookie = await sessionCookie();

    const response = await postVault(drive, { mode: 'create' }, cookie);

    expect(response.status).toBe(201);
    const { vault } = await response.json<VaultBody>();
    const root = drive.items.get(vault.folderId);
    expect(root).toMatchObject({
      name: 'Bower',
      mimeType: FOLDER_MIME_TYPE,
      parent: 'root',
    });
    expect(vault.name).toBe('Bower');

    for (const file of FILES) {
      const item = drive.find(vault.folderId, file.path);
      expect(item, file.path).toBeDefined();
      expect(item?.content).toBe(file.content);
      expect(item?.mimeType).toBe('text/markdown');
    }
    for (const path of PLACEHOLDER_FOLDERS) {
      expect(drive.find(vault.folderId, path)?.mimeType).toBe(FOLDER_MIME_TYPE);
    }
    expect(
      [...drive.items.values()].some((item) => item.name === '.gitkeep'),
    ).toBe(false);
    expect(vault.inboxFolderId).toBe(drive.find(vault.folderId, '0-Inbox')?.id);
    expect(
      drive.calls.every(
        (call) => call.authorization === `Bearer ${ACCESS_TOKEN}`,
      ),
    ).toBe(true);

    expect((await getUser(kv, USER_ID))?.vault).toEqual(vault);
    const me = await createApp({ fetchImpl: drive.fetchImpl }).request(
      `${API}/me`,
      { headers: { cookie } },
      env,
    );
    expect((await me.json<{ vault: unknown }>()).vault).toEqual(vault);
  });

  it('answers 409 folder_exists and creates nothing when the folder exists', async () => {
    await seedUser();
    const drive = new FakeDrive();
    drive.add('Bower', 'root');
    const before = drive.snapshot();

    const response = await postVault(
      drive,
      { mode: 'create' },
      await sessionCookie(),
    );

    expect(response.status).toBe(409);
    const body = await response.json<ErrorBody>();
    expect(body.error.code).toBe('folder_exists');
    expect(body.error.message).toContain('existing folder');
    expect(drive.snapshot()).toEqual(before);
    expect(drive.calls.every((call) => call.method === 'GET')).toBe(true);
    expect((await getUser(kv, USER_ID))?.vault).toBeUndefined();
  });

  it('answers 409 vault_exists when the current folder is alive', async () => {
    const drive = new FakeDrive();
    const folderId = drive.add('Bower', 'root');
    const vault = { folderId, inboxFolderId: folderId, name: 'Bower' };
    await seedUser({ vault });

    const response = await postVault(
      drive,
      { mode: 'create' },
      await sessionCookie(),
    );

    expect(response.status).toBe(409);
    expect((await response.json<ErrorBody>()).error.code).toBe('vault_exists');
    // One read of the current folder, nothing written.
    expect(drive.calls.map((call) => call.method)).toEqual(['GET']);
    expect(drive.calls[0]?.url).toContain('supportsAllDrives=true');
    expect((await getUser(kv, USER_ID))?.vault).toEqual(vault);
  });

  it.each<[string, (drive: FakeDrive) => string]>([
    ['deleted (404)', () => 'gone-id'],
    [
      'in the Bin',
      (drive) => {
        const id = drive.add('Bower', 'root');
        const item = drive.items.get(id);
        if (item !== undefined) item.trashed = true;
        return id;
      },
    ],
    [
      'not a folder',
      (drive) => drive.add('Bower', 'root', 'text/markdown', 'Hello.'),
    ],
    [
      'closed to new files',
      (drive) => {
        const id = drive.add('Shared', 'root');
        const item = drive.items.get(id);
        if (item !== undefined) item.canAddChildren = false;
        return id;
      },
    ],
    [
      'in a shared drive',
      (drive) => {
        const id = drive.add('Team', 'root');
        const item = drive.items.get(id);
        if (item !== undefined) item.driveId = 'DRIVE_ID';
        return id;
      },
    ],
  ])('creates a new folder when the current one is %s', async (_, make) => {
    const drive = new FakeDrive();
    const oldId = make(drive);
    await seedUser({
      vault: {
        folderId: oldId,
        inboxFolderId: oldId,
        name: 'Bower',
        missingAt: '2026-01-02T00:00:00.000Z',
      },
    });

    const response = await postVault(
      drive,
      { mode: 'create' },
      await sessionCookie(),
    );

    expect(response.status).toBe(201);
    const { vault } = await response.json<VaultBody>();
    expect(vault.folderId).not.toBe(oldId);
    const stored = (await getUser(kv, USER_ID))?.vault;
    expect(stored).toEqual(vault);
    expect(stored?.missingAt).toBeUndefined();
    expect(stored?.setAt).toEqual(expect.any(String));
  });
});

describe('isDeadPointer', () => {
  const live = {
    id: 'FOLDER_ID',
    name: 'Bower',
    mimeType: FOLDER_MIME_TYPE,
    trashed: false,
    canAddChildren: true,
  };

  it('keeps a live folder and refuses every dead one', () => {
    expect(isDeadPointer(live)).toBe(false);
    expect(isDeadPointer(undefined)).toBe(true);
    expect(isDeadPointer({ ...live, trashed: true })).toBe(true);
    expect(isDeadPointer({ ...live, mimeType: 'text/markdown' })).toBe(true);
    expect(isDeadPointer({ ...live, canAddChildren: false })).toBe(true);
    expect(isDeadPointer({ ...live, driveId: 'DRIVE_ID' })).toBe(true);
  });

  it('reads Drive fields strictly', () => {
    expect(
      parseFolderCheck({
        id: 'FOLDER_ID',
        name: 'Bower',
        mimeType: FOLDER_MIME_TYPE,
        trashed: 'yes',
        driveId: '',
        capabilities: { canAddChildren: 'no' },
      }),
    ).toEqual({
      id: 'FOLDER_ID',
      name: 'Bower',
      mimeType: FOLDER_MIME_TYPE,
      trashed: false,
    });
    expect(() => parseFolderCheck({ id: 1 })).toThrow();
  });
});

describe('POST /vault select', () => {
  it('adds missing template files without overwriting anything', async () => {
    await seedUser();
    const drive = new FakeDrive();
    const folderId = drive.add('Notes', 'root');
    drive.add('CLAUDE.md', folderId, 'text/markdown', 'My own rules.');
    drive.add('index.md', folderId, 'text/markdown', 'My own index.');
    const inboxId = drive.add('0-Inbox', folderId);
    drive.add('_Inbox.md', inboxId, 'text/markdown', 'My inbox note.');
    drive.add('Groceries.md', inboxId, 'text/markdown', 'Milk.');
    const before = drive.snapshot();

    const response = await postVault(
      drive,
      { mode: 'select', folderId },
      await sessionCookie(),
    );

    expect(response.status).toBe(200);
    const { vault } = await response.json<VaultBody>();
    const { setAt, ...pointer } = vault;
    expect(pointer).toEqual({
      folderId,
      inboxFolderId: inboxId,
      name: 'Notes',
    });
    expect(Date.parse(setAt ?? '')).not.toBeNaN();
    // Everything that existed is still there, unchanged.
    for (const item of before) expect(drive.items.get(item.id)).toEqual(item);
    // One item per name: nothing was added next to an existing file.
    for (const parent of [folderId, inboxId]) {
      const names = drive.childrenOf(parent).map((item) => item.name);
      expect(names).toEqual([...new Set(names)]);
    }
    // The files that were missing are now there, from the template.
    for (const file of FILES) {
      const item = drive.find(folderId, file.path);
      expect(item, file.path).toBeDefined();
      if (!before.some((old) => old.id === item?.id)) {
        expect(item?.content).toBe(file.content);
      }
    }
    expect(drive.find(folderId, 'log.md')).toBeDefined();
    expect(drive.find(folderId, '0-Inbox/Processed')?.mimeType).toBe(
      FOLDER_MIME_TYPE,
    );
    expect((await getUser(kv, USER_ID))?.vault).toEqual(vault);
  });

  it('creates 0-Inbox when the folder has none', async () => {
    await seedUser();
    const drive = new FakeDrive();
    const folderId = drive.add('Notes', 'root');

    const response = await postVault(
      drive,
      { mode: 'select', folderId },
      await sessionCookie(),
    );

    expect(response.status).toBe(200);
    const { vault } = await response.json<VaultBody>();
    const inbox = drive.find(folderId, '0-Inbox');
    expect(inbox?.mimeType).toBe(FOLDER_MIME_TYPE);
    expect(vault.inboxFolderId).toBe(inbox?.id);
  });

  it('answers 400 folder_trashed for a folder in the Bin and keeps the pointer', async () => {
    const drive = new FakeDrive();
    const oldId = drive.add('Bower', 'root');
    const vault = { folderId: oldId, inboxFolderId: oldId, name: 'Bower' };
    await seedUser({ vault });
    const folderId = drive.add('Notes', 'root');
    const item = drive.items.get(folderId);
    if (item !== undefined) item.trashed = true;

    const response = await postVault(
      drive,
      { mode: 'select', folderId },
      await sessionCookie(),
    );

    expect(response.status).toBe(400);
    expect((await response.json<ErrorBody>()).error.code).toBe(
      'folder_trashed',
    );
    expect(drive.calls.every((call) => call.method === 'GET')).toBe(true);
    expect((await getUser(kv, USER_ID))?.vault).toEqual(vault);
  });

  it.each([
    ['a shared-drive folder', { driveId: 'DRIVE_ID' }],
    ['a folder closed to new files', { canAddChildren: false }],
  ])('answers 400 folder_not_supported for %s and keeps the pointer', async (_name, change) => {
    const drive = new FakeDrive();
    const oldId = drive.add('Bower', 'root');
    const vault = { folderId: oldId, inboxFolderId: oldId, name: 'Bower' };
    await seedUser({ vault });
    const folderId = drive.add('Notes', 'root');
    const item = drive.items.get(folderId);
    if (item !== undefined) Object.assign(item, change);

    const response = await postVault(
      drive,
      { mode: 'select', folderId },
      await sessionCookie(),
    );

    expect(response.status).toBe(400);
    expect((await response.json<ErrorBody>()).error.code).toBe(
      'folder_not_supported',
    );
    expect(drive.calls.every((call) => call.method === 'GET')).toBe(true);
    expect((await getUser(kv, USER_ID))?.vault).toEqual(vault);
  });

  it('a re-point retires the old run tickets, clears the run history and records setAt', async () => {
    const drive = new FakeDrive();
    const oldId = drive.add('Bower', 'root');
    await seedUser({
      vault: {
        folderId: oldId,
        inboxFolderId: oldId,
        name: 'Bower',
        setAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const ticket = { hash: 'abc', expiresAt: '2099-01-01T00:00:00.000Z' };
    await putRunTicket(kv, USER_ID, 'ingest', ticket, 3600);
    await putRunTicket(kv, USER_ID, 'lint', ticket, 3600);
    for (const at of ['2026-01-01T10:00:00.000Z', '2026-01-02T10:00:00.000Z']) {
      await putRun(kv, USER_ID, { state: 'done', requestedAt: at });
    }
    await putRun(
      kv,
      USER_ID,
      { state: 'done', kind: 'lint', requestedAt: '2026-01-03T10:00:00.000Z' },
      'lint',
    );
    const folderId = drive.add('Notes', 'root');

    const response = await postVault(
      drive,
      { mode: 'select', folderId },
      await sessionCookie(),
    );

    expect(response.status).toBe(200);
    const stored = (await getUser(kv, USER_ID))?.vault;
    expect(stored?.folderId).toBe(folderId);
    expect(stored?.setAt).not.toBe('2026-01-01T00:00:00.000Z');
    expect(Date.parse(stored?.setAt ?? '')).not.toBeNaN();
    expect(await getRunTicket(kv, USER_ID, 'ingest')).toBeUndefined();
    expect(await getRunTicket(kv, USER_ID, 'lint')).toBeUndefined();
    expect(await getRun(kv, USER_ID)).toBeUndefined();
    expect(await getRun(kv, USER_ID, 'lint')).toBeUndefined();
    expect(await listRuns(kv, USER_ID)).toEqual([]);
    expect((await kv.list({ prefix: `runrec:${USER_ID}:` })).keys).toEqual([]);
  });

  it('the same folder again clears the missing mark and keeps the history', async () => {
    const drive = new FakeDrive();
    const folderId = drive.add('Bower', 'root');
    const inboxId = drive.add('0-Inbox', folderId);
    const setAt = '2026-01-01T00:00:00.000Z';
    await seedUser({
      vault: {
        folderId,
        inboxFolderId: inboxId,
        name: 'Bower',
        setAt,
        missingAt: '2026-01-05T00:00:00.000Z',
      },
    });
    const ticket = { hash: 'abc', expiresAt: '2099-01-01T00:00:00.000Z' };
    await putRunTicket(kv, USER_ID, 'ingest', ticket, 3600);
    await putRun(kv, USER_ID, {
      state: 'failed',
      reason: 'vault_missing',
      requestedAt: '2026-01-05T00:00:00.000Z',
    });

    const response = await postVault(
      drive,
      { mode: 'select', folderId },
      await sessionCookie(),
    );

    expect(response.status).toBe(200);
    expect((await getUser(kv, USER_ID))?.vault).toEqual({
      folderId,
      inboxFolderId: inboxId,
      name: 'Bower',
      setAt,
    });
    expect(await getRunTicket(kv, USER_ID, 'ingest')).toEqual(ticket);
    expect(await listRuns(kv, USER_ID)).toHaveLength(1);
  });

  it('answers 400 for a file that is not a folder, or no file at all', async () => {
    await seedUser();
    const drive = new FakeDrive();
    const fileId = drive.add('Note.md', 'root', 'text/markdown', 'Hello.');
    const cookie = await sessionCookie();

    for (const folderId of [fileId, 'missing-id']) {
      const response = await postVault(
        drive,
        { mode: 'select', folderId },
        cookie,
      );
      expect(response.status).toBe(400);
      expect((await response.json<ErrorBody>()).error.code).toBe('bad_request');
    }
    expect(drive.calls.every((call) => call.method === 'GET')).toBe(true);
    expect((await getUser(kv, USER_ID))?.vault).toBeUndefined();
  });
});

describe('POST /vault errors', () => {
  it('answers 400 bad_request for an invalid body', async () => {
    await seedUser();
    const drive = new FakeDrive();
    const cookie = await sessionCookie();

    for (const body of [
      'not json',
      {},
      { mode: 'other' },
      { mode: 'select' },
      { mode: 'select', folderId: '' },
      ['create'],
    ]) {
      const response = await postVault(drive, body, cookie);
      expect(response.status).toBe(400);
      expect((await response.json<ErrorBody>()).error.code).toBe('bad_request');
    }
    expect(drive.calls).toHaveLength(0);
  });

  it('answers 401 without a session', async () => {
    const drive = new FakeDrive();

    const response = await postVault(drive, { mode: 'create' });

    expect(response.status).toBe(401);
    expect((await response.json<ErrorBody>()).error.code).toBe(
      'unauthenticated',
    );
    expect(drive.calls).toHaveLength(0);
  });

  it('answers 502 drive_error when Drive fails', async () => {
    await seedUser();
    const drive = new FakeDrive();
    drive.failWith = 500;

    const response = await postVault(
      drive,
      { mode: 'create' },
      await sessionCookie(),
    );

    expect(response.status).toBe(502);
    const body = await response.json<ErrorBody>();
    expect(body.error).toEqual({
      code: 'drive_error',
      message: 'Drive list returned 500',
    });
    expect((await getUser(kv, USER_ID))?.vault).toBeUndefined();
  });

  it('answers 401 reauth when Drive rejects the token', async () => {
    await seedUser();
    const drive = new FakeDrive();
    drive.failWith = 401;

    const response = await postVault(
      drive,
      { mode: 'create' },
      await sessionCookie(),
    );

    expect(response.status).toBe(401);
    expect((await response.json<ErrorBody>()).error.code).toBe('reauth');
  });
});

describe('createDriveApi', () => {
  it('escapes names in queries and follows every page', async () => {
    const queries: URLSearchParams[] = [];
    const fetchImpl: FetchLike = (input) => {
      const params = new URL(input).searchParams;
      queries.push(params);
      const page = params.get('pageToken');
      return Promise.resolve(
        Response.json(
          page === null
            ? {
                nextPageToken: 'page-2',
                files: [{ id: 'a', name: "Alex's", mimeType: 'text/plain' }],
              }
            : { files: [{ id: 'b', name: "Alex's", mimeType: 'text/plain' }] },
        ),
      );
    };

    const files = await createDriveApi(ACCESS_TOKEN, fetchImpl).listChildren(
      'root',
      "Alex's",
    );

    expect(files.map((file) => file.id)).toEqual(['a', 'b']);
    expect(queries[0]?.get('q')).toBe(
      "'root' in parents and trashed = false and name = 'Alex\\'s'",
    );
    expect(queries[1]?.get('pageToken')).toBe('page-2');
  });
});
