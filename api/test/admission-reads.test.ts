/**
 * What admission costs in Drive calls and time (TL-P4-04): a folder shaped like staging's (five piles added in the
 * app, each with its list of things and a note, ten notes in the areas, two of your changes), read over a pretend
 * Drive v3 that takes about 150 ms to answer each call, as the live tail measured.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DriveHttp } from '../../src/data/drive/drive-http.js';
import { planAdmission } from '../../src/data/spine/plan.js';
import { driveRead } from '../../src/data/spine/read.js';
import { declaredPile, holderOf, press, pressGitHub, storedManifest } from './admission-support.js';
import { driveFolder, type DriveFolder } from './drive-v3.js';

/** The GitHub the alarm reaches: each press dispatches its run from the alarm. */
const gh = pressGitHub();

/** About what one Drive call took in the live tail. */
const DRIVE_MS = 150;
/** The budget for admission's reads on a folder like staging's. */
const BUDGET_MS = 3000;

/** A folder like staging's: five piles added in the app, ten notes in the areas, two of your changes. */
async function stagingLike(): Promise<DriveFolder> {
  const folder = await driveFolder();
  const { drive, root, bower } = folder;
  const piles = await drive.createFolder(bower, 'piles');
  for (let n = 1; n <= 5; n += 1) await declaredPile(folder, piles.id, n);
  const areas = await drive.createFolder(root, 'Areas');
  for (let i = 1; i <= 10; i += 1) {
    const topic = await drive.createFolder(areas.id, `Topic ${i}`);
    await drive.createText(topic.id, `Note ${i}.md`, `# Note ${i}\n\nSomething Alex keeps.\n`);
  }
  const changes = (await drive.listAll(root)).find((f) => f.folder && f.name === 'changes');
  for (let i = 1; i <= 2; i += 1) {
    const line = { v: 1, id: `change-${i}`, device: 'laptop', at: i, what: 'A rule', kind: 'rule', text: `Receipts go to Money ${i}` };
    await drive.createText(changes?.id ?? '', `change-${i}.json`, JSON.stringify(line));
  }
  return folder;
}

/** Drive calls as the Worker sends them, each answered after `ms`, counted. */
function slowed(folder: DriveFolder, ms: number): { fetchImpl: DriveFolder['fetchImpl']; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    fetchImpl: async (url, init) => {
      if (new URL(url).origin === 'https://www.googleapis.com') {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
      return await folder.fetchImpl(url, init);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('admission reads', () => {
  it('admission reads finish under the budget with modelled Drive latency', async () => {
    const folder = await stagingLike();
    const who = await holderOf(folder);
    const drive = slowed(folder, DRIVE_MS);
    const log = vi.spyOn(console, 'log');
    const r = await press(drive.fetchImpl, who.headers, gh);
    expect(r.status).toBe(200);
    const timing = log.mock.calls.map((args) => String(args[0])).find((line) => line.startsWith('admission timing:')) ?? '';
    const reads = Number(/reads=(\d+)ms/.exec(timing)?.[1] ?? NaN);
    console.info(`modelled admission reads: ${reads} ms in ${drive.calls()} Drive calls`);
    expect(reads).toBeLessThan(BUDGET_MS);
    // All five piles are admitted, with your changes.
    const manifest = await storedManifest(who.sub);
    expect(manifest.piles).toHaveLength(5);
    expect(manifest.piles.every((p) => p.declaration !== null && p.items.length === 3)).toBe(true);
    expect(manifest.journal).toHaveLength(2);
  }, 60_000);

  it('admission reads give the same result in fewer calls', async () => {
    const folder = await stagingLike();
    const who = await holderOf(folder);
    // The shared plan over the plain Drive adapter, as admission read before: the result to match.
    const plain = slowed(folder, 0);
    const http = new DriveHttp({ token: async () => 'access-cached', fetch: async (input, init) => await plain.fetchImpl(String(input), init) });
    const before = await planAdmission(driveRead(http), folder.root, { scope: 'all', clock: () => 0, newId: () => 'same' });
    expect(before.kind).toBe('manifest');
    if (before.kind !== 'manifest') return;
    const now = slowed(folder, 0);
    expect((await press(now.fetchImpl, who.headers, gh)).status).toBe(200);
    const after = await storedManifest(who.sub);
    expect({ ...after, id: 'same', at: 0 }).toEqual(before.manifest);
    console.info(`admission Drive calls: ${plain.calls()} before, ${now.calls()} now`);
    expect(now.calls()).toBeLessThan(plain.calls());
  }, 60_000);
});
