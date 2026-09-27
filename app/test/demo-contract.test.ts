/**
 * The contract both implementations of the app's two seams keep (#192):
 * the same assertions run against the real clients (`httpWorkerClient`,
 * `httpDriveClient`) over a mocked `fetch` that plays a tiny Worker and
 * Drive, and against the demo's in-memory clients (`src/demo/`). If the
 * demo drifts from what the app expects of the real thing, this fails.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpWorkerClient } from '../src/api.js';
import type { Me, NotInvitedMe, WorkerClient } from '../src/api.js';
import { DriveError, httpDriveClient, invalidateToken } from '../src/drive.js';
import type { DriveClient } from '../src/drive.js';
import { createDemo } from '../src/demo/index.js';

const DRIVE = 'https://www.googleapis.com';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  modifiedTime: string;
  content: string;
}

/** Drive's JSON for `file` (int64 `size` as a string, as Drive sends it). */
function driveJson(file: FakeFile): Record<string, unknown> {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    parents: file.parents,
    modifiedTime: file.modifiedTime,
    size: String(new Blob([file.content]).size),
  };
}

/** A multipart/related upload body: its metadata and its content. */
async function readMultipart(init: RequestInit): Promise<{
  metadata: { name: string; parents: string[]; mimeType?: string };
  content: string;
}> {
  const type = new Headers(init.headers).get('Content-Type') ?? '';
  const boundary = /boundary=(.+)$/.exec(type)?.[1] ?? '';
  const body = await (init.body as Blob).text();
  const parts = body.split(`--${boundary}`).slice(1, 3);
  const payload = (part: string): string =>
    part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
  return {
    metadata: JSON.parse(payload(parts[0] ?? '')) as {
      name: string;
      parents: string[];
      mimeType?: string;
    },
    content: payload(parts[1] ?? ''),
  };
}

/**
 * A mocked `fetch` answering the Worker endpoints and the Drive calls the
 * contract uses, over a folder with an empty inbox.
 */
function fakeBackend(): typeof fetch {
  const files = new Map<string, FakeFile>();
  let ids = 0;
  let clock = Date.parse('2026-09-27T09:00:00.000Z');
  const stamp = (): string => new Date((clock += 1000)).toISOString();
  const me: Me = {
    email: 'you@example.com',
    vault: { folderId: 'FOLDER_ID', inboxFolderId: 'INBOX_ID', name: 'Bower' },
    quota: { used: 0, limit: 10 },
    needsReauth: false,
    hasApiKey: false,
  };
  let run: { state: 'queued'; requestedAt: string } | null = null;

  const worker = (path: string, init: RequestInit): Response => {
    const method = init.method ?? 'GET';
    if (path === '/me' && method === 'GET') return json(200, me);
    if (path === '/settings' && method === 'PATCH') {
      const input = JSON.parse(init.body as string) as {
        apiKey?: string | null;
        tourSeenAt?: string;
      };
      if (input.apiKey !== undefined) me.hasApiKey = input.apiKey !== null;
      if (input.tourSeenAt !== undefined) me.tourSeenAt = input.tourSeenAt;
      return json(200, { hasApiKey: me.hasApiKey });
    }
    if (path === '/process' && method === 'POST') {
      run ??= { state: 'queued', requestedAt: new Date().toISOString() };
      return json(200, { run });
    }
    if (path === '/status') return json(200, { run, stale: false });
    if (path.startsWith('/drive/token')) {
      return json(200, {
        accessToken: 'token',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        folderId: 'FOLDER_ID',
      });
    }
    return json(404, { error: { code: 'not_found', message: 'No route.' } });
  };

  const notFound = (): Response =>
    json(404, { error: { message: 'File not found.' } });

  const drive = async (url: URL, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET';
    const media = /^\/(upload\/)?drive\/v3\/files\/([^/?]+)$/.exec(
      url.pathname,
    );
    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const { metadata, content } = await readMultipart(init);
      const file: FakeFile = {
        id: `file-${++ids}`,
        name: metadata.name,
        mimeType: metadata.mimeType ?? 'application/octet-stream',
        parents: metadata.parents,
        modifiedTime: stamp(),
        content,
      };
      files.set(file.id, file);
      return json(200, driveJson(file));
    }
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const parent = /^'([^']+)' in parents/.exec(
        url.searchParams.get('q') ?? '',
      )?.[1];
      return json(200, {
        files: [...files.values()]
          .filter((f) => parent !== undefined && f.parents.includes(parent))
          .map(driveJson),
      });
    }
    if (media?.[2] !== undefined) {
      const file = files.get(decodeURIComponent(media[2]));
      if (file === undefined) return notFound();
      if (media[1] !== undefined && method === 'PATCH') {
        file.content = init.body as string;
        file.modifiedTime = stamp();
        return json(200, driveJson(file));
      }
      if (url.searchParams.get('alt') === 'media') {
        return new Response(file.content, { status: 200 });
      }
      return json(200, { modifiedTime: file.modifiedTime });
    }
    return notFound();
  };

  return vi.fn((url: string, init: RequestInit = {}) =>
    url.startsWith(DRIVE)
      ? drive(new URL(url), init)
      : Promise.resolve(worker(url, init)),
  ) as unknown as typeof fetch;
}

