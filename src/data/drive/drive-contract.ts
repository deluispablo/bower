/**
 * What any `DriveApi` must do, the fake and the HTTP client alike, so the
 * fake can stand in for Google Drive in every other test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveApi, DriveFile } from './drive-api';
import { DriveHttp, FOLDER, type WireFile } from './drive-http';
import { FakeDrive, type FakeDriveOptions } from './fake-drive';
import { ReadCache } from './read-cache';

export interface DriveUnderTest {
  drive: DriveApi;
  /** A folder to work in. */
  root: string;
  /** Makes the next call fail with this code. */
  failNext(code: 'offline' | 'auth' | 'not-found'): void;
  /** Changes a file as another device would. */
  touch(id: string): Promise<void>;
}

export function describeDriveContract(name: string, make: () => Promise<DriveUnderTest>): void {
  describe(`drive contract: ${name}`, () => {
    it('create then listAll sees it', async () => {
      const { drive, root } = await make();
      const f = await drive.createFolder(root, 'Projects');
      const n = await drive.createText(f.id, 'Plan.md', 'hello', { by: 'bower' });
      const all = await drive.listAll(root);
      expect(all.map((x) => x.name).sort()).toEqual(['Plan.md', 'Projects']);
      expect(all.find((x) => x.id === n.id)).toMatchObject({ folder: false, parents: [f.id], appProperties: { by: 'bower' } });
      expect(all.find((x) => x.id === f.id)?.folder).toBe(true);
      expect(await drive.readText(n.id)).toBe('hello');
    });

    it('writeText with the right modifiedTime writes', async () => {
      const { drive, root } = await make();
      const n = await drive.createText(root, 'a.md', 'one');
      const after = await drive.writeText(n.id, 'two', n.modifiedTime);
      expect(await drive.readText(n.id)).toBe('two');
      expect(after.modifiedTime >= n.modifiedTime).toBe(true);
    });

    it('writeText with a stale modifiedTime rejects conflict', async () => {
      const u = await make();
      const n = await u.drive.createText(u.root, 'a.md', 'one');
      await u.touch(n.id);
      await expect(u.drive.writeText(n.id, 'two', n.modifiedTime)).rejects.toMatchObject({ code: 'conflict' });
      expect(await u.drive.readText(n.id)).not.toBe('two');
    });

    it('update renames and moves between parents', async () => {
      const { drive, root } = await make();
      const a = await drive.createFolder(root, 'A');
      const b = await drive.createFolder(root, 'B');
      const n = await drive.createText(a.id, 'x.md', 'x');
      const moved = await drive.update(n.id, { name: 'y.md', addParent: b.id, removeParent: a.id });
      expect(moved).toMatchObject({ name: 'y.md', parents: [b.id] });
      expect((await drive.get(n.id)).parents).toEqual([b.id]);
    });

    it('update sets and removes appProperties', async () => {
      const { drive, root } = await make();
      const n = await drive.createText(root, 'x.md', 'x', { by: 'bower', bowerNew: '1' });
      const after = await drive.update(n.id, { appProperties: { bowerNew: null, kind: 'note' } });
      expect(after.appProperties).toEqual({ by: 'bower', kind: 'note' });
    });

    it('trash hides from listAll and untrash brings back', async () => {
      const { drive, root } = await make();
      const f = await drive.createFolder(root, 'Old');
      await drive.createText(f.id, 'in.md', 'x');
      await drive.trash(f.id);
      expect(await drive.listAll(root)).toEqual([]);
      await drive.untrash(f.id);
      expect((await drive.listAll(root)).map((x) => x.name).sort()).toEqual(['Old', 'in.md']);
    });

    it('same names may coexist in one folder', async () => {
      const { drive, root } = await make();
      await drive.createText(root, 'Lease.pdf', 'a');
      await drive.createText(root, 'Lease.pdf', 'b');
      expect((await drive.listAll(root)).filter((x) => x.name === 'Lease.pdf')).toHaveLength(2);
    });

    it('fullText finds text inside files only under root', async () => {
      const { drive, root } = await make();
      const outside = await drive.createFolder(root, 'Outside');
      const inside = await drive.createFolder(root, 'Inside');
      await drive.createText(inside.id, 'a.md', 'The rent is £1,450 a month');
      await drive.createText(outside.id, 'b.md', 'The rent is £1,450 too');
      const hits = await drive.fullText(inside.id, '£1,450');
      expect(hits.map((h) => h.name)).toEqual(['a.md']);
    });

    it('get of a missing id rejects not-found', async () => {
      const { drive } = await make();
      await expect(drive.get('nope')).rejects.toMatchObject({ code: 'not-found' });
    });

    it('failNext makes the next call reject with that code', async () => {
      const u = await make();
      u.failNext('offline');
      await expect(u.drive.listAll(u.root)).rejects.toMatchObject({ code: 'offline' });
      await expect(u.drive.listAll(u.root)).resolves.toEqual([]);
    });
  });
}

