import { describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import {
  currentFolderOf,
  findFolders,
  moveRequestText,
  pickerFolders,
  sendMoveRequest,
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
  it('leaves Inbox and what is in it out, and offers the rest', () => {
    const list = pickerFolders(tree(), { path: 'x.pdf', isFolder: false });
    expect(paths(list)).toEqual([
      '1-Projects',
      '1-Projects/Flat hunt',
      '2-Areas',
      '2-Areas/Garden',
      '2-Areas/Garden/Beds',
      '3-Resources',
      '4-Archives',
      'Answers',
    ]);
  });

  it('does not offer a folder inside itself', () => {
    const list = pickerFolders(tree(), {
      path: '2-Areas/Garden',
      isFolder: true,
    });
    expect(paths(list)).not.toContain('2-Areas/Garden');
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

describe('findFolders', () => {
  const list = pickerFolders(tree(), { path: 'x.pdf', isFolder: false });

  it('matches names at any depth, ignoring case and the numeric prefix', () => {
    expect(findFolders(list, 'GARD').map((n) => n.path)).toEqual([
      '2-Areas/Garden',
    ]);
    expect(findFolders(list, 'areas').map((n) => n.path)).toEqual(['2-Areas']);
    expect(findFolders(list, '2-').map((n) => n.path)).toEqual([]);
  });

  it('gives nothing for a blank query', () => {
    expect(findFolders(list, '  ')).toEqual([]);
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
