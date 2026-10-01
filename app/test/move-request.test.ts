import { describe, expect, it, vi } from 'vitest';

import { INSTRUCTION_APP_PROPERTIES } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  currentFolderOf,
  moveRequestText,
  pickerFolders,
  replaceRequestNote,
  requestRowText,
  sendMoveRequest,
  undoRequestNote,
  writeRequestNote,
} from '../src/move-request.js';
import { buildTree } from '../src/navigation.js';
import type { TreeNode } from '../src/navigation.js';
import { buildVaultIndex } from '../src/vault-index.js';

function folder(path: string): DriveFile {
  return {
    id: `id-${path}`,
    name: path.slice(path.lastIndexOf('/') + 1),
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['FOLDER_ID'],
    path,
  };
}

function tree(): TreeNode {
  const index = buildVaultIndex([
    folder('0-Inbox'),
    folder('0-Inbox/Later'),
    folder('1-Projects'),
    folder('1-Projects/Flat hunt'),
    folder('2-Areas'),
    folder('2-Areas/Garden'),
    folder('2-Areas/Garden/Beds'),
    folder('3-Resources'),
    folder('4-Archives'),
    folder('Answers'),
  ]);
  return buildTree(index);
}

function paths(nodes: readonly TreeNode[]): string[] {
  const out: string[] = [];
  function walk(list: readonly TreeNode[]): void {
    for (const n of list) {
      out.push(n.path);
      walk(n.folders);
    }
  }
  walk(nodes);
  return out;
}

describe('moveRequestText', () => {
  it('is the exact sentence', () => {
    expect(
      moveRequestText(
        'Lease agreement 2026',
        '1-Projects/Flat hunt/Lease agreement 2026.pdf',
        '2-Areas/Home',
      ),
    ).toBe(
      'Move “Lease agreement 2026” (1-Projects/Flat hunt/Lease agreement 2026.pdf) to 2-Areas/Home.',
    );
  });
});

describe('pickerFolders', () => {
  // #909: only the four roots drawn on PF-Move; Answers is not offered.
  it('offers the four roots and their folders, never Inbox or Answers', () => {
    const list = pickerFolders(tree(), { path: 'x.pdf', isFolder: false });
    expect(paths(list)).toEqual([
      '1-Projects',
      '1-Projects/Flat hunt',
      '2-Areas',
      '2-Areas/Garden',
      '2-Areas/Garden/Beds',
      '3-Resources',
      '4-Archives',
    ]);
  });

  it('keeps a folder being moved, without anything inside it (PF-Move)', () => {
    const list = pickerFolders(tree(), {
      path: '2-Areas/Garden',
      isFolder: true,
    });
    expect(paths(list)).toContain('2-Areas/Garden');
    expect(paths(list)).not.toContain('2-Areas/Garden/Beds');
    expect(paths(list)).toContain('2-Areas');
  });

  it('names the current folder', () => {
    expect(
      currentFolderOf({ path: '1-Projects/Flat hunt/a.pdf', isFolder: false }),
    ).toBe('1-Projects/Flat hunt');
    expect(currentFolderOf({ path: '2-Areas/Garden', isFolder: true })).toBe(
      '2-Areas',
    );
  });
});

describe('sendMoveRequest', () => {
  const now = new Date(2026, 8, 29, 10, 5);
  const text = 'Move “A” (a.pdf) to X.';

  it('"later" writes one request note and starts nothing', async () => {
    const createTextFile = vi.fn().mockResolvedValue({});
    const startRun = vi.fn().mockResolvedValue(true);
    await sendMoveRequest(
      { createTextFile, startRun },
      { inboxFolderId: 'INBOX_ID', text, when: 'later', now },
    );
    expect(createTextFile).toHaveBeenCalledTimes(1);
    const [parent, name, content] = createTextFile.mock.calls[0] as string[];
    expect(parent).toBe('INBOX_ID');
    expect(name).toMatch(/^Bower - 2026-09-29 1005 /);
    expect(content).toContain('kind: request');
    expect(content).toContain(text);
    expect(startRun).not.toHaveBeenCalled();
  });

  it('"now" writes the note, then starts an instructions-only run', async () => {
    const createTextFile = vi.fn().mockResolvedValue({});
    const startRun = vi.fn().mockResolvedValue(true);
    await sendMoveRequest(
      { createTextFile, startRun },
      { inboxFolderId: 'INBOX_ID', text, when: 'now', now },
    );
    expect(createTextFile).toHaveBeenCalledTimes(1);
    expect(startRun).toHaveBeenCalledWith('instructions');
  });

  it('says the run did not start, the note being written', async () => {
    const createTextFile = vi.fn().mockResolvedValue({});
    const startRun = vi.fn().mockResolvedValue(false);
    await expect(
      sendMoveRequest(
        { createTextFile, startRun },
        { inboxFolderId: 'INBOX_ID', text, when: 'now', now },
      ),
    ).resolves.toBe('run-failed');
    expect(createTextFile).toHaveBeenCalledTimes(1);
  });

  it('says sent when the run started, and for "later"', async () => {
    const createTextFile = vi.fn().mockResolvedValue({});
    const startRun = vi.fn().mockResolvedValue(true);
    const args = { inboxFolderId: 'INBOX_ID', text, now };
    await expect(
      sendMoveRequest({ createTextFile, startRun }, { ...args, when: 'now' }),
    ).resolves.toBe('sent');
    await expect(
      sendMoveRequest({ createTextFile, startRun }, { ...args, when: 'later' }),
    ).resolves.toBe('sent');
  });

  it('starts no run when the note could not be written', async () => {
    const createTextFile = vi.fn().mockRejectedValue(new Error('offline'));
    const startRun = vi.fn();
    await expect(
      sendMoveRequest(
        { createTextFile, startRun },
        { inboxFolderId: 'INBOX_ID', text, when: 'now', now },
      ),
    ).rejects.toThrow('offline');
    expect(startRun).not.toHaveBeenCalled();
  });
});

