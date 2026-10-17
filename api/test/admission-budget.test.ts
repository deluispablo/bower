/**
 * Admission keeps to the free plan's subrequest limit (TL-P4-11): a Worker invocation may make 50
 * (https://developers.cloudflare.com/workers/platform/limits/#subrequests), and admission counts every fetch it
 * makes against a budget of 35, so a bigger folder never fails `POST /process` with "Too many subrequests".
 * What admission cannot afford to read it hands to the runner, which reads every file and holds a pile by the same
 * rules before any write; so the run's outcome is the unbudgeted one.
 */
import { describe, expect, it } from 'vitest';

import { DriveHttp } from '../../src/data/drive/drive-http.js';
import type { AdmissionManifest } from '../../src/data/spine/admission.js';
import { capturePiles, listedPiles, pileShape, planAdmission } from '../../src/data/spine/plan.js';
import { admissionRead, driveRead } from '../../src/data/spine/read.js';
import { NotReadHere } from '../../src/data/spine/budget.js';
import { DISPATCH_SUBREQUESTS, SUBREQUEST_BUDGET } from '../../src/data/spine/budget.js';
import { declaredPile, holderOf, press, pressGitHub, storedManifest } from './admission-support.js';
import { driveFolder, type DriveFolder } from './drive-v3.js';

/** The GitHub the alarm reaches: each press dispatches its run from the alarm. */
const gh = pressGitHub();

const OPTS = { scope: 'all' as const, clock: () => 0, newId: () => 'same' };

/** Drive v3 over the pretend Drive, counting every fetch in `count`. */
function httpOf(folder: DriveFolder, count: { n: number; reads?: number } = { n: 0 }): DriveHttp {
  return new DriveHttp({
    token: async () => 'access-cached',
    fetch: async (input, init) => {
      count.n += 1;
      if (String(input).includes('alt=media')) count.reads = (count.reads ?? 0) + 1;
      return await folder.fetchImpl(String(input), init);
    },
  });
}

/** A change you made in the app, as the app writes it to `.bower/changes`. */
async function change(folder: DriveFolder, n: number): Promise<void> {
  const changes = (await folder.drive.listAll(folder.root)).find((f) => f.folder && f.name === 'changes');
  if (!changes) throw new Error('no changes folder');
  const rec = { v: 1, device: 'laptop', id: `change-${n}`, at: Date.UTC(2026, 9, 7, 9, n), kind: 'rule', what: `Rule ${n} from Alex`, text: `Rule ${n}` };
  await folder.drive.createText(changes.id, `change-${n}.json`, JSON.stringify(rec));
}

/** 300 files in the areas, 25 piles in the inbox (5 added in the app, 20 in Drive), and 12 of your changes. */
async function bigFolder(): Promise<DriveFolder> {
  const folder = await driveFolder();
  const { drive, root, inbox, bower } = folder;
  const piles = await drive.createFolder(bower, 'piles');
  for (let n = 1; n <= 5; n += 1) await declaredPile(folder, piles.id, n);
  for (let n = 6; n <= 25; n += 1) {
    const made = await drive.createFolder(inbox, `Papers ${n}`, { pile: `pile-${n}` });
    await drive.createText(made.id, 'Pile note.md', `Papers ${n} from Alex`);
    await drive.createText(made.id, `a${n}.pdf`, `%PDF a${n}`);
  }
  for (let n = 1; n <= 12; n += 1) await change(folder, n);
  const areas = await drive.createFolder(root, 'Areas');
  for (let i = 1; i <= 100; i += 1) {
    const topic = await drive.createFolder(areas.id, `Topic ${i}`);
    for (let j = 1; j <= 3; j += 1) await drive.createText(topic.id, `Note ${i}-${j}.md`, `# Note ${i}-${j}\n`);
  }
  return folder;
}

/** One press of Tidy up through the Worker: its answer, how many fetches it made, and the manifest it kept. */
async function pressCounted(folder: DriveFolder): Promise<{ status: number; fetches: number; manifest: AdmissionManifest }> {
  const who = await holderOf(folder);
  let fetches = 0;
  const r = await press(async (url, init) => {
    fetches += 1;
    return await folder.fetchImpl(url, init);
  }, who.headers, gh);
  console.info(`subrequests in /process: ${fetches}`);
  return { status: r.status, fetches, manifest: r.status === 200 ? await storedManifest(who.sub) : ({} as AdmissionManifest) };
}

