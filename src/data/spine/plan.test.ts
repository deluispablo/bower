import { describe, expect, it } from 'vitest';
import { DriveHttp } from '../drive/drive-http';
import type { DriveFile } from '../drive/drive-api';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { DriveVault } from '../vault/drive-vault';
import { planAdmission } from './plan';
import { driveRead, fakeRead } from './read';

const FOLDER = 'application/vnd.google-apps.folder';
const AT = Date.UTC(2026, 9, 7, 9, 0, 0);

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=UTF-8' } });

/** Drive v3 as Google answers it (files.list paged, files.get with the fields asked, alt=media), over a pretend Drive. */
function driveV3(drive: FakeDrive): typeof fetch {
  const wire = async (f: DriveFile, fields: string): Promise<Record<string, unknown>> => {
    const digest = fields.includes('sha256Checksum') && !f.folder ? await drive.storedDigest(f.id) : null;
    return {
      kind: 'drive#file',
      id: f.id,
      name: f.name,
      mimeType: f.folder ? FOLDER : f.name.endsWith('.md') ? 'text/markdown' : 'application/octet-stream',
      parents: f.parents,
      modifiedTime: f.modifiedTime,
      createdTime: f.createdTime,
      ...(f.size !== undefined && !f.folder ? { size: String(f.size) } : {}),
      ...(f.appProperties ? { appProperties: f.appProperties } : {}),
      ...(digest ? { sha256Checksum: digest.sha256 } : {}),
      trashed: false,
    };
  };
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    if ((init?.method ?? 'GET') !== 'GET' || url.origin !== 'https://www.googleapis.com') return json(400, { error: { code: 400, message: 'badRequest' } });
    if (url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? '';
      const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1] ?? '');
      const all: DriveFile[] = [];
      for (const parent of parents) all.push(...(await drive.listAll(parent)).filter((x) => x.parents[0] === parent));
      const at = Number(url.searchParams.get('pageToken') || 0);
      const page = all.slice(at, at + 3);
      const fields = url.searchParams.get('fields') ?? '';
      return json(200, { files: await Promise.all(page.map((x) => wire(x, fields))), ...(at + 3 < all.length ? { nextPageToken: String(at + 3) } : {}) });
    }
    const id = decodeURIComponent(/^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)?.[1] ?? '');
    if (url.searchParams.get('alt') === 'media') return new Response(new Uint8Array(await drive.readBytes(id)));
    return json(200, await wire(await drive.get(id), url.searchParams.get('fields') ?? ''));
  };
  return f as typeof fetch;
}

describe('the shared plan', () => {
  it('the shared plan gives the same manifest on the fake and on Drive', async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
    // A declared pile, and one of your changes, beside the sample inbox.
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
    const pdf = (name: string) => ({ name, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });
    const declared = await vault.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await vault.settled();
    await vault.move('Resources/Cooking/Lemon tart.md', 'Areas');

    const opts = { scope: 'all' as const, clock: () => AT, newId: () => 'admission-1' };
    const onFake = await planAdmission(fakeRead(drive), root, opts);
    const http = new DriveHttp({ token: async () => 'drive-token', fetch: driveV3(drive) });
    const onDrive = await planAdmission(driveRead(http), root, opts);

    expect(onFake.kind).toBe('manifest');
    if (onFake.kind !== 'manifest') return;
    expect(onDrive).toEqual(onFake);
    const manifest = onFake.manifest;
    expect(manifest).toMatchObject({ v: 1, id: 'admission-1', rootId: root, scope: 'all', at: AT });
    // The declared pile, by its declaration; the sample piles, observed; your change, by its file.
    const pile = manifest.piles.find((p) => p.pileId === declared.id);
    expect(pile?.declaration?.declarationId).toMatch(/\S/);
    expect(pile?.items.map((i) => i.name).sort()).toEqual(expect.arrayContaining(['a.pdf', 'b.pdf']));
    expect(manifest.piles.filter((p) => p.declaration === null).length).toBeGreaterThan(0);
    expect(manifest.journal).toHaveLength(1);
    // Metadata only: every admitted file names where it was and its version.
    for (const item of manifest.piles.flatMap((p) => p.items)) {
      expect(item.parents.length).toBe(1);
      expect(item.modifiedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});
