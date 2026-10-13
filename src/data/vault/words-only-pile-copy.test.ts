import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { tidyUp } from '@/testing/tidy-up';
import { parsePileDeclaration } from '../contracts/pile-declaration';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { SET_ASIDE_TEXT } from '../pile-readiness';
import { DriveVault } from './drive-vault';

const vaults: DriveVault[] = [];

beforeEach(() => localStorage.clear());
afterEach(() => {
  for (const vault of vaults) vault.dispose();
  vaults.length = 0;
  vi.restoreAllMocks();
});

// dispositionsFor records only filing moves, so the run's duplicate Bin leaves both vaults not-arrived (separate fix).
test.fails.each(['before reload', 'after reload'])('AC1: a declared pile keeps its words after a tidy-up bins its duplicate (%s)', async (when) => {
  const drive = new FakeDrive();
  const root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
  const listAll = drive.listAll.bind(drive);
  // Real Drive lists stored-byte MD5s; FakeDrive omits them, so supply them for the run and vault here.
  vi.spyOn(drive, 'listAll').mockImplementation(async (rootId) => Promise.all((await listAll(rootId)).map(async (file) => file.folder ? file : {
    ...file,
    md5Checksum: createHash('md5').update(await drive.readBytes(file.id)).digest('hex'),
  })));
  const open = (): DriveVault => {
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
    vaults.push(vault);
    return vault;
  };
  const live = open();
  const body = new Blob(['%PDF a made-up offer letter']);
  await live.addPile({ text: '', items: [{ name: 'Offer letter.pdf', kind: 'pdf', origin: 'From this computer', body }] });
  await live.settled();
  const first = await tidyUp(drive, root);
  expect(first.phase).toBe('done');
  if (first.phase !== 'done') throw new Error('The first tidy-up did not finish.');
  expect(first.report.filed).toContainEqual(expect.objectContaining({ name: 'Offer letter.pdf' }));
  await live.refresh();
  const text = 'The offer letter again.';
  const pile = await live.addPile({
    text,
    items: [{ name: 'Offer letter.pdf', kind: 'pdf', origin: 'From this computer', body }],
  });
  await live.settled();
  const before = (await live.piles()).find((p) => p.id === pile.id);
  expect(before).toMatchObject({ text, items: [expect.objectContaining({ name: 'Offer letter.pdf' })] });
  expect(before?.setAside).toBeUndefined();
  const thing = before?.items[0];
  if (!thing) throw new Error('The declared thing did not arrive.');
  const files = await drive.listAll(root);
  const declaration = files.find((f) => f.name.startsWith('declaration-') && f.appProperties?.bowerRecordPile === pile.id);
  if (!declaration) throw new Error('The pile declaration is missing.');
  expect(await parsePileDeclaration(await drive.readBytes(declaration.id), root)).toMatchObject({
    ok: true,
    value: { context: { kind: 'text', originalText: text }, members: [expect.objectContaining({ name: thing.name })] },
  });

  const second = await tidyUp(drive, root);
  expect(second.phase).toBe('done');
  if (second.phase !== 'done') throw new Error('The second tidy-up did not finish.');
  expect(second.report.alreadySaved ?? []).toContainEqual(expect.objectContaining({ name: thing.name }));
  expect(await drive.get(thing.id, { binned: true })).toMatchObject({ trashed: true });
  // The live session refreshes its existing vault when the run finishes.
  await live.refresh();
  const seen = (await (when === 'before reload' ? live : open()).piles()).find((p) => p.id === pile.id);
  expect(seen).toBeDefined();
  expect.soft(seen?.setAside).not.toBe('not-arrived');
  expect.soft(seen?.setAside ? SET_ASIDE_TEXT[seen.setAside] : undefined).not.toBe('Some of its things have not arrived yet.');
  expect.soft(seen?.text).toBe(text);
});
