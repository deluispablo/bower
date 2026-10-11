import { describe, expect, it, vi } from 'vitest';
import { DriveHttp } from '../drive/drive-http';
import type { DriveFile } from '../drive/drive-api';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { DriveVault } from '../vault/drive-vault';
import { parsePileDeclaration } from '../contracts/pile-declaration';
import { SET_ASIDE_TEXT, declarationCopies, declarationRecord } from '../pile-readiness';
import { sha256 } from '../vault/hashes';
import { PILE_NOTE } from '../piles';
import { PROP } from '../vault/layout';
import { SET_ASIDE, capturePiles, pileShape, planAdmission, type PileShape } from './plan';
import { admissionRead, driveRead, fakeRead } from './read';

const FOLDER = 'application/vnd.google-apps.folder';
const AT = Date.UTC(2026, 9, 7, 9, 0, 0);
const SESSIONS = 'https://www.googleapis.com/upload/session/';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=UTF-8' } });

describe('pile context agreement', () => {
  it('pile-binned-context-hold: runner shares one Bin listing for a missing member and context', async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
    const uploader = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
    const pile = await uploader.addPile({ text: 'Papers from Alex', items: ['a.pdf', 'b.pdf'].map((name) => ({ name, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${name}`]) })) });
    await uploader.settled();
    const listing = await drive.listAll(root);
    const folder = listing.find((f) => f.folder && f.appProperties?.[PROP.pile] === pile.id);
    const note = listing.find((f) => f.parents[0] === folder?.id && f.name === PILE_NOTE);
    const member = listing.find((f) => f.parents[0] === folder?.id && f.name === 'b.pdf');
    const areas = listing.find((f) => f.folder && f.parents.includes(root) && f.name === 'Areas');
    if (!note || !member || !folder || !areas || !pile.path) throw new Error('incomplete fixture');
    await drive.update(member.id, { addParent: areas.id, removeParent: folder.id });
    await drive.trash(member.id);
    await drive.trash(note.id);
    const bins = vi.spyOn(drive, 'binnedByItem');
    const captured = await capturePiles(fakeRead(drive), root, [{ id: pile.id, path: pile.path, itemIds: listing.filter((f) => f.parents[0] === folder.id && f.name === 'a.pdf').map((f) => f.id), hasWords: false }], { notes: true });
    expect.soft(captured.get(pile.id)?.blocked).toBeNull();
    expect(bins).toHaveBeenCalledTimes(1);
    expect(bins.mock.calls[0]?.[1].slice().sort()).toEqual([note.appProperties?.[PROP.item], member.appProperties?.[PROP.item]].sort());
  });

  it.each(['Drive Bin', 'journal trash', 'never arrived'] as const)(
    'pile-binned-context-hold: app and plan agree after %s', async (state) => {
      localStorage.clear();
      let drive = new FakeDrive();
      const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
      const client = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
      const uploader = client();
      const pile = await uploader.addPile({ text: 'Papers from Alex', items: ['a.pdf', 'b.pdf'].map((name) => ({ name, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${name}`]) })) });
      await uploader.settled();
      const listing = await drive.listAll(root);
      const folder = listing.find((f) => f.folder && f.appProperties?.[PROP.pile] === pile.id);
      const note = listing.find((f) => f.parents[0] === folder?.id && f.name === PILE_NOTE);
      if (!note || !pile.path) throw new Error('no declared context');
      if (state === 'journal trash') {
        await drive.trash(note.id);
        const bower = listing.find((f) => f.folder && f.parents.includes(root) && f.name === '.bower') ?? await drive.createFolder(root, '.bower');
        const changes = listing.find((f) => f.folder && f.parents.includes(bower.id) && f.name === 'changes') ?? await drive.createFolder(bower.id, 'changes');
        await drive.createText(changes.id, 'context-trash.json', JSON.stringify({ v: 1, id: 'context-trash', device: 'DEVICE', at: AT, kind: 'trash', what: 'Put the pile note in the Bin', path: `${pile.path}/${PILE_NOTE}`, fileId: note.id }));
      } else if (state === 'Drive Bin') await drive.trash(note.id);
      else {
        // E3 shape: no context file ever landed; there is no Bin evidence.
        const snapshot = JSON.parse(await drive.snapshot()) as { files: Array<{ meta: { id: string } }> };
        drive = FakeDrive.restore(JSON.stringify({ ...snapshot, files: snapshot.files.filter((f) => f.meta.id !== note.id) }));
      }
      const app = client();
      expect((await app.changes()).filter((c) => c.kind === 'trash')).toHaveLength(state === 'journal trash' ? 1 : 0);
      const seen = (await app.piles()).find((p) => p.id === pile.id);
      if (!seen) throw new Error('pile disappeared');
      expect(seen.setAside).toBe(state === 'never arrived' ? 'not-arrived' : undefined);
      const http = new DriveHttp({ token: async () => 'drive-token', fetch: driveV3(drive, root) });
      for (const [name, read] of [['fakeRead', fakeRead(drive)], ['driveRead', driveRead(http)], ['admissionRead', admissionRead(http, 'all')]] as const) {
        const capture = (await capturePiles(read, root, [pileShape(seen)], { notes: true })).get(pile.id);
        expect.soft(capture?.blocked, name).toBe(seen.setAside ? SET_ASIDE_TEXT[seen.setAside] : null);
        const plan = await planAdmission(read, root, { scope: 'all', clock: () => AT, newId: () => 'context-admission' });
        expect(plan.kind, name).toBe('manifest');
        if (plan.kind !== 'manifest') throw new Error('sample piles were not admitted');
        const admitted = plan.manifest.piles.find((p) => p.pileId === pile.id);
        expect.soft(!!admitted, name).toBe(state !== 'never arrived');
        if (state !== 'never arrived') expect.soft(admitted?.items.map((i) => i.name).sort(), name).toEqual(['a.pdf', 'b.pdf']);
      }
    },
  );
});

