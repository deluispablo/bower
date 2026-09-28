// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { buildVaultIndex } from '../src/vault-index.js';

const route = { params: { path: '1-Projects' } };

function file(path: string, mimeType = 'text/markdown'): DriveFile {
  return {
    id: `id-${path}`,
    name: path.split('/').pop() ?? path,
    mimeType,
    parents: ['FOLDER_ID'],
    path,
  };
}

const files: DriveFile[] = [
  file('1-Projects', FOLDER_MIME),
  file('1-Projects/Flat hunt', FOLDER_MIME),
  file('1-Projects/Flat hunt/Flat hunt.md'),
  file('2-Areas', FOLDER_MIME),
  file('2-Areas/Cooking', FOLDER_MIME),
];

vi.mock('preact-iso', () => ({
  useRoute: () => route,
}));

let index: ReturnType<typeof buildVaultIndex> | undefined;
// Stable references: an unstable `getNoteText` would retrigger
// `useCatalogueOrigins`'s effect (deps include it) on every render.
const pinFolder = vi.fn(() => Promise.resolve());
const unpinFolder = vi.fn(() => Promise.resolve());
const getNoteText = (): Promise<string> => Promise.resolve('');

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => {
    index ??= buildVaultIndex(files);
    return { index, pinFolder, unpinFolder, getNoteText };
  },
}));

const { Folder } = await import('../src/routes/folder.js');

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Folder, null), root);
  });
}

beforeEach(() => {
  route.params.path = '1-Projects';
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
});

describe('Folder (#348)', () => {
  it('shows a root folder explained: its meaning, from folder-meanings.ts', () => {
    mount();
    expect(root.querySelector('.folder-explainer')?.textContent).toBe(
      'Things with an end date',
    );
  });

  it('has no meaning line for a folder that is not a root (a project)', () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    expect(root.querySelector('.folder-explainer')).toBeNull();
  });

  it('has no meaning line for a root folder outside the table', () => {
    // Not one of `folder-meanings.ts`'s six: no line, no crash.
    route.params.path = 'Clippings';
    mount();
    expect(root.querySelector('.folder-explainer')).toBeNull();
  });

  it('still shows subfolders and files under the meaning line', () => {
    mount();
    const explainer = root.querySelector('.folder-explainer');
    const subfolder = root.querySelector(
      'a.folder-row[href="/folder/1-Projects/Flat%20hunt"]',
    );
    expect(subfolder).not.toBeNull();
    expect(explainer?.compareDocumentPosition(subfolder as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