// B1b reds: test-local signatures keep absent ports red on assertions, never on imports or TypeScript errors.
// Source protocol: manage-downloads, changes.list/getStartPageToken and RFC 9110 §14 (see delivery notes).
export interface B1Change {
  fileId: string;
  removed: boolean;
  file?: DriveFile;
}

export interface B1ChangePage {
  changes: B1Change[];
  nextPageToken?: string;
  newStartPageToken?: string;
}

export interface B1Ports {
  readPrefix(id: string): Promise<string | null>;
  getStartPageToken(): Promise<string>;
  /** Drains the account feed, retaining unrelated changes and removed stubs. */
  listChanges(pageToken: string): Promise<{ changes: B1Change[]; newStartPageToken: string }>;
  parents(id: string): Promise<string[]>;
  /** The caller supplies only unknown live ids; removed stubs are resolved from its cached tree. */
  resolveScope(rootId: string, unknownIds: readonly string[]): Promise<{
    inScopeIds: string[];
    outOfScopeIds: string[];
    needsFullListing: boolean;
  }>;
}

export function b1Port<K extends keyof B1Ports>(drive: DriveApi, name: K): B1Ports[K] {
  const candidate: unknown = Reflect.get(drive, name);
  expect(typeof candidate, `B1b ${name} port`).toBe('function');
  return (candidate as (...args: never[]) => Promise<unknown>).bind(drive) as B1Ports[K];
}

const B1_TIME = '2026-10-10T10:00:00.000Z';
export const B1_ROOT = 'FOLDER_ID';
const B1_NOTE = 'NOTE_ID';
const B1_CONTROL = 'CONTROL_ID';
const B1_SHORT = 'A short note with a whole é.';
const B1_FOLDER = 'f101';
const B1_ARRIVAL = 'f102';
const B1_OUTSIDE = 'OUTSIDE_ID';
const B1_OUT_NOTE = 'OUTSIDE_NOTE_ID';

export interface B1PrefixCase {
  name: string;
  status: 206 | 200 | 416;
  fullText: string;
  expected: string | null;
  mimeType?: string;
}

const B1_DEFAULT_PREFIX: B1PrefixCase = {
  name: '206 prefix', status: 206, fullText: 'a'.repeat(4096) + 'FULL_MEDIA_TAIL', expected: 'a'.repeat(4096),
};

export const B1_PREFIX_CASES: readonly B1PrefixCase[] = [
  B1_DEFAULT_PREFIX,
  { name: '200 full cut at 4096 bytes', status: 200, fullText: 'b'.repeat(4096) + 'FULL_MEDIA_TAIL', expected: 'b'.repeat(4096) },
  { name: '416 empty note', status: 416, fullText: '', expected: '' },
  { name: 'empty body', status: 200, fullText: '', expected: '' },
  { name: '206 split UTF-8 character', status: 206, fullText: 'c'.repeat(4095) + '🙂FULL_MEDIA_TAIL', expected: 'c'.repeat(4095) },
  { name: '200 split UTF-8 character', status: 200, fullText: 'd'.repeat(4095) + '🙂FULL_MEDIA_TAIL', expected: 'd'.repeat(4095) },
  { name: 'whole UTF-8 character at byte 4096', status: 206, fullText: 'e'.repeat(4092) + '🙂FULL_MEDIA_TAIL', expected: 'e'.repeat(4092) + '🙂' },
  { name: 'Google Docs excluded', status: 200, fullText: 'Not a stored note.', expected: null, mimeType: 'application/vnd.google-apps.document' },
  { name: 'Google Sheets export excluded', status: 200, fullText: 'Not a stored note.', expected: null, mimeType: 'application/vnd.google-apps.spreadsheet' },
];

