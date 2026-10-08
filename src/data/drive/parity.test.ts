/**
 * The fake and the real Drive are one port (TL-P4-14 `c2-fake-parity`): every `DriveApi` method is on both, and the
 * fake's search answers as Drive's `files.list` does.
 * - `q` syntax: https://developers.google.com/workspace/drive/api/guides/search-files (`fullText contains` matches the
 *   words of a file's name and content, every word asked, case-insensitively; a part of a word does not match).
 * - `pageSize`: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list (at most 1000 a page,
 *   then `nextPageToken`); `DriveHttp.fullText` reads two pages for each batch of 40 folders.
 */
import { describe, expect, it } from 'vitest';
import { DRIVE_OPS } from './drive-api';
import { DriveHttp } from './drive-http';
import { FakeDrive } from './fake-drive';

const PAGE_SIZE = 1000;
const PAGES = 2;

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
});
