import { describe, expect, it, vi } from 'vitest';
import type { DriveFile } from './drive/drive-api';
import type { Declaration } from './contracts/pile-declaration';
import { SET_ASIDE } from './fake/fake-runner';
import { SET_ASIDE_TEXT, declarationRecord, findLooseDeclarations, setAsideOf } from './pile-readiness';
import { BowerError } from './types';
import { recordStamp } from './vault/layout';
import { FakeDrive } from './drive/fake-drive';
import { seedFakeDrive } from './fake/seed';
import { DriveVault } from './vault/drive-vault';
import { capturePiles, pileShape } from './spine/plan';
import { fakeRead } from './spine/read';

it('pile-binned-context-hold: shared readiness never holds a Drive-binned note without an inbox reason', async () => {
  localStorage.clear();
  const drive = new FakeDrive();
  const root = (await seedFakeDrive(drive, 'default', Date.UTC(2026, 9, 11))) ?? '';
  const client = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
  const uploader = client();
  const pile = await uploader.addPile({ text: 'Papers from Alex', items: ['a.pdf', 'b.pdf'].map((name) => ({ name, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${name}`]) })) });
  await uploader.settled();
  const files = await drive.listAll(root);
  const folder = files.find((f) => f.folder && f.appProperties?.pile === pile.id);
  const note = files.find((f) => f.parents[0] === folder?.id && f.appProperties?.bowerItem && f.name === 'Pile note.md');
  if (!note) throw new Error('no declared context');
  await drive.trash(note.id);
  const app = client();
  expect(await app.changes()).toEqual([]);
  const seen = (await app.piles()).find((p) => p.id === pile.id);
  if (!seen) throw new Error('pile disappeared');
  expect(seen.items.map((i) => i.name).sort()).toEqual(['a.pdf', 'b.pdf']);
  const captured = (await capturePiles(fakeRead(drive), root, [pileShape(seen)], { notes: true })).get(pile.id);
  expect(captured).toBeDefined();
  expect(captured?.blocked).toBe(seen.setAside ? SET_ASIDE_TEXT[seen.setAside] : null);
});

describe('a set-aside pile shows its reason in the inbox', () => {
  it('in the same words as the tidy-up report', () => {
    expect(SET_ASIDE_TEXT).toEqual({
      'not-arrived': SET_ASIDE.notArrived,
      'not-checked': SET_ASIDE.notChecked,
      unreadable: SET_ASIDE.unreadable,
      changed: SET_ASIDE.changed,
      declaration: SET_ASIDE.declaration,
      empty: SET_ASIDE.empty,
      'note-format': SET_ASIDE.noteFormat,
      'note-damaged': SET_ASIDE.noteDamaged,
      'not-tidied': SET_ASIDE.notTidied,
    });
  });

  it('for the reasons the runner reads, in its order', () => {
    const some = { things: 1, text: '', restore: false };
    const none = { things: 0, text: '', restore: false };
    expect(setAsideOf('unmarked', null, none)).toBeNull();
    expect(setAsideOf('conflict', null, some)).toBe('declaration');
    expect(setAsideOf('missing', null, some)).toBe('not-checked');
    expect(setAsideOf('unreadable', null, none)).toBe('unreadable');
    expect(setAsideOf('found', 'changed', none)).toBe('changed');
    expect(setAsideOf('found', 'not-arrived', some)).toBe('not-arrived');
    expect(setAsideOf('found', 'not-checked', some)).toBe('not-checked');
    expect(setAsideOf('found', null, none)).toBe('empty');
    expect(setAsideOf('found', null, { ...none, text: 'Receipts' })).toBeNull();
    expect(setAsideOf('found', null, { ...none, restore: true })).toBeNull();
    expect(setAsideOf('found', null, some)).toBeNull();
  });
});

describe('loose declarations are found in .bower/piles by real parents', () => {
  const at = '2026-10-06T10:00:00.000Z';
  const file = (id: string, name: string, parent: string, folder = false, appProperties?: Record<string, string>): DriveFile => ({ id, name, folder, parents: [parent], modifiedTime: at, createdTime: at, ...(appProperties ? { appProperties } : {}) });
  const loose = (declarationId: string, inboxId = 'INBOX_ID', size = 8): Declaration => ({
    v: 1, kind: 'pile-declaration', scope: { rootId: 'ROOT_ID' }, declarationId, pileId: `pile-${declarationId}`, createdAt: 1,
    anchor: { kind: 'loose', inboxId },
    members: [{ memberKey: `member-${declarationId}`, name: 'receipt.txt', kind: 'other', origin: null, content: { encoding: 'blob', size, sha256: '0'.repeat(64) } }],
    context: { kind: 'absent' },
  });

  it('keeps identical copies as one, and leaves out folder piles, other inboxes, differing copies and copies gone since', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bytes = new Map<string, string>();
    const files: DriveFile[] = [file('BOWER', '.bower', 'ROOT_ID', true), file('PILES', 'piles', 'BOWER', true)];
    const put = async (id: string, value: Declaration, parent = 'PILES'): Promise<void> => {
      const record = await declarationRecord(value, 'ROOT_ID');
      if (!record) throw new Error('refused');
      bytes.set(id, record.text);
      files.push(file(id, record.name, parent, false, recordStamp(value.pileId, value.anchor.kind)));
    };
    await put('one-a', loose('one'));
    await put('one-b', loose('one'));
    await put('other-inbox', loose('elsewhere', 'OTHER_INBOX'));
    await put('two-a', loose('two'));
    await put('two-b', loose('two', 'INBOX_ID', 9));
    await put('outside', loose('outside'), 'ROOT_ID');
    await put('gone', loose('gone'));
    const folder: Declaration = { ...loose('folder'), anchor: { kind: 'folder', inboxId: 'INBOX_ID', name: 'Papers', createKey: 'anchor-folder' } };
    await put('folder', folder);
    const read = async (id: string): Promise<Uint8Array> => {
      if (id === 'gone') throw new BowerError('not-found', 'That is no longer there.');
      return new TextEncoder().encode(bytes.get(id) ?? '');
    };
    const found = await findLooseDeclarations(files, 'ROOT_ID', 'INBOX_ID', read);
    expect(found.map((d) => [d.declaration.declarationId, d.copies.map((c) => c.id)])).toEqual([['one', ['one-a', 'one-b']]]);
    expect(errors).toHaveBeenCalled();
  });

  it('skips a copy it cannot read, and stops only when signed out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const files: DriveFile[] = [file('BOWER', '.bower', 'ROOT_ID', true), file('PILES', 'piles', 'BOWER', true), file('copy', `declaration-one-${'0'.repeat(64)}.json`, 'PILES', false, recordStamp('pile-one', 'loose'))];
    await expect(findLooseDeclarations(files, 'ROOT_ID', 'INBOX_ID', async () => { throw new BowerError('offline', 'You are offline.'); })).resolves.toEqual([]);
    await expect(findLooseDeclarations(files, 'ROOT_ID', 'INBOX_ID', async () => { throw new BowerError('auth', 'Sign in again.'); })).rejects.toMatchObject({ code: 'auth' });
  });

  it('never reads a declaration it is told to skip', async () => {
    const files: DriveFile[] = [file('BOWER', '.bower', 'ROOT_ID', true), file('PILES', 'piles', 'BOWER', true), file('copy', `declaration-decl-a-b-${'0'.repeat(64)}.json`, 'PILES')];
    const read = vi.fn(async (): Promise<Uint8Array> => new Uint8Array());
    await expect(findLooseDeclarations(files, 'ROOT_ID', 'INBOX_ID', read, undefined, new Set(['decl-a-b']))).resolves.toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
});