interface Clients {
  worker: WorkerClient;
  drive: DriveClient;
}

const IMPLEMENTATIONS: Array<[string, () => Clients]> = [
  [
    'the real clients over a mocked fetch',
    () => {
      vi.stubGlobal('fetch', fakeBackend());
      return { worker: httpWorkerClient, drive: httpDriveClient };
    },
  ],
  [
    'the demo clients',
    () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          throw new Error('The demo must not fetch.');
        }),
      );
      const demo = createDemo();
      return { worker: demo.worker, drive: demo.drive };
    },
  ],
];

function signedIn(me: Me | NotInvitedMe): Me {
  if ('notInvited' in me) throw new Error('expected a signed-in answer');
  return me;
}

afterEach(() => {
  invalidateToken();
  vi.unstubAllGlobals();
});

describe.each(IMPLEMENTATIONS)('the Worker contract: %s', (_, setup) => {
  it('answers /me with a signed-in account and a Bower folder', async () => {
    const me = signedIn(await setup().worker.getMe());
    expect(me.email).toMatch(/@example\.com$/);
    expect(typeof me.vault?.folderId).toBe('string');
    expect(typeof me.vault?.inboxFolderId).toBe('string');
    expect(me.quota.limit).toBeGreaterThan(me.quota.used);
    expect(me.needsReauth).toBe(false);
    expect(me.hasApiKey).toBe(false);
    expect(me.tourSeenAt).toBeUndefined();
  });

  it('keeps settings: the tour seen and an API key', async () => {
    const { worker } = setup();
    const seen = '2026-09-27T10:00:00.000Z';
    await expect(worker.updateSettings({ tourSeenAt: seen })).resolves.toEqual({
      hasApiKey: false,
    });
    await expect(
      worker.updateSettings({ apiKey: 'sk-ant-test' }),
    ).resolves.toEqual({ hasApiKey: true });
    const me = signedIn(await worker.getMe());
    expect(me.tourSeenAt).toBe(seen);
    expect(me.hasApiKey).toBe(true);
  });

  it('starts a run and reports it on /status', async () => {
    const { worker } = setup();
    const { run } = await worker.startProcess();
    expect(['queued', 'running']).toContain(run.state);
    expect(Number.isNaN(Date.parse(run.requestedAt))).toBe(false);
    const status = await worker.getStatus();
    expect(status.stale).toBe(false);
    expect(status.run?.requestedAt).toBe(run.requestedAt);
  });

  it('refuses an incomplete push subscription synchronously', () => {
    const { worker } = setup();
    expect(() => worker.subscribePush({})).toThrow(
      'Incomplete push subscription.',
    );
  });

  it('hands out a Drive token that is not about to expire', async () => {
    const token = await setup().worker.getDriveToken(false);
    expect(token.accessToken).not.toBe('');
    expect(Date.parse(token.expiresAt)).toBeGreaterThan(Date.now() + 60_000);
  });
});

describe.each(IMPLEMENTATIONS)('the Drive contract: %s', (_, setup) => {
  async function inboxOf(clients: Clients): Promise<string> {
    const vault = signedIn(await clients.worker.getMe()).vault;
    if (vault === null) throw new Error('expected a folder');
    return vault.inboxFolderId;
  }

  it('creates a note, reads it back and lists it in its folder', async () => {
    const clients = setup();
    const inbox = await inboxOf(clients);
    const created = await clients.drive.createTextFile(
      inbox,
      'Contract.md',
      'hello',
    );
    expect(created).toMatchObject({
      name: 'Contract.md',
      mimeType: 'text/markdown',
      parents: [inbox],
      path: 'Contract.md',
    });
    await expect(clients.drive.getText(created.id)).resolves.toBe('hello');
    const listed = await clients.drive.listFolder(inbox);
    expect(listed.find((f) => f.id === created.id)?.path).toBe('Contract.md');
  });

  it('saves new text with a fresh modifiedTime', async () => {
    const clients = setup();
    const inbox = await inboxOf(clients);
    const created = await clients.drive.createTextFile(inbox, 'E.md', 'one');
    const before = await clients.drive.modifiedTimeOf(created.id);
    const saved = await clients.drive.updateFileText(created.id, 'two');
    expect(saved.modifiedTime).not.toBe(before);
    await expect(clients.drive.modifiedTimeOf(created.id)).resolves.toBe(
      saved.modifiedTime,
    );
    await expect(clients.drive.getText(created.id)).resolves.toBe('two');
  });

  it('uploads a file into the inbox and reports progress', async () => {
    const clients = setup();
    const inbox = await inboxOf(clients);
    const onProgress = vi.fn();
    const uploaded = await clients.drive.upload(
      inbox,
      new File(['abc'], 'a.txt', { type: 'text/plain' }),
      onProgress,
    );
    expect(uploaded.name).toBe('a.txt');
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
    expect((await clients.drive.getBlob(uploaded.id)).size).toBe(3);
  });

  it('answers an unknown id with a 404 DriveError', async () => {
    const clients = setup();
    const error: unknown = await clients.drive
      .getText('missing')
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(DriveError);
    expect((error as DriveError).status).toBe(404);
  });
});