/** Scripted answers extend the existing fake's injected options, without implementing a port in the red. */
interface B1FakeOptions extends FakeDriveOptions {
  prefixResponses: Record<string, 206 | 200 | 416>;
  startPageToken: string;
  changePages: Record<string, B1ChangePage>;
}

export interface B1UnderTest {
  drive: DriveApi;
  kind: 'http' | 'fake';
  calls: Array<{ method: string; url: URL; headers: Headers }>;
  pages: Record<string, B1ChangePage>;
  /** Another device's arrival after the bootstrap listing. */
  arrive(): Promise<void>;
}

const b1File = (id: string, name: string, parents: string[], folder = false, text?: string): DriveFile => ({
  id, name, parents, folder, modifiedTime: B1_TIME, createdTime: B1_TIME,
  ...(text === undefined ? {} : { size: new TextEncoder().encode(text).byteLength }),
});

const b1Wire = (file: DriveFile, mimeType?: string): WireFile => ({
  id: file.id, name: file.name, parents: file.parents,
  mimeType: mimeType ?? (file.folder ? FOLDER : 'text/markdown'),
  modifiedTime: file.modifiedTime, createdTime: file.createdTime,
  ...(file.size === undefined ? {} : { size: String(file.size) }),
});

/** One recorded protocol fixture, consumed by DriveHttp and by the existing FakeDrive's fixture options. */
export function makeB1Drive(kind: 'http' | 'fake', prefix = B1_DEFAULT_PREFIX): B1UnderTest {
  const newFolder = b1File(B1_FOLDER, 'Projects', [B1_ROOT], true);
  const newNote = b1File(B1_ARRIVAL, 'Plan.md', [B1_FOLDER], false, 'New arrival.');
  const outsideNote = b1File(B1_OUT_NOTE, 'Elsewhere.md', [B1_OUTSIDE], false, 'Unrelated.');
  const pages: Record<string, B1ChangePage> = {
    START_TOKEN: {
      changes: [{ fileId: B1_FOLDER, removed: false, file: newFolder }, { fileId: B1_OUT_NOTE, removed: false, file: outsideNote }],
      nextPageToken: 'SECOND_PAGE',
    },
    SECOND_PAGE: {
      changes: [{ fileId: B1_ARRIVAL, removed: false, file: newNote }, { fileId: 'REMOVED_ID', removed: true }],
      nextPageToken: 'TERMINAL_PAGE',
    },
    TERMINAL_PAGE: {
      changes: [{ fileId: B1_ARRIVAL, removed: false, file: newNote }], newStartPageToken: 'AFTER_TOKEN',
    },
    AFTER_TOKEN: { changes: [], newStartPageToken: 'AFTER_TOKEN' },
  };
  const files: Array<{ meta: DriveFile & { mimeType?: string }; trashed: boolean; content: { text: string } | null }> = [
    { meta: b1File('root', 'My Drive', [], true), trashed: false, content: null },
    { meta: b1File(B1_ROOT, 'Bower', ['root'], true), trashed: false, content: null },
    { meta: b1File(B1_OUTSIDE, 'Elsewhere', ['root'], true), trashed: false, content: null },
    { meta: outsideNote, trashed: false, content: { text: 'Unrelated.' } },
    { meta: b1File(B1_CONTROL, 'Control.md', [B1_ROOT], false, B1_SHORT), trashed: false, content: { text: B1_SHORT } },
    { meta: { ...b1File(B1_NOTE, 'Note.md', [B1_ROOT], false, prefix.fullText), ...(prefix.mimeType ? { mimeType: prefix.mimeType } : {}) }, trashed: false, content: { text: prefix.fullText } },
    ...Array.from({ length: 51 }, (_, i) => ({ meta: b1File(`UNKNOWN_${i}`, `Note ${i}.md`, [B1_ROOT], false, 'Known bytes.'), trashed: false, content: { text: 'Known bytes.' } })),
  ];
  const options: B1FakeOptions = {
    clock: () => Date.parse(B1_TIME), latency: 0,
    prefixResponses: { [B1_NOTE]: prefix.status, [B1_CONTROL]: 206 }, startPageToken: 'START_TOKEN', changePages: pages,
  };
  const backing = FakeDrive.restore(JSON.stringify({ v: 1, seq: 100, last: Date.parse(B1_TIME), files }), options);
  const calls: B1UnderTest['calls'] = [];
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const http = new DriveHttp({
    token: async () => 'made-up-token', pacing: { baseMs: 0 },
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      calls.push({ method: init?.method ?? 'GET', url, headers });
      if (url.pathname.endsWith('/changes/startPageToken')) return json({ startPageToken: 'START_TOKEN' });
      if (url.pathname.endsWith('/changes')) {
        const page = pages[url.searchParams.get('pageToken') ?? ''];
        if (!page) return json({ error: 'Unknown recorded page.' }, 400);
        return json({ ...page, changes: page.changes.map((change) => ({ ...change, ...(change.file ? { file: b1Wire(change.file) } : {}) })) });
      }
      if (url.pathname.endsWith('/files')) {
        const { q: listQuery = '' } = Object.fromEntries(url.searchParams);
        const parents = [...listQuery.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
        return json({ files: (await backing.listAll('root')).filter((f) => f.parents.some((p) => parents.includes(p))).map((f) => b1Wire(f, f.id === B1_NOTE ? prefix.mimeType : undefined)) });
      }
      const id = url.pathname.split('/').at(-1) ?? '';
      if (url.searchParams.get('alt') === 'media') {
        const bytes = new Uint8Array(await backing.readBytes(id));
        if (headers.has('range')) {
          const status = id === B1_NOTE ? prefix.status : 206;
          if (status === 416) return new Response('Requested range not satisfiable.', { status, headers: { 'content-range': 'bytes */0' } });
          const body = status === 206 ? bytes.slice(0, 4096) : bytes;
          return new Response(body, { status, headers: status === 206 && body.length ? { 'content-range': `bytes 0-${body.length - 1}/${bytes.length}` } : {} });
        }
        return new Response(bytes);
      }
      if (url.pathname.includes('/files/')) return json(b1Wire(await backing.get(id), id === B1_NOTE ? prefix.mimeType : undefined));
      return json({ error: 'Unrecorded request.' }, 400);
    },
  });
  return {
    kind, drive: kind === 'http' ? http : backing, calls, pages,
    arrive: async () => {
      const folder = await backing.createFolder(B1_ROOT, 'Projects');
      const note = await backing.createText(folder.id, 'Plan.md', 'New arrival.');
      expect([folder.id, note.id], 'deterministic new-arrival fixture').toEqual([B1_FOLDER, B1_ARRIVAL]);
      // Match the recorded change's version, without a timer.
      backing.setTimes(B1_FOLDER, Date.parse(B1_TIME), Date.parse(B1_TIME));
      backing.setTimes(B1_ARRIVAL, Date.parse(B1_TIME), Date.parse(B1_TIME));
    },
  };
}

