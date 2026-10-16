import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { tidyUp } from '@/testing/tidy-up';
import type { EffectEvidence, Outcome } from '../contracts/run-checkpoint';
import { parsePileDeclaration } from '../contracts/pile-declaration';
import { parsePileDisposition } from '../contracts/pile-disposition';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { SET_ASIDE_TEXT, pileRecords } from '../pile-readiness';
import type { RunManifest } from '../spine/records';
import { dispositionsFor } from '../spine/report';
import { DriveVault } from './drive-vault';

const vaults: DriveVault[] = [];

beforeEach(() => localStorage.clear());
afterEach(() => {
  for (const vault of vaults) vault.dispose();
  vaults.length = 0;
  vi.restoreAllMocks();
});

const TEXT = 'The offer letter again.';

/**
 * A first tidy-up files a thing; then a declared pile with words and one thing of the same bytes is added. The pile, its
 * declared thing and member key, and a way to open another vault on the same drive (a reload).
 */
async function wordsWithCopy() {
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
  const pile = await live.addPile({
    text: TEXT,
    items: [{ name: 'Offer letter.pdf', kind: 'pdf', origin: 'From this computer', body }],
  });
  await live.settled();
  const before = (await live.piles()).find((p) => p.id === pile.id);
  expect(before).toMatchObject({ text: TEXT, items: [expect.objectContaining({ name: 'Offer letter.pdf' })] });
  expect(before?.setAside).toBeUndefined();
  const thing = before?.items[0];
  if (!thing) throw new Error('The declared thing did not arrive.');
  const files = await drive.listAll(root);
  const declaration = files.find((f) => f.name.startsWith('declaration-') && f.appProperties?.bowerRecordPile === pile.id);
  if (!declaration) throw new Error('The pile declaration is missing.');
  const parsed = await parsePileDeclaration(await drive.readBytes(declaration.id), root);
  expect(parsed).toMatchObject({
    ok: true,
    value: { context: { kind: 'text', originalText: TEXT }, members: [expect.objectContaining({ name: thing.name })] },
  });
  const memberKey = parsed.ok ? parsed.value.members[0]?.memberKey : undefined;
  if (!memberKey) throw new Error('The declared member has no key.');
  return { drive, root, live, open, pile, thing, memberKey };
}

/** The pile's dispositions in `.bower/piles`, parsed. */
async function dispositionsOf(drive: FakeDrive, root: string, pileId: string) {
  const records = pileRecords(await drive.listAll(root), root, 'disposition', new Set([pileId]));
  return Promise.all(records.map(async (f) => parsePileDisposition(await drive.readBytes(f.id), root)));
}

test.each(['before reload', 'after reload'])('AC1: a declared pile keeps its words after a tidy-up bins its duplicate (%s)', async (when) => {
  const { drive, root, live, open, pile, thing } = await wordsWithCopy();
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
  expect.soft(seen?.text).toBe(TEXT);
});

test('AC2: the run records the duplicate\'s Bin in the pile\'s consumed disposition (the fake run service, through finishRun)', async () => {
  const { drive, root, pile, thing, memberKey } = await wordsWithCopy();
  const second = await tidyUp(drive, root);
  expect(second.phase).toBe('done');
  const found = await dispositionsOf(drive, root, pile.id);
  expect(found).toEqual([expect.objectContaining({
    ok: true,
    value: expect.objectContaining({
      pileId: pile.id, action: 'consumed', memberKeys: [memberKey],
      authority: expect.objectContaining({ kind: 'run' }),
      operations: [expect.objectContaining({ evidence: expect.objectContaining({ trashed: true, file: expect.objectContaining({ fileId: thing.id }) }) })],
    }),
  })]);
});

test('AC2: dispositionsFor, which the runner and the fake run service both end a run with, accounts an applied duplicate Bin, and only an applied one', async () => {
  const { drive, root, pile, thing, memberKey } = await wordsWithCopy();
  const second = await tidyUp(drive, root);
  expect(second.phase).toBe('done');
  const manifest: RunManifest = second.manifest;
  const bin = manifest.operations.find((o) => o.effect.kind === 'bin' && o.effect.before.fileId === thing.id);
  if (bin?.effect.kind !== 'bin') throw new Error('The duplicate\'s Bin was not planned.');
  const binned = bin.effect.before;
  const evidence = (trashed: boolean): EffectEvidence => ({ file: binned, trashed, content: null, provenance: 'fake-stored' });
  const applied: Outcome[] = manifest.operations.map((o) => ({ operationId: o.operationId, state: 'applied', evidence: evidence(o === bin) }));
  expect(dispositionsFor(manifest, applied, 'a'.repeat(64)).filter((d) => d.pileId === pile.id)).toEqual([expect.objectContaining({
    action: 'consumed', memberKeys: [memberKey], operations: [{ operationId: bin.operationId, evidence: evidence(true) }],
  })]);
  const refused: Outcome[] = applied.map((o) => (o.operationId === bin.operationId
    ? { operationId: o.operationId, state: 'rejected', failure: { code: 'conflict', message: "It couldn't be filed this time." } }
    : o));
  expect(dispositionsFor(manifest, refused, 'a'.repeat(64)).filter((d) => d.pileId === pile.id)).toEqual([]);
});

test('AC3: a thing the person bins in place, with no run, keeps today\'s accounting (guard)', async () => {
  const { drive, root, open, pile, thing } = await wordsWithCopy();
  await drive.trash(thing.id);
  const seen = (await open().piles()).find((p) => p.id === pile.id);
  expect(seen).toMatchObject({ text: TEXT, setAside: 'not-arrived' });
  expect(await dispositionsOf(drive, root, pile.id)).toEqual([]);
});
