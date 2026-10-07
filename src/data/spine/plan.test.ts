import { describe, expect, it } from 'vitest';
import { DriveHttp } from '../drive/drive-http';
import type { DriveFile } from '../drive/drive-api';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { DriveVault } from '../vault/drive-vault';
import { parsePileDeclaration } from '../contracts/pile-declaration';
import { declarationCopies, declarationRecord } from '../pile-readiness';
import { sha256 } from '../vault/hashes';
import { PILE_NOTE } from '../piles';
import { PROP } from '../vault/layout';
import { SET_ASIDE, capturePiles, planAdmission, type PileShape } from './plan';
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
    const method = init?.method ?? 'GET';
    if (url.origin !== 'https://www.googleapis.com') return json(400, { error: { code: 400, message: 'badRequest' } });
    const fields = url.searchParams.get('fields') ?? '';
    // The writes the app makes (files.create, multipart upload, metadata patch), as Drive v3 takes them.
    if (method === 'POST' && url.pathname === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'multipart') {
      const boundary = /boundary=(\S+)/.exec(new Headers(init?.headers).get('content-type') ?? '')?.[1] ?? '';
      const raw = new TextDecoder().decode(await (init?.body as Blob).arrayBuffer());
      const [metaPart = '', contentPart = ''] = raw.split(`--${boundary}`).slice(1, 3);
      const meta = JSON.parse(metaPart.slice(metaPart.indexOf('\r\n\r\n') + 4).trimEnd()) as { name: string; parents: string[]; appProperties?: Record<string, string> };
      const content = contentPart.slice(contentPart.indexOf('\r\n\r\n') + 4, contentPart.lastIndexOf('\r\n'));
      const made = await drive.upload(meta.parents[0] ?? '', meta.name, new Blob([content]), undefined, meta.appProperties);
      return json(200, await wire(made, fields));
    }
    if (method === 'POST' && url.pathname === '/drive/v3/files') {
      const meta = JSON.parse(String(init?.body)) as { name: string; parents: string[]; appProperties?: Record<string, string> };
      return json(200, await wire(await drive.createFolder(meta.parents[0] ?? '', meta.name, meta.appProperties), fields));
    }
    if (method === 'PATCH' && url.pathname.startsWith('/drive/v3/files/')) {
      const id = decodeURIComponent(url.pathname.slice('/drive/v3/files/'.length));
      const body = JSON.parse(String(init?.body)) as { name?: string; appProperties?: Record<string, string>; trashed?: boolean };
      if (body.trashed === true) {
        await drive.trash(id);
        return json(200, await wire(await drive.get(id).catch(() => ({ id, name: '', folder: false, parents: [], modifiedTime: '', createdTime: '' })), fields));
      }
      const add = url.searchParams.get('addParents');
      const remove = url.searchParams.get('removeParents');
      const patched = await drive.update(id, { ...(body.name ? { name: body.name } : {}), ...(body.appProperties ? { appProperties: body.appProperties } : {}), ...(add ? { addParent: add } : {}), ...(remove ? { removeParent: remove } : {}) });
      return json(200, await wire(patched, fields));
    }
    if (method !== 'GET') return json(400, { error: { code: 400, message: 'badRequest' } });
    if (url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? '';
      const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1] ?? '');
      const all: DriveFile[] = [];
      for (const parent of parents) all.push(...(await drive.listAll(parent)).filter((x) => x.parents[0] === parent));
      const at = Number(url.searchParams.get('pageToken') || 0);
      const page = all.slice(at, at + 3);
      return json(200, { files: await Promise.all(page.map((x) => wire(x, fields))), ...(at + 3 < all.length ? { nextPageToken: String(at + 3) } : {}) });
    }
    const id = decodeURIComponent(/^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)?.[1] ?? '');
    if (url.searchParams.get('alt') === 'media') return new Response(new Uint8Array(await drive.readBytes(id)));
    return json(200, await wire(await drive.get(id), fields));
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

  it('a declared pile gives the same manifest on the fake and on Drive', async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
    // The app adds its piles through the real adapter: Drive v3 over the pretend Drive's bytes.
    const http = new DriveHttp({ token: async () => 'drive-token', fetch: driveV3(drive) });
    const vault = new DriveVault({ drive: http, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
    const pdf = (name: string) => ({ name, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });
    const ready = await vault.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    const edited = await vault.addPile({ text: 'Receipts', items: [pdf('c.pdf'), pdf('d.pdf')] });
    const doubled = await vault.addPile({ text: 'Tickets', items: [pdf('e.pdf'), pdf('f.pdf')] });
    await vault.settled();

    // Each declaration as the contract says: named by its id and the SHA-256 of its stored bytes, scoped to the folder,
    // with each member's declared size and hash those of the bytes that arrived.
    const listing = await drive.listAll(root);
    const folderOf = (pileId: string): DriveFile => {
      const found = listing.find((f) => f.folder && f.appProperties?.[PROP.pile] === pileId);
      if (!found) throw new Error(`no folder for ${pileId}`);
      return found;
    };
    for (const pile of [ready, edited, doubled]) {
      const folder = folderOf(pile.id);
      const declarationId = folder.appProperties?.[PROP.declaration] ?? '';
      const [copy, ...more] = declarationCopies(listing, root, declarationId);
      expect(more).toEqual([]);
      if (!copy) throw new Error('no declaration');
      const bytes = await drive.readBytes(copy.id);
      const parsed = await parsePileDeclaration(bytes, root);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(copy.name).toBe(`declaration-${declarationId}-${parsed.sha256}.json`);
      expect(parsed.value).toMatchObject({ declarationId, pileId: pile.id, scope: { rootId: root }, anchor: { kind: 'folder', inboxId: folder.parents[0] } });
      for (const member of parsed.value.members) {
        const arrived = listing.find((f) => f.parents[0] === folder.id && f.appProperties?.[PROP.item] === member.memberKey);
        if (!arrived) throw new Error(`member ${member.name} did not arrive`);
        const body = await drive.readBytes(arrived.id);
        expect(member.content).toEqual({ encoding: 'blob', size: body.byteLength, sha256: await sha256(new Blob([new Uint8Array(body)])) });
      }
    }

    // One member's bytes changed after it was added; another list of the same pile, different, beside the first.
    const editedFolder = folderOf(edited.id);
    const c = listing.find((f) => f.parents[0] === editedFolder.id && f.name === 'c.pdf');
    if (!c) throw new Error('no c.pdf');
    await drive.writeText(c.id, '%PDF changed', c.modifiedTime);
    const doubledFolder = folderOf(doubled.id);
    const [first] = declarationCopies(listing, root, doubledFolder.appProperties?.[PROP.declaration] ?? '');
    if (!first) throw new Error('no declaration');
    const original = await parsePileDeclaration(await drive.readBytes(first.id), root);
    if (!original.ok) throw new Error('unreadable declaration');
    const other = await declarationRecord({ ...original.value, createdAt: original.value.createdAt + 1 }, root);
    if (!other) throw new Error('refused declaration');
    await drive.createText(first.parents[0] ?? '', other.name, other.text);

    // The Worker's admission, the runner's capture and the fake read the declarations the same way.
    const opts = { scope: 'all' as const, clock: () => AT, newId: () => 'admission-1' };
    const onFake = await planAdmission(fakeRead(drive), root, opts);
    const onDrive = await planAdmission(driveRead(http), root, opts);
    expect(onFake.kind).toBe('manifest');
    if (onFake.kind !== 'manifest') return;
    expect(onDrive).toEqual(onFake);
    const taken = onFake.manifest.piles.find((p) => p.pileId === ready.id);
    expect(taken?.declaration).toEqual({ declarationId: folderOf(ready.id).appProperties?.[PROP.declaration], sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(taken?.items.map((i) => i.name).sort()).toEqual([PILE_NOTE, 'a.pdf', 'b.pdf'].sort());
    expect(onFake.manifest.piles.map((p) => p.pileId)).not.toContain(edited.id);
    expect(onFake.manifest.piles.map((p) => p.pileId)).not.toContain(doubled.id);

    // Each pile that waits says why, in the same words on both.
    const shapes: PileShape[] = [ready, edited, doubled].map((pile) => {
      const folder = folderOf(pile.id);
      return { id: pile.id, path: `Inbox/${folder.name}`, itemIds: listing.filter((f) => f.parents[0] === folder.id).map((f) => f.id), hasWords: true };
    });
    const capFake = await capturePiles(fakeRead(drive), root, shapes, { notes: false });
    const capDrive = await capturePiles(driveRead(http), root, shapes, { notes: false });
    expect(capDrive).toEqual(capFake);
    expect(capFake.get(ready.id)?.blocked).toBeNull();
    expect(capFake.get(edited.id)).toEqual({ blocked: SET_ASIDE.changed });
    expect(capFake.get(doubled.id)).toEqual({ blocked: SET_ASIDE.declaration });
  });
});
