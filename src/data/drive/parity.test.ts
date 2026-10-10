/**
 * The fake and the real Drive are one port (TL-P4-14 `c2-fake-parity`): every `DriveApi` method is on both, and the
 * fake's search answers as Drive's `files.list` does.
 * - `q` syntax: https://developers.google.com/workspace/drive/api/guides/search-files (`fullText contains` matches the
 *   words of a file's name and content, every word asked, case-insensitively; a part of a word does not match).
 * - `pageSize`: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list (at most 1000 a page,
 *   then `nextPageToken`); `DriveHttp.fullText` reads two pages for each batch of 40 folders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_OPS, SEARCH_MAX_PAGES, SEARCH_PAGE_SIZE } from './drive-api';
import { DriveHttp, FOLDER, type WireFile } from './drive-http';
import { FakeDrive } from './fake-drive';
import { B1_FEED_CASES, B1_PREFIX_CASES, makeB1Drive as makeB1Fixture, runB1CacheCase, runB1FeedCase, runB1PrefixCase } from './drive-contract';

const makeB1Drive = (kind: 'http' | 'fake', prefix?: Parameters<typeof makeB1Fixture>[2]) =>
  makeB1Fixture(kind, {
    restore: (snapshot, options) => FakeDrive.restore(snapshot, options),
    http: (options) => new DriveHttp(options),
  }, prefix);

/** Recorded Drive metadata includes inherited trash and Workspace MIME types, independently of fake normalization. */
function makeFixRound1Drive() {
  const time = '2026-10-10T10:00:00.000Z';
  const wire = (id: string, name: string, parents: string[], mimeType: string): WireFile => ({
    id, name, parents, mimeType, modifiedTime: time, createdTime: time,
  });
  const files: Record<string, WireFile> = {
    root: wire('root', 'My Drive', [], FOLDER),
    FOLDER_ID: wire('FOLDER_ID', 'Bower', ['root'], FOLDER),
    PROJECTS_ID: wire('PROJECTS_ID', 'Projects', ['FOLDER_ID'], FOLDER),
    NOTE_ID: wire('NOTE_ID', 'Plan.md', ['PROJECTS_ID'], 'text/markdown'),
    CONTROL_ID: wire('CONTROL_ID', 'Control.md', ['FOLDER_ID'], 'text/markdown'),
    DOCUMENT_ID: wire('DOCUMENT_ID', 'Draft', ['FOLDER_ID'], 'application/vnd.google-apps.document'),
  };
  const recordedFile = (id: string): WireFile => {
    const file = files[id];
    if (!file) throw new Error('Unrecorded fix-round file.');
    return file;
  };
  const fake = FakeDrive.restore(JSON.stringify({
    v: 1, seq: 0, last: Date.parse(time),
    files: Object.values(files).map((file) => ({
      meta: {
        id: file.id, name: file.name, parents: file.parents, folder: file.mimeType === FOLDER,
        modifiedTime: time, createdTime: time,
        ...(file.id === 'DOCUMENT_ID' ? { mimeType: file.mimeType } : {}),
      },
      trashed: false, content: file.mimeType === FOLDER ? null : { text: 'A short note.' },
    })),
  }), { clock: () => Date.parse(time), latency: 0 });
  const changes: Array<{ fileId: string; removed: false; file: WireFile }> = [];
  const json = (body: unknown) => new Response(JSON.stringify(body));
  const http = new DriveHttp({
    token: async () => 'made-up-token', pacing: { baseMs: 0 },
    fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/changes/startPageToken')) return json({ startPageToken: String(changes.length) });
      if (url.pathname.endsWith('/changes')) return json({
        changes: changes.slice(Number(url.searchParams.get('pageToken'))), newStartPageToken: String(changes.length),
      });
      const file = files[url.pathname.split('/').at(-1) ?? ''];
      if (!file) throw new Error('Unrecorded fix-round request.');
      if (url.searchParams.get('alt') === 'media') return new Response('A short note.', { status: 206 });
      return json(file);
    },
  });
  const record = async (id: string) => {
    const file = { ...recordedFile(id), modifiedTime: (await fake.get(id, { binned: true })).modifiedTime };
    files[id] = file;
    changes.push({ fileId: id, removed: false, file: { ...file } });
  };
  return {
    fake, http,
    touch: async (id: string) => { fake.touch(id); await record(id); },
    binProjects: async () => {
      await fake.trash('PROJECTS_ID');
      // Drive's files resource marks descendants trashed even when they are not explicitly trashed.
      files.PROJECTS_ID = { ...recordedFile('PROJECTS_ID'), trashed: true };
      files.NOTE_ID = { ...recordedFile('NOTE_ID'), trashed: true };
      await record('PROJECTS_ID');
    },
  };
}

