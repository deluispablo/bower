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

const pdf = (name: string) => ({ name, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF a made-up ${name}`]) });

/**
 * A first tidy-up files a thing; then a declared pile with words and one thing of the same bytes is added. The pile, its
 * declared thing and member key, and a way to open another vault on the same drive (a reload).
 */
async function wordsWithCopy() {
  return wordsWith(['Offer letter.pdf'], []);
}

/**
 * A first tidy-up files `copies`; then a declared pile with words, the same bytes again and `fresh` things is added.
 * The pile, its first thing and member key, every thing and member key in declaration order, and a reload.
 */
async function wordsWith(copies: readonly string[], fresh: readonly string[]) {
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
  await live.addPile({ text: '', items: copies.map(pdf) });
  await live.settled();
  const first = await tidyUp(drive, root);
  expect(first.phase).toBe('done');
  if (first.phase !== 'done') throw new Error('The first tidy-up did not finish.');
  for (const name of copies) expect(first.report.filed).toContainEqual(expect.objectContaining({ name }));
  await live.refresh();
  const names = [...copies, ...fresh];
  const pile = await live.addPile({ text: TEXT, items: names.map(pdf) });
  await live.settled();
  const before = (await live.piles()).find((p) => p.id === pile.id);
  expect(before).toMatchObject({ text: TEXT });
  expect(before?.items.map((i) => i.name).sort()).toEqual([...names].sort());
  expect(before?.setAside).toBeUndefined();
  const things = names.map((name) => before?.items.find((i) => i.name === name));
  if (!things.every((t) => t !== undefined)) throw new Error('A declared thing did not arrive.');
  const files = await drive.listAll(root);
  const declaration = files.find((f) => f.name.startsWith('declaration-') && f.appProperties?.bowerRecordPile === pile.id);
  if (!declaration) throw new Error('The pile declaration is missing.');
  const parsed = await parsePileDeclaration(await drive.readBytes(declaration.id), root);
  expect(parsed).toMatchObject({ ok: true, value: { context: { kind: 'text', originalText: TEXT } } });
  const memberKeys = names.map((name) => (parsed.ok ? parsed.value.members.find((m) => m.name === name)?.memberKey : undefined));
  if (!memberKeys.every((k) => k !== undefined)) throw new Error('A declared member has no key.');
  const [thing, memberKey] = [things[0], memberKeys[0]];
  if (!thing || !memberKey) throw new Error('The pile has no thing.');
  return { drive, root, live, open, pile, thing, memberKey, things, memberKeys };
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

test('R3: the next tidy-up takes the kept words as a pile of words, not waiting for the binned copy', async () => {
  const { drive, root, live, pile } = await wordsWithCopy();
  expect((await tidyUp(drive, root)).phase).toBe('done');
  const third = await tidyUp(drive, root);
  expect(third.manifest.capture.piles).toContainEqual(expect.objectContaining({ pileId: pile.id, context: expect.objectContaining({ kind: 'text' }) }));
  expect(third.phase).toBe('done');
  if (third.phase !== 'done') throw new Error('The third tidy-up did not finish.');
  expect(third.report.filed).toContainEqual(expect.objectContaining({ kind: 'note', title: TEXT }));
  await live.refresh();
  expect((await live.piles()).find((p) => p.id === pile.id)).toBeUndefined();
});

/** Per thing, whether the run binned it (a copy) or moved it (a new thing). */
const MIXES = [
  { mix: 'a copy and a new thing', copies: ['Offer letter.pdf'], fresh: ['Signed contract.pdf'] },
  { mix: 'two copies', copies: ['Offer letter.pdf', 'Payslip.pdf'], fresh: [] },
] as const;

test.each(MIXES)('R3/R4: a pile of $mix gets one consumed disposition with each member\'s operation once', async ({ copies, fresh }) => {
  const { drive, root, pile, things, memberKeys } = await wordsWith(copies, fresh);
  const second = await tidyUp(drive, root);
  expect(second.phase).toBe('done');
  if (second.phase !== 'done') throw new Error('The second tidy-up did not finish.');
  for (const name of copies) expect(second.report.alreadySaved ?? []).toContainEqual(expect.objectContaining({ name }));
  const found = await dispositionsOf(drive, root, pile.id);
  expect(found).toHaveLength(1);
  const value = found[0]?.ok ? found[0].value : undefined;
  expect(value).toMatchObject({ action: 'consumed', authority: { kind: 'run' } });
  expect([...(value?.memberKeys ?? [])].sort()).toEqual([...memberKeys].sort());
  const ids = (value?.operations ?? []).map((o) => o.operationId);
  expect(new Set(ids).size).toBe(ids.length);
  things.forEach((thing, i) => {
    const mine = (value?.operations ?? []).filter((o) => o.evidence.file.fileId === thing.id);
    expect(mine, thing.name).toEqual([expect.objectContaining({ evidence: expect.objectContaining({ trashed: i < copies.length }) })]);
  });
});

test('R3: dispositionsFor needs every member\'s move or Bin applied, each member covered, not just as many operations', async () => {
  const { drive, root, pile, things } = await wordsWith(['Offer letter.pdf'], ['Signed contract.pdf']);
  const second = await tidyUp(drive, root);
  expect(second.phase).toBe('done');
  const manifest: RunManifest = second.manifest;
  const of = (fileId: string) => {
    const op = manifest.operations.find((o) => (o.effect.kind === 'bin' || o.effect.kind === 'move') && o.effect.before.fileId === fileId);
    if (op?.effect.kind !== 'bin' && op?.effect.kind !== 'move') throw new Error('A member\'s operation was not planned.');
    return { op, file: op.effect.before };
  };
  const [copy, move] = things.map((t) => of(t.id));
  if (!copy || !move) throw new Error('The pile has no copy and new thing.');
  const evidenceOf = (o: RunManifest['operations'][number]): EffectEvidence => {
    const member = o === copy.op ? copy : move;
    return { file: member.file, trashed: o.effect.kind === 'bin', content: null, provenance: 'fake-stored' };
  };
  const applied: Outcome[] = manifest.operations.map((o) => ({ operationId: o.operationId, state: 'applied', evidence: evidenceOf(o) }));
  const mine = (m: RunManifest, outcomes: Outcome[]) => dispositionsFor(m, outcomes, 'a'.repeat(64)).filter((d) => d.pileId === pile.id);
  expect(mine(manifest, applied)).toEqual([expect.objectContaining({ action: 'consumed' })]);
  const rejected = applied.map((o): Outcome => (o.operationId === move.op.operationId
    ? { operationId: o.operationId, state: 'rejected', failure: { code: 'conflict', message: "It couldn't be filed this time." } }
    : o));
  expect(mine(manifest, rejected), 'a rejected move').toEqual([]);
  expect(mine(manifest, applied.filter((o) => o.operationId !== move.op.operationId)), 'an unsettled move').toEqual([]);
  expect(mine(manifest, applied.filter((o) => o.operationId !== copy.op.operationId)), 'an unsettled Bin').toEqual([]);
  // As many member operations as members, but two for the copy and none for the new thing.
  const twice = { ...copy.op, operationId: `${copy.op.operationId}-again` };
  const lopsided: RunManifest = { ...manifest, operations: [...manifest.operations.filter((o) => o !== move.op), twice] };
  const lopsidedOutcomes: Outcome[] = [...applied, { operationId: twice.operationId, state: 'applied', evidence: evidenceOf(copy.op) }];
  expect(mine(lopsided, lopsidedOutcomes), 'a member left uncovered').toEqual([]);
});
