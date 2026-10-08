import { describe, expect, it, vi } from 'vitest';
import type { DriveFile } from './drive/drive-api';
import { FakeDrive } from './drive/fake-drive';
import { seedFakeDrive } from './fake/seed';
import { findLooseDeclarations, pileRecords } from './pile-readiness';
import { DriveVault } from './vault/drive-vault';
import { PROP, recordStamp } from './vault/layout';

const at = '2026-10-06T10:00:00.000Z';
const hash = '0'.repeat(64);
const file = (id: string, name: string, parent: string, appProperties?: Record<string, string>, folder = false): DriveFile => ({ id, name, folder, parents: [parent], modifiedTime: at, createdTime: at, ...(appProperties ? { appProperties } : {}) });
const base = (): DriveFile[] => [file('BOWER', '.bower', 'ROOT_ID', undefined, true), file('PILES', 'piles', 'BOWER', undefined, true)];

describe('the pile-records query picks records by the pile id they are stamped with', () => {
  it('returns the stamped records of the piles asked for, and every record written before the stamp', () => {
    const files = [
      ...base(),
      file('d-1', `declaration-decl-1-${hash}.json`, 'PILES', recordStamp('pile-1', 'folder')),
      file('d-10', `declaration-decl-10-${hash}.json`, 'PILES', recordStamp('pile-10', 'folder')),
      file('d-old', `declaration-decl-old-${hash}.json`, 'PILES'),
      file('x-1', `disposition-${'1'.repeat(64)}.json`, 'PILES', recordStamp('pile-1')),
      file('x-10', `disposition-${'2'.repeat(64)}.json`, 'PILES', recordStamp('pile-10')),
      // A name that mentions pile-1 but is stamped for another pile, and a file elsewhere: never picked.
      file('x-named', `disposition-pile-1-${'3'.repeat(64)}.json`, 'PILES', recordStamp('pile-9')),
      file('x-away', `disposition-${'4'.repeat(64)}.json`, 'ROOT_ID', recordStamp('pile-1')),
    ];
    expect(pileRecords(files, 'ROOT_ID', 'disposition', new Set(['pile-1'])).map((f) => f.id)).toEqual(['x-1']);
    expect(pileRecords(files, 'ROOT_ID', 'declaration', new Set(['pile-1'])).map((f) => f.id)).toEqual(['d-1', 'd-old']);
    expect(pileRecords(files, 'ROOT_ID', 'disposition').map((f) => f.id)).toEqual(['x-1', 'x-10', 'x-named']);
  });

  it('a new pile declaration is stamped with its pile id and layout, so a later Home never reads it for another pile', async () => {
    const drive = new FakeDrive();
    const root = (await seedFakeDrive(drive, 'default', Date.now())) as string;
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
    const pile = await vault.addPile({ text: 'Papers from Alex', items: [{ name: 'a.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob(['%PDF a']) }] });
    await vault.settled();
    const folder = (await drive.listAll(root)).find((f) => f.folder && f.name.endsWith('Papers from Alex'));
    const copies = pileRecords(await drive.listAll(root), root, 'declaration');
    expect(copies).toHaveLength(1);
    expect(copies[0]?.appProperties).toEqual({ [PROP.recordPile]: folder?.appProperties?.[PROP.pile], [PROP.recordAnchor]: 'folder' });
    expect(folder?.appProperties?.[PROP.pile]).toBe(pile.id);
  });
});

describe('loose declarations are read only when they can be waiting', () => {
  it('skips folder declarations and those a stamped disposition retired, reads the rest together, and never loses one written before the stamp', async () => {
    const reads: string[] = [];
    const files = [
      ...base(),
      file('keep', `declaration-keep-${hash}.json`, 'PILES', recordStamp('pile-keep', 'loose')),
      file('done', `declaration-done-${hash}.json`, 'PILES', recordStamp('pile-done', 'loose')),
      file('done-x', `disposition-${'1'.repeat(64)}.json`, 'PILES', recordStamp('pile-done')),
      file('folder', `declaration-folder-${hash}.json`, 'PILES', recordStamp('pile-folder', 'folder')),
      file('old', `declaration-old-${hash}.json`, 'PILES'),
    ];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await findLooseDeclarations(files, 'ROOT_ID', 'INBOX_ID', async (id) => { reads.push(id); return new Uint8Array(); });
    expect(reads.sort()).toEqual(['keep', 'old']);
  });

  it('for one pile asks only its own copies and the unstamped ones, whatever retired it', async () => {
    const reads: string[] = [];
    const files = [
      ...base(),
      file('mine', `declaration-a-${hash}.json`, 'PILES', recordStamp('pile-1', 'loose')),
      file('mine-x', `disposition-${'1'.repeat(64)}.json`, 'PILES', recordStamp('pile-1')),
      file('theirs', `declaration-b-${hash}.json`, 'PILES', recordStamp('pile-10', 'loose')),
      file('old', `declaration-c-${hash}.json`, 'PILES'),
    ];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await findLooseDeclarations(files, 'ROOT_ID', 'INBOX_ID', async (id) => { reads.push(id); return new Uint8Array(); }, undefined, new Set(), 'pile-1');
    expect(reads.sort()).toEqual(['mine', 'old']);
  });
});
