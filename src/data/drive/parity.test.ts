/**
 * The fake and the real Drive are one port (TL-P4-14 `c2-fake-parity`): every `DriveApi` method is on both, and the
 * fake's search answers as Drive's `files.list` does.
 * - `q` syntax: https://developers.google.com/workspace/drive/api/guides/search-files (`fullText contains` matches the
 *   words of a file's name and content, every word asked, case-insensitively; a part of a word does not match).
 * - `pageSize`: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list (at most 1000 a page,
 *   then `nextPageToken`); `DriveHttp.fullText` reads two pages for each batch of 40 folders.
 */
import { describe, expect, it } from 'vitest';
import { DRIVE_OPS, SEARCH_MAX_PAGES, SEARCH_PAGE_SIZE } from './drive-api';
import { DriveHttp } from './drive-http';
import { FakeDrive } from './fake-drive';

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