describe('B1b HTTP and fake port parity', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('b1b fix 2: native fake sizes are UTF-8 bytes for Unicode creates and updates', async () => {
    const fake = new FakeDrive({ clock: () => Date.parse('2026-10-10T10:00:00.000Z'), latency: 0 });
    const root = await fake.createFolder('root', 'Bower');
    const changes: Array<{ fileId: string; removed: false; file: WireFile }> = [];
    const media = new Map<string, string>();
    const json = (body: unknown) => new Response(JSON.stringify(body));
    const http = new DriveHttp({
      token: async () => 'made-up-token', pacing: { baseMs: 0 },
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/changes/startPageToken')) return json({ startPageToken: String(changes.length) });
        if (url.pathname.endsWith('/changes')) return json({
          changes: changes.slice(Number(url.searchParams.get('pageToken'))), newStartPageToken: String(changes.length),
        });
        const id = url.pathname.split('/').at(-1) ?? '';
        if (url.searchParams.get('alt') === 'media' && media.has(id)) return new Response(media.get(id));
        throw new Error('Unrecorded Unicode size request.');
      },
    });
    const verify = async (text: string, existingId?: string) => {
      const tokens = await Promise.all([http.getStartPageToken(), fake.getStartPageToken()]);
      const written = existingId
        ? await fake.writeText(existingId, text, (await fake.get(existingId)).modifiedTime)
        : await fake.createText(root.id, 'Unicode.md', text, { bowerItem: 'SIZE_ITEM' });
      const expected = new TextEncoder().encode(text);
      // Drive's wire size is bytes, independently of the fake's native metadata calculation.
      media.set(written.id, text);
      changes.push({ fileId: written.id, removed: false, file: {
        id: written.id, name: written.name, parents: written.parents, mimeType: 'text/markdown',
        createdTime: written.createdTime, modifiedTime: written.modifiedTime, size: String(expected.byteLength),
      } });
      for (const [kind, drive, token] of [['http', http, tokens[0]], ['fake', fake, tokens[1]]] as const) {
        const bytes = await drive.readBytes(written.id);
        expect(Array.from(bytes), `${kind} stored media`).toEqual(Array.from(expected));
        const feed = await drive.listChanges(token);
        expect(feed.changes).toHaveLength(1);
        expect(feed.changes[0]).toMatchObject({ fileId: written.id, removed: false });
        expect.soft(feed.changes[0]?.file?.size, `${kind} native feed: ${existingId ? 'update' : 'create'} ${text}`)
          .toBe(bytes.byteLength);
      }
      const evidence = await fake.evidence(written.id);
      const restored = FakeDrive.restore(await fake.snapshot(), { latency: 0 });
      const sizes = {
        write: written.size,
        get: (await fake.get(written.id)).size,
        checksums: (await fake.get(written.id, { checksums: true })).size,
        listing: (await fake.listAll(root.id)).find((file) => file.id === written.id)?.size,
        search: (await fake.fullText(root.id, 'Unicode')).find((file) => file.id === written.id)?.size,
        digest: (await fake.storedDigest(written.id))?.size,
        evidenceFile: evidence?.file.size,
        evidenceContent: evidence?.content?.size,
        restored: (await restored.get(written.id)).size,
      };
      expect.soft(sizes, `fake size paths: ${existingId ? 'update' : 'create'} ${text}`)
        .toEqual(Object.fromEntries(Object.keys(sizes).map((key) => [key, expected.byteLength])));
      const trashed = await fake.trash(written.id);
      const binned = (await fake.binnedByItem(root.id, ['SIZE_ITEM'])).find((item) => item.file.id === written.id);
      const untrashed = await fake.untrash(written.id);
      expect.soft([trashed.size, binned?.file.size, binned?.size, untrashed.size], `fake Bin size paths: ${text}`)
        .toEqual(Array<number>(4).fill(expected.byteLength));
      return written.id;
    };
    const asciiId = await verify('ASCII');
    await verify('é🙂');
    await verify('é🙂', asciiId);
  });

  it('b1b fix 1 finding 1: inherited Bin status in prefix and feed', async () => {
    const u = makeFixRound1Drive();
    for (const drive of [u.http, u.fake]) {
      expect(await drive.readPrefix('NOTE_ID'), 'live child positive control').toBe('A short note.');
      expect(await drive.readPrefix('CONTROL_ID'), 'unrelated live note positive control').toBe('A short note.');
    }
    await u.binProjects();
    const tokens = await Promise.all([u.http.getStartPageToken(), u.fake.getStartPageToken()]);
    await u.touch('NOTE_ID');
    const [http, fake] = await Promise.all([u.http.listChanges(tokens[0]), u.fake.listChanges(tokens[1])]);
    expect(http.changes).toHaveLength(1);
    expect(fake.changes).toHaveLength(1);
    expect(http.changes[0]).toMatchObject({ fileId: 'NOTE_ID', removed: false, file: { trashed: true } });
    expect.soft(fake.changes[0], 'fake feed must inherit the parent Bin status').toEqual(http.changes[0]);
    await expect(u.http.readPrefix('NOTE_ID')).rejects.toMatchObject({ code: 'not-found' });
    await expect.soft(u.fake.readPrefix('NOTE_ID'), 'fake prefix must reject an inherited Bin status')
      .rejects.toMatchObject({ code: 'not-found' });
    for (const drive of [u.http, u.fake]) {
      expect(await drive.readPrefix('CONTROL_ID'), 'Bin leaves the unrelated control readable').toBe('A short note.');
    }
  });

  it('b1b fix 1 finding 2: Workspace change has the public HTTP shape', async () => {
    const u = makeFixRound1Drive();
    const controlTokens = await Promise.all([u.http.getStartPageToken(), u.fake.getStartPageToken()]);
    await u.touch('CONTROL_ID');
    const control = await Promise.all([u.http.listChanges(controlTokens[0]), u.fake.listChanges(controlTokens[1])]);
    expect(control[0].changes).toHaveLength(1);
    expect(control[0].changes[0]).toMatchObject({ fileId: 'CONTROL_ID', removed: false, file: { folder: false } });
    expect(control[1].changes, 'ordinary note change positive control').toEqual(control[0].changes);
    for (const drive of [u.http, u.fake]) {
      expect(await drive.readPrefix('DOCUMENT_ID'), 'Workspace metadata positive control').toBeNull();
    }
    const tokens = await Promise.all([u.http.getStartPageToken(), u.fake.getStartPageToken()]);
    await u.touch('DOCUMENT_ID');
    const [http, fake] = await Promise.all([u.http.listChanges(tokens[0]), u.fake.listChanges(tokens[1])]);
    expect(http.changes).toHaveLength(1);
    expect(fake.changes).toHaveLength(1);
    expect(http.changes[0]).toMatchObject({ fileId: 'DOCUMENT_ID', removed: false });
    expect(http.changes[0]?.file).not.toHaveProperty('mimeType');
    expect(fake.changes[0]?.file, 'Workspace changes expose exactly the normalized public metadata').toEqual(http.changes[0]?.file);
  });

  it.each(B1_PREFIX_CASES)('b1-ports-parity prefix $name', async (prefix) => {
    const [fake, http] = await Promise.all([
      runB1PrefixCase(makeB1Drive('fake', prefix), prefix),
      runB1PrefixCase(makeB1Drive('http', prefix), prefix),
    ]);
    expect(http).toEqual(fake);
  });

  it('b1-ports-parity full-media cache separation', async () => {
    const [fake, http] = await Promise.all([
      runB1CacheCase(makeB1Drive('fake')),
      runB1CacheCase(makeB1Drive('http')),
    ]);
    expect(http).toEqual(fake);
  });

  it.each(B1_FEED_CASES)('b1-ports-parity changes feed %s', async (name) => {
    const [fake, http] = await Promise.all([
      runB1FeedCase(makeB1Drive('fake'), name),
      runB1FeedCase(makeB1Drive('http'), name),
    ]);
    expect(http).toEqual(fake);
  });
});

