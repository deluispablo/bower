// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { buildVaultIndex } from '../src/vault-index.js';

const route = { params: { path: '1-Projects' } };

function file(
  path: string,
  mimeType = 'text/markdown',
  modifiedTime?: string,
): DriveFile {
  return {
    id: `id-${path}`,
    name: path.split('/').pop() ?? path,
    mimeType,
    parents: ['FOLDER_ID'],
    path,
    ...(modifiedTime === undefined ? {} : { modifiedTime }),
  };
}

/** "Now" for the age lines (#431): the fixture's times are relative to it. */
const NOW = Date.parse('2026-09-28T12:00:00Z');

const files: DriveFile[] = [
  file('1-Projects', FOLDER_MIME),
  file('1-Projects/Flat hunt', FOLDER_MIME),
  file(
    '1-Projects/Flat hunt/Flat hunt.md',
    'text/markdown',
    '2026-09-20T09:00:00Z',
  ),
  file(
    '1-Projects/Flat hunt/Lease 2026.pdf',
    'application/pdf',
    '2026-09-28T08:00:00Z',
  ),
  file('2-Areas', FOLDER_MIME),
  file('2-Areas/Cooking', FOLDER_MIME),
  file('2-Areas/Cooking/Sourdough.md', 'text/markdown', '2026-09-23T09:00:00Z'),
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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
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

describe('Folder More menu (#352)', () => {
  it('opens the one More menu, in its folder version', () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    const more = root.querySelector<HTMLButtonElement>('.note-header-more');
    if (more === null) throw new Error('More button missing');
    void act(() => {
      more.click();
    });
    const menu = root.querySelector('[role="menu"]');
    expect(menu?.getAttribute('aria-label')).toBe('Folder actions');
    expect(root.querySelector('.note-menu-title')?.textContent).toBe(
      'Flat hunt',
    );
    const labels = Array.from(
      root.querySelectorAll('.note-menu-row-label'),
      (el) => el.textContent,
    );
    expect(labels).toContain('Pin to Home');
    expect(labels).not.toContain('Edit the text');
  });
});

describe('Root folder screen details (#431, Phone-Folder board)', () => {
  function heading(): string | null | undefined {
    return root.querySelector('.folder-head h1')?.textContent;
  }

  function meta(): string | null | undefined {
    return root.querySelector('.folder-meta')?.textContent;
  }

  it('heads a root folder with its name, the numeric prefix stripped', () => {
    mount();
    expect(heading()).toBe('Projects');
    route.params.path = '2-Areas';
    mount();
    expect(heading()).toBe('Areas');
  });

  it('keeps the full name for a folder that is not a root', () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    expect(heading()).toBe('Flat hunt');
  });

  it('reads "N projects · N things" for 1-Projects', () => {
    mount();
    expect(meta()).toBe('1 project · 2 things');
  });

  it('keeps the plain notes and folders line for another root folder', () => {
    route.params.path = '2-Areas';
    mount();
    expect(meta()).toBe('1 note · 1 folder');
  });

  it('gives each subfolder row a second line: things and when updated', () => {
    mount();
    const row = root.querySelector(
      'a.folder-row[href="/folder/1-Projects/Flat%20hunt"]',
    );
    expect(row?.querySelector('.folder-row-detail')?.textContent).toBe(
      '2 things · updated today',
    );
    expect(row?.querySelector('.folder-row-count')).toBeNull();
    route.params.path = '2-Areas';
    mount();
    const cooking = root.querySelector(
      'a.folder-row[href="/folder/2-Areas/Cooking"]',
    );
    expect(cooking?.querySelector('.folder-row-detail')?.textContent).toBe(
      '1 thing · 5 d',
    );
  });
});