async function b1PositiveControl(u: B1UnderTest): Promise<void> {
  expect(await u.drive.readText(B1_CONTROL), 'existing full-media positive control').toBe(B1_SHORT);
  expect(await u.drive.get(B1_ROOT), 'existing metadata positive control').toMatchObject({ id: B1_ROOT, folder: true });
  u.calls.length = 0;
}

export async function runB1PrefixCase(u: B1UnderTest, prefix: B1PrefixCase): Promise<string | null> {
  await b1PositiveControl(u);
  const readPrefix = b1Port(u.drive, 'readPrefix');
  expect(await readPrefix(B1_CONTROL), 'short note positive control').toBe(B1_SHORT);
  u.calls.length = 0;
  const fullText = vi.spyOn(u.drive, 'readText');
  const fullBytes = vi.spyOn(u.drive, 'readBytes');
  const answer = await readPrefix(B1_NOTE);
  expect(answer).toBe(prefix.expected);
  if (u.kind === 'http') {
    const media = u.calls.filter((c) => c.url.searchParams.get('alt') === 'media');
    expect(media.length).toBe(prefix.expected === null ? 0 : 1);
    for (const c of media) {
      expect(c.method).toBe('GET');
      expect(c.headers.get('range')).toBe('bytes=0-4095');
      expect(c.headers.get('authorization')).toBe('Bearer made-up-token');
    }
    expect(u.calls.some((c) => c.url.pathname.endsWith('/export')), 'no export request').toBe(false);
  }
  if (prefix.expected === null) {
    expect(fullText, 'excluded exports have no full-text read').not.toHaveBeenCalled();
    expect(fullBytes, 'excluded exports have no full-byte read').not.toHaveBeenCalled();
    return answer;
  }
  // A prefix read on the actual adapter cannot stand in for its later full-media read.
  expect(await u.drive.readText(B1_NOTE)).toBe(prefix.fullText);
  expect(await u.drive.readBytes(B1_NOTE)).toEqual(new TextEncoder().encode(prefix.fullText));
  return answer;
}