/** The piles a run takes of a manifest, by the runner's own reading: every file read, the same rules (`scripted.ts`). */
async function runnerTakes(folder: DriveFolder, manifest: AdmissionManifest): Promise<string[]> {
  const read = driveRead(httpOf(folder));
  const took = new Map(manifest.piles.map((p) => [p.pileId, new Set(p.items.map((i) => i.fileId))]));
  const inbox = (await listedPiles(read, folder.root)).flatMap((p) => {
    const ids = took.get(p.id);
    return ids ? [{ ...p, items: p.items.filter((i) => ids.has(i.id)) }] : [];
  });
  const capture = await capturePiles(read, folder.root, inbox.map(pileShape), { notes: true });
  return inbox.filter((p) => capture.get(p.id)?.blocked === null).map((p) => p.id).sort();
}

describe('admission subrequest budget', () => {
  it('admission of 300 files and 25 piles stays within the subrequest budget with the same outcome', async () => {
    const folder = await bigFolder();
    expect((await folder.drive.listAll(folder.root)).length).toBeGreaterThan(300);
    // The shared plan over the plain Drive adapter with no budget: the outcome to match.
    const unbudgeted = await planAdmission(driveRead(httpOf(folder)), folder.root, OPTS);
    expect(unbudgeted.kind).toBe('manifest');
    if (unbudgeted.kind !== 'manifest') return;
    // The Worker's own reader with no budget would read past it: so this press has to leave reads to the runner.
    const free = { n: 0 };
    await planAdmission(admissionRead(httpOf(folder, free), 'all'), folder.root, OPTS);
    expect(free.n + DISPATCH_SUBREQUESTS).toBeGreaterThan(SUBREQUEST_BUDGET);
    const after = await pressCounted(folder);
    expect(after.status).toBe(200);
    expect(after.fetches).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
    expect(after.manifest.piles).toHaveLength(25);
    expect(after.manifest.journal).toHaveLength(12);
    expect({ ...after.manifest, id: 'same', at: 0 }).toEqual(unbudgeted.manifest);
  }, 120_000);

  it('admission with 60 old dispositions and one declared pile stays within the subrequest budget', async () => {
    const folder = await driveFolder();
    const piles = await folder.drive.createFolder(folder.bower, 'piles');
    await declaredPile(folder, piles.id, 1);
    for (let n = 0; n < 60; n += 1) await folder.drive.createText(piles.id, `disposition-${n.toString(16).padStart(64, '0')}.json`, '{}');
    const unbudgeted = await planAdmission(driveRead(httpOf(folder)), folder.root, OPTS);
    if (unbudgeted.kind !== 'manifest') throw new Error('expected a manifest');
    const after = await pressCounted(folder);
    expect(after.status).toBe(200);
    expect(after.fetches).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
    expect({ ...after.manifest, id: 'same', at: 0 }).toEqual(unbudgeted.manifest);
  }, 120_000);

  it('admission with 50 of your changes stays within the subrequest budget', async () => {
    const folder = await driveFolder();
    for (let n = 1; n <= 50; n += 1) await change(folder, n);
    await folder.drive.createText(folder.inbox, 'receipt.pdf', '%PDF receipt', { pile: 'p-receipt' });
    const unbudgeted = await planAdmission(driveRead(httpOf(folder)), folder.root, OPTS);
    if (unbudgeted.kind !== 'manifest') throw new Error('expected a manifest');
    const after = await pressCounted(folder);
    expect(after.status).toBe(200);
    expect(after.fetches).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
    expect({ ...after.manifest, id: 'same', at: 0 }).toEqual(unbudgeted.manifest);
  }, 120_000);

  it('a pile note admission could not read is left to the runner, which holds a newer or blank one as unbudgeted', async () => {
    const folder = await driveFolder();
    const newer = await folder.drive.createFolder(folder.inbox, 'Papers', { pile: 'pile-new' });
    await folder.drive.createText(newer.id, 'Pile note.md', '---\nbower_format: ownership/3\n---\nfuture words\n');
    await folder.drive.createText(newer.id, 'a.pdf', '%PDF a');
    const blank = await folder.drive.createFolder(folder.inbox, 'Blank', { pile: 'pile-blank' });
    await folder.drive.createText(blank.id, 'Pile note.md', '---\ntags: x\n---\n');
    const plain = await folder.drive.createFolder(folder.inbox, 'Receipts', { pile: 'pile-plain' });
    await folder.drive.createText(plain.id, 'Pile note.md', 'Receipts from Alex');
    await folder.drive.createText(plain.id, 'r.pdf', '%PDF r');
    const unbudgeted = await planAdmission(driveRead(httpOf(folder)), folder.root, OPTS);
    if (unbudgeted.kind !== 'manifest') throw new Error('expected a manifest');
    expect(unbudgeted.manifest.piles.map((p) => p.pileId)).toEqual(['pile-plain']);
    // Out of subrequests right after the listing, before the first read: no note is read at admission.
    const count = { n: 0, reads: 0 };
    const spent = { n: 0 };
    const http = httpOf(folder, count);
    const listAll = http.listAll.bind(http);
    http.listAll = async (root, o) => {
      const all = await listAll(root, o);
      spent.n = SUBREQUEST_BUDGET;
      return all;
    };
    const budgeted = await planAdmission(admissionRead(http, 'all', { limit: SUBREQUEST_BUDGET, reserve: DISPATCH_SUBREQUESTS, used: () => spent.n + count.n }), folder.root, OPTS);
    if (budgeted.kind !== 'manifest') throw new Error('expected a manifest');
    // Listed only: no file was read.
    expect(count.reads).toBe(0);
    // The runner reads the notes it was handed and holds the newer and the blank pile, as the unbudgeted plan does.
    expect(await runnerTakes(folder, budgeted.manifest)).toEqual(unbudgeted.manifest.piles.map((p) => p.pileId));
    const ordinary = budgeted.manifest.piles.find((p) => p.pileId === 'pile-plain');
    expect(ordinary).toEqual(unbudgeted.manifest.piles[0]);
  }, 120_000);
});