const PAGE_SIZE = SEARCH_PAGE_SIZE;
const PAGES = SEARCH_MAX_PAGES;

const real = (fetch: (url: string) => Promise<Response>): DriveHttp => new DriveHttp({ token: async () => 'token', fetch: (url) => fetch(String(url)) });
const portsOn = (kind: object): string[] => Object.keys(DRIVE_OPS).filter((op) => typeof Reflect.get(kind, op) !== 'function');

describe('the fake and real Drive offer the same ports', () => {
  it('every Drive method is on both', () => {
    const fake = portsOn(FakeDrive.prototype);
    const http = portsOn(DriveHttp.prototype);
    expect({ missingOnFake: fake, missingOnReal: http }).toEqual({ missingOnFake: [], missingOnReal: [] });
  });

  it('the fake finds whole words, every word asked, as Drive does', async () => {
    const fake = new FakeDrive();
    const root = await fake.createFolder('root', 'Bower');
    await fake.createText(root.id, 'lease.md', 'The rent is due on the first');
    expect((await fake.fullText(root.id, 'ren')).map((f) => f.name), 'a part of a word').toEqual([]);
    expect((await fake.fullText(root.id, 'due rent')).map((f) => f.name), 'both words, either order').toEqual(['lease.md']);
    expect((await fake.fullText(root.id, 'rent garden')).map((f) => f.name), 'a word it lacks').toEqual([]);
  });

  it('the fake answers no more than the pages Drive is read for', async () => {
    const fake = new FakeDrive();
    const root = await fake.createFolder('root', 'Bower');
    for (let i = 0; i < PAGE_SIZE * PAGES + 500; i++) await fake.createText(root.id, `n${i}.md`, 'needle');
    expect((await fake.fullText(root.id, 'needle')).length).toBe(PAGE_SIZE * PAGES);
  });

  it('the real Drive asks for 1000 a page and stops after two', async () => {
    const wire = (id: string): object => ({ id, name: 'n.md', mimeType: 'text/plain', parents: ['root'], modifiedTime: '2026-10-09T10:00:00.000Z', createdTime: '2026-10-09T10:00:00.000Z' });
    const ids = Array.from({ length: PAGE_SIZE * 3 }, (_, i) => `f${i}`);
    const searches: URLSearchParams[] = [];
    const http = real(async (url) => {
      const q = new URL(url).searchParams;
      if (q.get('q')?.includes('fullText') !== true) return new Response(JSON.stringify({ files: ids.map(wire) }));
      searches.push(q);
      const from = (q.get('pageToken') ? Number(q.get('pageToken')) : 0) * PAGE_SIZE;
      return new Response(JSON.stringify({ files: ids.slice(from, from + PAGE_SIZE).map(wire), nextPageToken: String(from / PAGE_SIZE + 1) }));
    });
    const hits = await http.fullText('root', 'needle');
    expect(searches.map((p) => p.get('pageSize'))).toEqual(['1000', '1000']);
    expect(hits.length).toBe(PAGE_SIZE * PAGES);
  });

  const wire = (id: string, extra: object = {}): object => ({ id, name: `${id}.pdf`, mimeType: 'application/pdf', parents: ['root'], modifiedTime: '2026-10-09T10:00:00.000Z', createdTime: '2026-10-09T10:00:00.000Z', ...extra });

  it('the real Drive hashes the bytes it reads, or the bytes it is given', async () => {
    let reads = 0;
    const http = real(async () => (reads++, new Response(new Uint8Array([1, 2, 3]))));
    const fake = new FakeDrive();
    const file = await fake.upload((await fake.createFolder('root', 'Bower')).id, 'a.bin', new Blob([new Uint8Array([1, 2, 3])]));
    const stored = await fake.storedDigest(file.id);
    expect(await http.storedDigest('x')).toEqual(stored);
    expect(reads).toBe(1);
    expect(await http.storedDigest('x', new Uint8Array([1, 2, 3]))).toEqual(stored);
    expect(reads, 'bytes the caller holds are not read again').toBe(1);
  });

  it('the real Drive lists the Bin by item key, inside the folder only', async () => {
    const queries: string[] = [];
    const http = real(async (url) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      if (q) queries.push(q);
      if (q.startsWith('trashed = true')) {
        return new Response(JSON.stringify({ files: [wire('in', { appProperties: { bowerItem: 'k1' }, size: '5', sha256Checksum: 'ab' }), wire('out', { parents: ['elsewhere'], appProperties: { bowerItem: 'k1' } }), wire('plain', { appProperties: { bowerItem: 'k2' }, size: '9' })] }));
      }
      return new Response(JSON.stringify({ files: [wire('in'), wire('plain')] }));
    });
    const hits = await http.binnedByItem('root', ['k1', 'k2']);
    expect(hits.map((h) => [h.file.id, h.size, h.sha256])).toEqual([['in', 5, 'ab'], ['plain', null, null]]);
    expect(queries.at(-1)).toBe("trashed = true and (appProperties has { key='bowerItem' and value='k1' } or appProperties has { key='bowerItem' and value='k2' })");
    expect(await http.binnedByItem('root', [])).toEqual([]);
  });

  it('a file binned inside a binned folder counts as removed', async () => {
    // Drive marks the children of a trashed folder trashed (explicitlyTrashed false); their folder is in no listing.
    const asked: string[] = [];
    const http = real(async (url) => {
      const u = new URL(url);
      const q = u.searchParams.get('q') ?? '';
      if (q.startsWith('trashed = true')) {
        return new Response(JSON.stringify({ files: [wire('kid', { parents: ['gone'], appProperties: { bowerItem: 'k1' }, size: '5', sha256Checksum: 'ab' }), wire('stray', { parents: ['abroad'], appProperties: { bowerItem: 'k1' } })] }));
      }
      const id = u.pathname.split('/').pop() ?? '';
      if (u.pathname.includes('/files/')) {
        asked.push(id);
        const parents: Record<string, string[]> = { gone: ['mid'], mid: ['root'], abroad: ['elsewhere'] };
        return parents[id] ? new Response(JSON.stringify({ id, parents: parents[id] })) : new Response('{}', { status: 404 });
      }
      return new Response(JSON.stringify({ files: [wire('plain')] }));
    });
    const hits = await http.binnedByItem('root', ['k1']);
    expect(hits.map((h) => h.file.id)).toEqual(['kid']);
    expect(asked.length, 'a few folder lookups, not a listing').toBeLessThanOrEqual(5);
    // The fake answers the same.
    const fake = new FakeDrive();
    const top = await fake.createFolder('root', 'Bower');
    const folder = await fake.createFolder(top.id, 'Pile');
    const inner = await fake.createText(folder.id, 'a.md', 'a', { bowerItem: 'k1' });
    await fake.trash(inner.id);
    await fake.trash(folder.id);
    expect((await fake.binnedByItem(top.id, ['k1'])).map((h) => h.file.id)).toEqual([inner.id]);
  });

  it('a listing with checksums marks a file Drive keeps no checksum of, as the fake does', async () => {
    const http = real(async (url) => new Response(JSON.stringify({ files: new URL(url).searchParams.get('q')?.includes("'root' in parents") !== true ? [] : [wire('pdf', { size: '4', sha256Checksum: 'ab' }), wire('doc', { mimeType: 'application/vnd.google-apps.document' }), wire('dir', { mimeType: 'application/vnd.google-apps.folder' })] })));
    const listed = await http.listAll('root', { checksums: true });
    expect(listed.filter((f) => f.unchecked).map((f) => f.id)).toEqual(['doc']);
    expect((await http.listAll('root')).some((f) => f.unchecked), 'a plain listing asks for no checksum').toBe(false);
  });
});
