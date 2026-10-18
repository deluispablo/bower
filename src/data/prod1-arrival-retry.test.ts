import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalRecord } from './contracts/journal-record';
import { isJournalRecord } from './contracts/journal-record';
import { parsePileDeclaration } from './contracts/pile-declaration';
import type { Disposition } from './contracts/pile-disposition';
import { canonicalRecordJson, hashRecordJson } from './contracts/record-json';
import { FakeDrive } from './drive/fake-drive';
import type { DriveFile } from './drive/drive-api';
import { pileRecords } from './pile-readiness';
import { PILE_NOTE } from './piles';
import { BowerError } from './types';
import { DriveVault } from './vault/drive-vault';
import { PROP, recordStamp } from './vault/layout';

const AT = Date.parse('2026-10-10T12:00:00Z');
const pages: DriveVault[] = [];

beforeEach(() => {
  vi.setSystemTime(AT);
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const page of pages) page.dispose();
  pages.length = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

interface Fixture { drive: FakeDrive; root: string; inbox: string; records: string; changes: string; copy: DriveFile; pileId: string; journal: DriveFile }

const page = (f: Pick<Fixture, 'drive' | 'root'>): DriveVault => {
  const vault = new DriveVault({ drive: f.drive, rootId: async () => f.root, runningPiles: () => new Set(), declarePiles: true, device: 'DEVICE_A' });
  pages.push(vault);
  return vault;
};

/**
 * A context-only Add whose folder was never made, and a journal line saying its pile note went to the Bin: complete
 * evidence that nothing is left to arrive, read through the declaration, the journal and the Bin lookup.
 */
async function fixture(): Promise<Fixture> {
  const drive = new FakeDrive({ clock: () => AT, chunkMultiple: 4 });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  const system = (await drive.createFolder(root, '.bower')).id;
  const records = (await drive.createFolder(system, 'piles')).id;
  const changes = (await drive.createFolder(system, 'changes')).id;
  const create = drive.createFolder.bind(drive);
  const fail = vi.spyOn(drive, 'createFolder').mockImplementation(async (...args) => {
    if (args[0] === inbox && args[2]?.[PROP.declaration]) throw new BowerError('offline', 'You are offline.');
    return create(...args);
  });
  const uploader = page({ drive, root });
  await expect(uploader.addPile({ text: 'Context from Alex', items: [] })).rejects.toMatchObject({ code: 'offline' });
  fail.mockRestore();
  uploader.dispose();
  const [copy, ...more] = pileRecords(await drive.listAll(root), root, 'declaration');
  expect(more).toEqual([]);
  if (!copy) throw new Error('The positive declaration control failed.');
  const parsed = await parsePileDeclaration(await drive.readBytes(copy.id), root);
  if (!parsed.ok || parsed.value.anchor.kind !== 'folder') throw new Error('The positive folder declaration control failed.');
  const record: JournalRecord = { v: 1, id: 'trash-pile-note', device: 'DEVICE_B', at: AT - 1, kind: 'trash', what: 'Put a pile note in the Bin', path: `Inbox/${parsed.value.anchor.name}/${PILE_NOTE}` };
  expect(isJournalRecord(record)).toBe(true);
  const journal = await drive.createText(changes, `${record.id}.json`, JSON.stringify(record));
  return { drive, root, inbox, records, changes, copy, pileId: parsed.value.pileId, journal };
}

type Path = 'declaration' | 'journal' | 'bin';

/** One failure on one evidence path: `once` fails its first read only, otherwise every read fails. */
function inject(f: Fixture, path: Path, once: boolean): void {
  let armed = true;
  const fire = (): boolean => { const go = armed; if (once) armed = false; return go; };
  const refusal = () => new BowerError('offline', 'You are offline.');
  if (path === 'declaration') {
    const read = f.drive.readBytes.bind(f.drive);
    vi.spyOn(f.drive, 'readBytes').mockImplementation(async (id, ...rest) => {
      if (id === f.copy.id && fire()) throw refusal();
      return read(id, ...rest);
    });
  } else if (path === 'journal') {
    const read = f.drive.readText.bind(f.drive);
    vi.spyOn(f.drive, 'readText').mockImplementation(async (id, ...rest) => {
      if (id === f.journal.id && fire()) throw refusal();
      return read(id, ...rest);
    });
  } else if (once) vi.spyOn(f.drive, 'binnedByItem').mockRejectedValueOnce(refusal());
  else vi.spyOn(f.drive, 'binnedByItem').mockRejectedValue(refusal());
}

const declarationNow = async (f: Fixture) => {
  const file = await f.drive.get(f.copy.id);
  return { id: file.id, modifiedTime: file.modifiedTime, bytes: [...await f.drive.readBytes(f.copy.id)] };
};

describe('transient_arrival_failure_can_be_rechecked', () => {
  it('the fixture is complete evidence when every read succeeds', async () => {
    const f = await fixture();
    expect(await page(f).orphanSummary()).toEqual({ count: 0, complete: true });
  });

  // guard: refresh already re-reads
  it.each(['declaration', 'journal', 'bin'] as const)('one failed %s read, then Check again, gives a complete answer', async (path) => {
    const f = await fixture();
    const before = await declarationNow(f);
    const snapshot = await f.drive.snapshot();
    inject(f, path, true);
    const reads = vi.spyOn(f.drive, 'readBytes');
    const texts = vi.spyOn(f.drive, 'readText');
    const bins = vi.spyOn(f.drive, 'binnedByItem');
    const count = () => reads.mock.calls.length + texts.mock.calls.length + bins.mock.calls.length + f.drive.calls;
    const vault = page(f);
    expect(await vault.orphanSummary()).toEqual({ count: 0, complete: false });
    // The incomplete answer is held for this listing, not re-read per call.
    const held = count();
    expect(await vault.orphanSummary()).toEqual({ count: 0, complete: false });
    expect(count()).toBe(held);
    await vault.refresh();
    expect(await vault.orphanSummary()).toEqual({ count: 0, complete: true });
    // A complete answer stays cached.
    const done = count();
    expect(await vault.orphanSummary()).toEqual({ count: 0, complete: true });
    expect(count()).toBe(done);
    vi.restoreAllMocks();
    expect(await declarationNow(f)).toEqual(before);
    expect(await f.drive.snapshot()).toBe(snapshot);
  });

  // guard: refresh already re-reads (R-tidyup: the refresh a tidy-up's end makes never clears an unknown answer)
  it.each(['declaration', 'journal', 'bin'] as const)('a %s read that keeps failing stays unknown after a refresh', async (path) => {
    const f = await fixture();
    inject(f, path, false);
    const vault = page(f);
    expect(await vault.orphanSummary()).toEqual({ count: 0, complete: false });
    await vault.refresh();
    expect(await vault.orphanSummary()).toEqual({ count: 0, complete: false });
  });

  // guard: a disposition stamped with the pile retires its declaration from the listing (findPileDeclarations), so
  // the summary never reads it: a failing disposition read cannot make the answer incomplete.
  it('a failing disposition read is never on the summary path', async () => {
    const f = await fixture();
    const parsed = await parsePileDeclaration(await f.drive.readBytes(f.copy.id), f.root);
    if (!parsed.ok) throw new Error('The positive declaration control failed.');
    const value: Disposition = {
      v: 1, kind: 'pile-disposition', scope: { rootId: f.root }, pileId: f.pileId,
      declaration: { declarationId: parsed.value.declarationId, sha256: parsed.sha256 },
      memberKeys: [], action: 'consumed',
      authority: { kind: 'run', runId: 'run-control', reportHash: '1'.repeat(64) },
      operations: [{ operationId: '2'.repeat(64), evidence: {
        file: { fileId: 'FILE_ID', name: 'Filed input.pdf', parents: ['FOLDER_ID'], folder: false, modifiedTime: new Date(AT).toISOString() },
        trashed: false, content: null, provenance: 'fake-stored',
      } }],
    };
    const bytes = canonicalRecordJson(value);
    const hash = await hashRecordJson(value);
    if (!bytes.ok || !hash.ok) throw new Error('The positive disposition writer control failed.');
    const record = await f.drive.createText(f.records, `disposition-${hash.value}.json`, new TextDecoder().decode(bytes.value), recordStamp(f.pileId));
    const read = f.drive.readBytes.bind(f.drive);
    const reads = vi.spyOn(f.drive, 'readBytes').mockImplementation(async (id, ...rest) => {
      if (id === record.id) throw new BowerError('offline', 'You are offline.');
      return read(id, ...rest);
    });
    const vault = page(f);
    expect(await vault.orphanSummary()).toEqual({ count: 0, complete: true });
    expect(reads).not.toHaveBeenCalledWith(record.id);
  });
});