/** Drive v3 as Google answers it (files.list paged, files.get with the fields asked, alt=media), over a pretend Drive. */
function driveV3(drive: FakeDrive, root = ''): typeof fetch {
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
  const binned = async (q: string): Promise<Response> => {
    const keys = [...q.matchAll(/value='([^']*)'/g)].map((m) => m[1] ?? '');
    const hits = await drive.binnedByItem(root, keys);
    return json(200, { files: await Promise.all(hits.map(async (h) => ({ ...(await wire(h.file, '')), trashed: true, ...(h.sha256 ? { sha256Checksum: h.sha256 } : {}), ...(h.size !== null ? { size: String(h.size) } : {}) }))) });
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
    // Resumable uploads under a reserved id: the session address carries the pretend Drive's own session.
    if (method === 'POST' && url.pathname === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'resumable') {
      const meta = JSON.parse(String(init?.body)) as { id: string; name: string; parents: string[]; appProperties?: Record<string, string> };
      const sent = new Headers(init?.headers);
      const session = await drive.openResumable({ id: meta.id, parentId: meta.parents[0] ?? '', name: meta.name, type: sent.get('x-upload-content-type') ?? '', size: Number(sent.get('x-upload-content-length')), ...(meta.appProperties ? { appProperties: meta.appProperties } : {}) });
      return new Response(null, { status: 200, headers: { location: `${SESSIONS}${encodeURIComponent(session)}` } });
    }
    if (method === 'PUT' && url.href.startsWith(SESSIONS)) {
      const session = decodeURIComponent(url.href.slice(SESSIONS.length));
      const range = new Headers(init?.headers).get('content-range') ?? '';
      const ask = /^bytes \*\/(\d+)$/.exec(range);
      const part = /^bytes (\d+)-\d+\/(\d+)$/.exec(range);
      const answer = ask ? await drive.sessionStatus(session, Number(ask[1])) : await drive.putChunk(session, Number(part?.[1]), init?.body as Blob, Number(part?.[2]));
      if (answer.kind === 'done') return json(200, await wire(answer.file, 'sha256Checksum'));
      if (answer.kind === 'expired') return json(404, { error: { code: 404, message: 'notFound' } });
      return new Response(null, { status: 308, headers: answer.confirmed > 0 ? { range: `bytes=0-${answer.confirmed - 1}` } : {} });
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
      if (q.startsWith('trashed = true')) return await binned(q);
      const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1] ?? '');
      const all: DriveFile[] = [];
      for (const parent of parents) all.push(...(await drive.listAll(parent)).filter((x) => x.parents[0] === parent));
      const at = Number(url.searchParams.get('pageToken') || 0);
      const page = all.slice(at, at + 3);
      return json(200, { files: await Promise.all(page.map((x) => wire(x, fields))), ...(at + 3 < all.length ? { nextPageToken: String(at + 3) } : {}) });
    }
    if (url.pathname === '/drive/v3/files/generateIds') return json(200, { ids: await drive.generateIds(Number(url.searchParams.get('count'))) });
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

describe('the admission read offers the Bin lookup the app uses', () => {
  it('the admission read offers the Bin lookup the app uses', async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
    const http = new DriveHttp({ token: async () => 'drive-token', fetch: driveV3(drive, root) });
    const vault = new DriveVault({ drive: http, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
    const pdf = (name: string) => ({ name, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${name}`]) });
    const pile = await vault.addPile({ text: 'Papers from Alex', items: [pdf('a.pdf'), pdf('b.pdf')] });
    await vault.settled();
    // A member filed elsewhere, then put in the Bin, with the bytes declared for it: the pile is still ready, as Home shows it.
    const listing = await drive.listAll(root);
    const member = listing.find((f) => f.name === 'b.pdf');
    const elsewhere = listing.find((f) => f.folder && f.name === 'Areas');
    await drive.update(member?.id ?? '', { addParent: elsewhere?.id ?? '', removeParent: member?.parents[0] ?? '' });
    await drive.trash(member?.id ?? '');
    const opts = { scope: 'all' as const, clock: () => AT, newId: () => 'admission-1' };
    const inApp = await planAdmission(fakeRead(drive), root, opts);
    if (inApp.kind !== 'manifest') throw new Error('the app held the pile');
    expect(inApp.manifest.piles.map((p) => p.pileId)).toContain(pile.id);
    for (const [name, read] of [['driveRead', driveRead(http)], ['admissionRead', admissionRead(http, 'all')]] as const) {
      expect(typeof read.binnedByItem, name).toBe('function');
      const runner = await planAdmission(read, root, opts);
      expect(runner, name).toEqual(inApp);
    }
  });
});

describe('what the plan logs', () => {
  it('an unreadable journal file logs no text', async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
    const sys = await drive.createFolder(root, '.bower');
    const journal = await drive.createFolder(sys.id, 'changes');
    await drive.upload(journal.id, 'one.json', new Blob(['{"rule": my secret plan for Alex']));
    const lines: string[] = [];
    const log = (...args: unknown[]): void => void lines.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    const spy = vi.spyOn(console, 'error').mockImplementation(log);
    await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
    spy.mockRestore();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain('secret');
    expect(lines.join('\n')).not.toContain('rule');
  });
});