export const B1_FEED_CASES = ['start token', 'multi-page drain', 'removed stubs and unrelated account changes', 'parents lookup', 'unknown id scope walk', '50 unknown ids', '51 unknown ids', 'b1-feed-bootstrap-new-folder'] as const;
export type B1FeedCase = (typeof B1_FEED_CASES)[number];

const b1ExpectedDrain = (u: B1UnderTest): { changes: B1Change[]; newStartPageToken: string } => ({
  changes: Object.entries(u.pages).filter(([token]) => token !== 'AFTER_TOKEN').flatMap(([, page]) => page.changes),
  newStartPageToken: 'AFTER_TOKEN',
});

function b1AssertMyDrive(u: B1UnderTest): void {
  if (u.kind !== 'http') return;
  for (const c of u.calls.filter((call) => call.url.pathname.includes('/changes'))) {
    expect(c.method).toBe('GET');
    expect(c.url.searchParams.has('driveId'), 'My Drive only').toBe(false);
    expect(c.url.searchParams.get('restrictToMyDrive')).toBe('true');
    expect(c.headers.get('authorization')).toBe('Bearer made-up-token');
  }
}

export async function runB1FeedCase(u: B1UnderTest, name: B1FeedCase): Promise<unknown> {
  await b1PositiveControl(u);
  if (name === 'start token') {
    const token = await b1Port(u.drive, 'getStartPageToken')();
    expect(token).toBe('START_TOKEN');
    if (u.kind === 'http') expect(u.calls.map((c) => c.url.pathname)).toEqual(['/drive/v3/changes/startPageToken']);
    // getStartPageToken supports no restrictToMyDrive parameter; My Drive is enforced on changes.list below.
    return token;
  }
  if (name === 'parents lookup') {
    const parents = b1Port(u.drive, 'parents');
    expect(await parents(B1_CONTROL), 'in-scope positive control').toEqual([B1_ROOT]);
    expect(await parents(B1_OUT_NOTE)).toEqual([B1_OUTSIDE]);
    expect(await parents('root')).toEqual([]);
    if (u.kind === 'http') {
      expect(u.calls).toHaveLength(3);
      expect(u.calls.every((c) => c.url.searchParams.get('fields')?.split(',').includes('parents'))).toBe(true);
      expect(u.calls.every((c) => !c.url.searchParams.has('alt'))).toBe(true);
    }
    return [await parents(B1_CONTROL), await parents(B1_OUT_NOTE), await parents('root')];
  }
  if (name === 'unknown id scope walk' || name === '50 unknown ids' || name === '51 unknown ids') {
    const resolveScope = b1Port(u.drive, 'resolveScope');
    const fullListing = vi.spyOn(u.drive, 'listAll');
    expect(await resolveScope(B1_ROOT, []), 'empty positive control').toEqual({ inScopeIds: [], outOfScopeIds: [], needsFullListing: false });
    if (name === 'unknown id scope walk') {
      await u.arrive();
      u.calls.length = 0;
      const result = await resolveScope(B1_ROOT, [B1_ARRIVAL, B1_OUT_NOTE]);
      expect(result).toEqual({ inScopeIds: [B1_ARRIVAL], outOfScopeIds: [B1_OUT_NOTE], needsFullListing: false });
      expect(fullListing, 'scope walk uses ancestry').not.toHaveBeenCalled();
      if (u.kind === 'http') {
        const lookedUp = u.calls.map((c) => c.url.pathname.split('/').at(-1));
        expect(lookedUp).toEqual(expect.arrayContaining([B1_ARRIVAL, B1_FOLDER, B1_OUT_NOTE, B1_OUTSIDE]));
        expect(u.calls.some((c) => c.url.pathname.endsWith('/files')), 'ancestry, not a full listing').toBe(false);
      }
      return result;
    }
    const ids = Array.from({ length: name === '50 unknown ids' ? 50 : 51 }, (_, i) => `UNKNOWN_${i}`);
    u.calls.length = 0;
    const result = await resolveScope(B1_ROOT, ids);
    expect(result).toEqual(ids.length === 50
      ? { inScopeIds: ids, outOfScopeIds: [], needsFullListing: false }
      : { inScopeIds: [], outOfScopeIds: [], needsFullListing: true });
    expect(fullListing, 'caller decides whether to list').not.toHaveBeenCalled();
    if (u.kind === 'http') {
      expect(u.calls.some((c) => c.url.pathname.endsWith('/files')), 'caller decides whether to list').toBe(false);
      if (ids.length > 50) expect(u.calls, 'overflow is reported before ancestry reads').toEqual([]);
    }
    return result;
  }
  if (name === 'b1-feed-bootstrap-new-folder') {
    const start = await b1Port(u.drive, 'getStartPageToken')();
    expect(start).toBe('START_TOKEN');
    const initial = await u.drive.listAll(B1_ROOT);
    expect(initial.some((f) => f.id === B1_CONTROL), 'bootstrap positive control').toBe(true);
    expect(initial.some((f) => f.id === B1_FOLDER)).toBe(false);
    await u.arrive();
    const drained = await b1Port(u.drive, 'listChanges')(start);
    expect(drained).toEqual(b1ExpectedDrain(u));
    const scoped = await b1Port(u.drive, 'resolveScope')(B1_ROOT, [B1_FOLDER, B1_ARRIVAL, B1_OUT_NOTE]);
    expect(scoped).toEqual({ inScopeIds: [B1_FOLDER, B1_ARRIVAL], outOfScopeIds: [B1_OUT_NOTE], needsFullListing: false });
    expect(drained.changes.filter((c) => c.fileId === B1_ARRIVAL)).toHaveLength(2);
    expect(drained.changes.find((c) => c.removed)).toEqual({ fileId: 'REMOVED_ID', removed: true });
    if (u.kind === 'http') {
      expect(u.calls[0]?.url.pathname).toBe('/drive/v3/changes/startPageToken');
      expect(u.calls[1]?.url.pathname).toBe('/drive/v3/files');
      const feed = u.calls.filter((c) => c.url.pathname.endsWith('/changes'));
      expect(feed.map((c) => c.url.searchParams.get('pageToken'))).toEqual(['START_TOKEN', 'SECOND_PAGE', 'TERMINAL_PAGE']);
      expect(u.calls.some((c) => c.url.pathname.endsWith('/REMOVED_ID')), 'no parents read for a removed stub').toBe(false);
    }
    b1AssertMyDrive(u);
    return { drained, scoped };
  }
  const listChanges = b1Port(u.drive, 'listChanges');
  expect(await listChanges('AFTER_TOKEN'), 'empty terminal-page positive control').toEqual({ changes: [], newStartPageToken: 'AFTER_TOKEN' });
  u.calls.length = 0;
  const drained = await listChanges('START_TOKEN');
  expect(drained).toEqual(b1ExpectedDrain(u));
  if (name === 'removed stubs and unrelated account changes') {
    expect(drained.changes.find((c) => c.fileId === 'REMOVED_ID')).toEqual({ fileId: 'REMOVED_ID', removed: true });
    expect(drained.changes.find((c) => c.fileId === B1_OUT_NOTE)?.file?.parents).toEqual([B1_OUTSIDE]);
  }
  if (u.kind === 'http') {
    expect(u.calls.map((c) => c.url.searchParams.get('pageToken'))).toEqual(['START_TOKEN', 'SECOND_PAGE', 'TERMINAL_PAGE']);
    expect(u.calls.every((c) => c.url.searchParams.get('includeRemoved') === 'true')).toBe(true);
    expect(u.calls.every((c) => c.url.searchParams.get('spaces') === 'drive')).toBe(true);
    for (const c of u.calls) {
      const fields = c.url.searchParams.get('fields') ?? '';
      for (const field of ['nextPageToken', 'newStartPageToken', 'fileId', 'removed', 'parents']) expect(fields).toContain(field);
    }
  }
  b1AssertMyDrive(u);
  return drained;
}