describe('the Bin lookup in admission', () => {
  /**
   * Admission's reader with the invocation at `at` fetches when the Bin is asked (TL-P4-11: 35, 3 for the dispatch).
   * The Bin holds `keys.length` members whose folders are in the Bin too (Drive marks a trashed folder's children
   * trashed, `explicitlyTrashed` false): each folder is in no listing, and its place is only found through `files.get`.
   */
  async function askBin(keys: string[], at = 30): Promise<{ fetches: number; granted: boolean }> {
    const folder = await driveFolder();
    const count = { n: 0 };
    const scripted = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      const stamp = { modifiedTime: '2026-10-09T10:00:00.000Z', createdTime: '2026-10-09T10:00:00.000Z' };
      if (url.searchParams.get('q')?.startsWith('trashed = true')) {
        const files = keys.map((k, i) => ({ id: `kid-${i}`, name: `m${i}.pdf`, mimeType: 'application/pdf', parents: [`gone-${i}`], appProperties: { bowerItem: k }, size: '5', sha256Checksum: 'ab', ...stamp }));
        return new Response(JSON.stringify({ files }));
      }
      const gone = /\/files\/(gone-\d+)$/.exec(url.pathname);
      if (gone) return new Response(JSON.stringify({ id: gone[1], parents: [folder.root] }));
      return await folder.fetchImpl(String(input), init);
    };
    const http = new DriveHttp({ token: async () => 'access-cached', fetch: async (i, init) => (count.n += 1, scripted(i, init)) });
    let shift = 0;
    const read = admissionRead(http, 'all', { used: () => shift + count.n, limit: SUBREQUEST_BUDGET, reserve: DISPATCH_SUBREQUESTS });
    await read.listAll(folder.root);
    shift = at - count.n;
    const before = count.n;
    const granted = await read.binnedByItem(folder.root, keys).then(() => true, (e: unknown) => {
      if (e instanceof NotReadHere) return false;
      throw e;
    });
    return { fetches: count.n - before, granted };
  }

  it('the Bin lookup in admission stays within its subrequest grant', async () => {
    expect((await askBin([])).fetches, 'fetches with no missing member').toBe(0);
    const one = await askBin(['key-0']);
    expect(one.fetches, `fetches for 1 key in 1 binned folder (granted ${one.granted})`).toBeLessThanOrEqual(2);
    const keys = ['key-0', 'key-1', 'key-2', 'key-3'];
    const many = await askBin(keys);
    expect(many.fetches, `fetches for ${keys.length} keys in ${keys.length} binned folders (granted ${many.granted})`).toBeLessThanOrEqual(2);
  }, 60_000);
});