describe('requestRowText', () => {
  it('reads a Rename request as the old name and the new one (#859)', () => {
    expect(
      requestRowText(
        'Rename 2-Areas/Home/Boiler receipt.pdf to Boiler 2026.pdf',
      ),
    ).toBe('Rename Boiler receipt.pdf to Boiler 2026.pdf');
  });

  it('leaves the numeric prefixes off the folders shown', () => {
    expect(
      requestRowText(
        'Move “Lease.pdf” (1-Projects/Flat hunt/Lease.pdf) to 1-Projects/Half Marathon.',
      ),
    ).toBe(
      'Move “Lease.pdf” (Projects › Flat hunt › Lease.pdf) to Projects › Half Marathon.',
    );
  });
  it('returns other text unchanged', () => {
    expect(requestRowText('Keep tax forms in 3-Resources')).toBe(
      'Keep tax forms in 3-Resources',
    );
  });
});

describe('writeRequestNote and undoRequestNote', () => {
  const now = new Date(2026, 8, 29, 10, 5);

  it('writes one request note the runner will not quarantine', async () => {
    const createTextFile = vi.fn().mockResolvedValue({ id: 'NOTE_ID' });
    const id = await writeRequestNote(
      { createTextFile },
      { inboxFolderId: 'INBOX_ID', text: 'Rename a.pdf to b.pdf', now },
    );
    expect(id).toBe('NOTE_ID');
    const [, , content, options] = createTextFile.mock.calls[0] as [
      string,
      string,
      string,
      { appProperties: Record<string, string> },
    ];
    expect(content).toContain('Rename a.pdf to b.pdf');
    expect(options.appProperties).toEqual(INSTRUCTION_APP_PROPERTIES);
  });

  it('a "now" send starts the run only after the note is written', async () => {
    const order: string[] = [];
    const createTextFile = vi.fn().mockImplementation(async () => {
      await Promise.resolve();
      order.push('written');
      return { id: 'NOTE_ID' };
    });
    const startRun = vi.fn().mockImplementation(() => {
      order.push('run');
      return Promise.resolve(true);
    });
    await sendMoveRequest(
      { createTextFile, startRun },
      { inboxFolderId: 'INBOX_ID', text: 'x', when: 'now', now },
    );
    expect(order).toEqual(['written', 'run']);
  });

  it('a "now" send whose write fails starts no run', async () => {
    const createTextFile = vi.fn().mockRejectedValue(new Error('offline'));
    const startRun = vi.fn().mockResolvedValue(true);
    await expect(
      sendMoveRequest(
        { createTextFile, startRun },
        { inboxFolderId: 'INBOX_ID', text: 'x', when: 'now', now },
      ),
    ).rejects.toThrow('offline');
    expect(startRun).not.toHaveBeenCalled();
  });

  it('Undo sends the note to the Bin', async () => {
    const deleteFile = vi.fn().mockResolvedValue(undefined);
    await expect(undoRequestNote(deleteFile, 'NOTE_ID')).resolves.toBe(
      'undone',
    );
    expect(deleteFile).toHaveBeenCalledWith('NOTE_ID');
  });

  it('Undo that cannot trash says failed and does not throw', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const deleteFile = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(undoRequestNote(deleteFile, 'NOTE_ID')).resolves.toBe(
      'failed',
    );
  });
});

describe('replaceRequestNote (§3.6)', () => {
  const now = new Date(2026, 8, 29, 10, 5);
  const text = 'Move “A” (a.pdf) to X.';

  it('writes the new note, then sends the waiting one to the Bin', async () => {
    const order: string[] = [];
    const createTextFile = vi.fn(() => {
      order.push('write');
      return Promise.resolve({ id: 'NEW_ID' });
    });
    const deleteFile = vi.fn(() => {
      order.push('bin');
      return Promise.resolve();
    });
    const result = await replaceRequestNote(
      { createTextFile, deleteFile },
      { inboxFolderId: 'INBOX_ID', text, now, replaces: 'OLD_ID' },
    );
    expect(result).toEqual({ id: 'NEW_ID', kept: false });
    expect(order).toEqual(['write', 'bin']);
    expect(deleteFile).toHaveBeenCalledWith('OLD_ID');
  });

  it('replaces nothing when no waiting note is known', async () => {
    const createTextFile = vi.fn().mockResolvedValue({ id: 'NEW_ID' });
    const deleteFile = vi.fn();
    const result = await replaceRequestNote(
      { createTextFile, deleteFile },
      { inboxFolderId: 'INBOX_ID', text, now, replaces: null },
    );
    expect(result).toEqual({ id: 'NEW_ID', kept: false });
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('says the waiting one is kept when the Bin fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const createTextFile = vi.fn().mockResolvedValue({ id: 'NEW_ID' });
    const deleteFile = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await replaceRequestNote(
      { createTextFile, deleteFile },
      { inboxFolderId: 'INBOX_ID', text, now, replaces: 'OLD_ID' },
    );
    expect(result).toEqual({ id: 'NEW_ID', kept: true });
  });

  it('leaves the waiting one alone when the new note fails', async () => {
    const createTextFile = vi.fn().mockRejectedValue(new Error('offline'));
    const deleteFile = vi.fn();
    await expect(
      replaceRequestNote(
        { createTextFile, deleteFile },
        { inboxFolderId: 'INBOX_ID', text, now, replaces: 'OLD_ID' },
      ),
    ).rejects.toThrow('offline');
    expect(deleteFile).not.toHaveBeenCalled();
  });
});
