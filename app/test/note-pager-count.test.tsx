// @vitest-environment jsdom

/**
 * #1003 (R-SYS-7): the note page's pager leaves out the page Bower wrote
 * for the folder, as the file page and the folder's own count do.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { folderCount } from '../src/navigation.js';
import { buildVaultIndex } from '../src/vault-index.js';

function note(path: string): DriveFile {
  return {
    id: `id-${path}`,
    name: path.split('/').pop() ?? path,
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path,
    modifiedTime: '2026-10-01T00:00:00Z',
  };
}

const FOLDER = '2-Areas/Finance';
const PAGE = note(`${FOLDER}/Finance.md`);
const BUDGET = note(`${FOLDER}/Budget.md`);
const PENSION = note(`${FOLDER}/Pension.md`);
const TAXES = note(`${FOLDER}/Taxes.md`);
const bowerPages: ReadonlySet<string> = new Set([PAGE.id]);

vi.mock('preact-iso', () => ({
  useRoute: () => ({ params: { id: BUDGET.id } }),
}));
vi.mock('../src/cache.js', () => ({
  loadNote: () => Promise.resolve(undefined),
}));
vi.mock('../src/seen.js', () => ({ markSeen: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/use-request-rows.js', () => ({ useRequestRows: () => [] }));
vi.mock('../src/components/bower-folder-pages.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../src/components/bower-folder-pages.js')
  >()),
  useBowerPagesUnder: () => bowerPages,
}));

const index = buildVaultIndex([PAGE, BUDGET, PENSION, TAXES]);
const getNoteText = (): Promise<string> => Promise.resolve('# A note\n');
const noop = (): Promise<void> => Promise.resolve();

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({
    index,
    getNoteText,
    appendToNote: getNoteText,
    openNoteForEdit: () => Promise.reject(new Error('not used')),
    saveEditedNote: () => Promise.reject(new Error('not used')),
    pinNote: noop,
    unpinNote: noop,
  }),
}));

const { Note } = await import('../src/routes/note.js');

let root: HTMLDivElement | undefined;

afterEach(() => {
  if (root !== undefined) {
    const host = root;
    void act(() => {
      render(null, host);
    });
    host.remove();
  }
});

describe('the note pager count (#1003)', () => {
  it("matches the folder count, leaving out the folder's Bower page", async () => {
    root = document.createElement('div');
    document.body.append(root);
    const host = root;
    await act(() => {
      render(h(Note, {}), host);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const total = folderCount(index, FOLDER, { exclude: bowerPages });
    expect(total).toBe(3);
    expect(host.querySelector('.pager-count')?.textContent).toBe(
      `1 of ${String(total)} in Finance`,
    );
  });
});