export async function runB1CacheCase(u: B1UnderTest): Promise<unknown> {
  await b1PositiveControl(u);
  const cache = new ReadCache();
  const control = await u.drive.get(B1_CONTROL);
  expect(await cache.text(control, () => u.drive.readText(control.id)), 'existing cache positive control').toBe(B1_SHORT);
  const candidate: unknown = Reflect.get(cache, 'prefix');
  expect(typeof candidate, 'ReadCache.prefix port').toBe('function');
  const prefix = (candidate as (v: DriveFile, read: () => Promise<string | null>) => Promise<string | null>).bind(cache);
  const readPrefix = b1Port(u.drive, 'readPrefix');
  const version = await u.drive.get(B1_NOTE);
  expect(await prefix(version, () => readPrefix(version.id))).toBe('a'.repeat(4096));
  expect(cache.keptText(version), 'prefix is not cached as full text').toBeUndefined();
  let textReads = 0;
  let byteReads = 0;
  const text = await cache.text(version, () => { textReads++; return u.drive.readText(version.id); });
  const bytes = await cache.bytes(version, () => { byteReads++; return u.drive.readBytes(version.id); });
  expect(text).toBe(B1_DEFAULT_PREFIX.fullText);
  expect(bytes).toEqual(new TextEncoder().encode(text));
  expect([textReads, byteReads]).toEqual([1, 1]);
  expect(await cache.text(version, () => u.drive.readText(version.id))).toBe(text);
  return { text, bytes };
}

export function describeB1PortsContract(kind: 'http' | 'fake'): void {
  describe(`B1b ports: ${kind}`, () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    it.each(B1_PREFIX_CASES)('b1-prefix-read $name', async (prefix) => {
      await runB1PrefixCase(makeB1Drive(kind, prefix), prefix);
    });
    it('b1-prefix-read never poisons the full-media cache', async () => {
      await runB1CacheCase(makeB1Drive(kind));
    });
    it.each(B1_FEED_CASES.filter((name) => name !== 'b1-feed-bootstrap-new-folder'))('b1-changes-feed %s', async (name) => {
      await runB1FeedCase(makeB1Drive(kind), name);
    });
    it('b1-feed-bootstrap-new-folder', async () => {
      await runB1FeedCase(makeB1Drive(kind), 'b1-feed-bootstrap-new-folder');
    });
  });
}
