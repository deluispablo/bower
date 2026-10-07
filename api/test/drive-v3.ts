/**
 * A pretend Google Drive for the Worker's tests: `fetchImpl` answers Drive v3 (files.list paged, files.get with
 * the fields asked, alt=media) over a `FakeDrive`, and GitHub's dispatch with 204. Nothing reaches a network.
 */
import type { DriveFile } from '../../src/data/drive/drive-api.js';
import { FakeDrive } from '../../src/data/drive/fake-drive.js';
import type { AdmissionManifest } from '../../src/data/spine/admission.js';

const FOLDER = 'application/vnd.google-apps.folder';

/** A manifest for tests that admit a run directly, with no Drive. */
export const MANIFEST: AdmissionManifest = {
  v: 1,
  id: 'admission-test',
  rootId: 'FOLDER_ID',
  scope: 'all',
  at: 0,
  piles: [{ pileId: 'p1', anchor: null, declaration: null, items: [{ fileId: 'f1', name: 'receipt.pdf', parents: ['INBOX_ID'], modifiedTime: '2026-10-07T08:00:00.000Z' }] }],
  journal: [],
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=UTF-8' } });

export interface DriveFolder {
  drive: FakeDrive;
  root: string;
  inbox: string;
  bower: string;
  /** Every request sent to Drive, as `METHOD path`. */
  sent: string[];
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
}

/** A Bower folder with an empty inbox and `.bower/changes`, as the template makes it. */
export async function driveFolder(): Promise<DriveFolder> {
  const drive = new FakeDrive({ clock: () => Date.UTC(2026, 9, 7, 8, 0, 0) });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  const bower = (await drive.createFolder(root, '.bower')).id;
  await drive.createFolder(bower, 'changes');
  const sent: string[] = [];
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
  const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const method = init?.method ?? 'GET';
    if (url.origin === 'https://api.github.com') return new Response(null, { status: 204 });
    if (url.origin !== 'https://www.googleapis.com') return json(404, { error: { code: 404, message: 'notFound' } });
    sent.push(`${method} ${url.pathname}`);
    if (method !== 'GET') return json(400, { error: { code: 400, message: 'badRequest' } });
    if (url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? '';
      const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1] ?? '');
      const all: DriveFile[] = [];
      for (const parent of parents) all.push(...(await drive.listAll(parent)).filter((x) => x.parents[0] === parent));
      const fields = url.searchParams.get('fields') ?? '';
      return json(200, { files: await Promise.all(all.map((x) => wire(x, fields))) });
    }
    const id = decodeURIComponent(/^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)?.[1] ?? '');
    try {
      if (url.searchParams.get('alt') === 'media') return new Response(new Uint8Array(await drive.readBytes(id)));
      return json(200, await wire(await drive.get(id), url.searchParams.get('fields') ?? ''));
    } catch {
      return json(404, { error: { code: 404, message: 'notFound' } });
    }
  };
  return { drive, root, inbox, bower, sent, fetchImpl };
}

/** A thing in the inbox (a loose receipt) and one of your changes (a rule), so a press of either scope admits a run. */
export async function withThingsIn(folder: DriveFolder): Promise<void> {
  const { drive, root, inbox } = folder;
  await drive.createText(inbox, 'receipt.pdf', '%PDF receipt', { pile: 'p-receipt' });
  const changes = (await drive.listAll(root)).find((f) => f.folder && f.name === 'changes');
  const line = { v: 1, id: 'change-1', device: 'laptop', at: 1, what: 'A rule', kind: 'rule', text: 'Receipts go to Money' };
  await drive.createText(changes?.id ?? '', 'change-1.json', JSON.stringify(line));
}
