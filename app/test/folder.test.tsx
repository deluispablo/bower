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
  file('1-Projects/Flat hunt/Viewings', FOLDER_MIME),
  file(
    '1-Projects/Flat hunt/Viewings/Notes from the viewing.md',
    'text/markdown',
    '2026-09-27T09:00:00Z',
  ),
  file(
    '1-Projects/Flat hunt/Viewings/Floor plan.pdf',
    'application/pdf',
    '2026-09-27T09:00:00Z',
  ),
  file('2-Areas', FOLDER_MIME),
  file('2-Areas/Cooking', FOLDER_MIME),
  file('2-Areas/Cooking/Sourdough.md', 'text/markdown', '2026-09-23T09:00:00Z'),
  // Empty subfolders, for #502: a root screen's row shows no count line and
  // a non-root screen's row shows no count badge, rather than "0 things".
  file('1-Projects/Empty project', FOLDER_MIME),
  file('1-Projects/Flat hunt/Empty', FOLDER_MIME),
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
    expect(meta()).toBe('2 projects · 4 things');
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
      '4 things · updated today',
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

  it('shows no count line for an empty subfolder, not "0 things" (#502)', () => {
    mount();
    const empty = root.querySelector(
      'a.folder-row[href="/folder/1-Projects/Empty%20project"]',
    );
    expect(empty?.querySelector('.folder-row-detail')).toBeNull();
  });
});

// #457: the non-root folder screen's own subfolder rows (the plain
// ".folder-row-count" badge, not the root screen's "N things" line above)
// used to read `FolderSubfolder.count`, notes only -- the same disagreement
// #425 already fixed for the folder menu, the Notes tree and the sidebar.
describe('Subfolder rows on a non-root folder screen count files too (#457)', () => {
  it('counts files and notes together, matching the folder menu/tree/sidebar definition', () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    const row = root.querySelector(
      'a.folder-row[href="/folder/1-Projects/Flat%20hunt/Viewings"]',
    );
    // Viewings holds one note and one file: 2, not 1 (notes only).
    expect(row?.querySelector('.folder-row-count')?.textContent).toBe('2');
    expect(row?.querySelector('.folder-row-detail')).toBeNull();
  });

  it('shows no count badge for an empty subfolder, not "0" (#502)', () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    const empty = root.querySelector(
      'a.folder-row[href="/folder/1-Projects/Flat%20hunt/Empty"]',
    );
    expect(empty?.querySelector('.folder-row-count')).toBeNull();
  });
});

describe('Ask Bower about it chip (#354)', () => {
  it('prefills "About <folder>: " and nothing else from the folder', () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    const chip = Array.from(
      root.querySelectorAll<HTMLAnchorElement>('.folder-chips a.chip'),
    ).find((a) => a.textContent?.includes('Ask Bower about it'));
    expect(chip?.getAttribute('href')).toBe(
      `/bower?text=${encodeURIComponent('About Flat hunt: ')}`,
    );
  });
});

describe('Drive chip and end-of-folder tip (#453, Phone-Folder-Project board)', () => {
  it('labels the Drive chip "Drive", not "Open in Drive"', () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    const chip = Array.from(
      root.querySelectorAll<HTMLAnchorElement>('.folder-chips a.chip'),
    ).find((a) => a.getAttribute('href')?.includes('drive.google.com'));
    expect(chip?.textContent).toBe('Drive');
  });

  // #464: the copy used to name "the flats I saved" and "rent and size"
  // regardless of which folder it sat under -- a hard-coded reference to
  // the board's own Flat hunt example. The two examples are generic now,
  // so the exact same tip fits a different folder ("Cooking") too.
  it('ends the screen with a generic tip to ask Bower for more, on any project folder', () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    const tip =
      'Want more from this folder? Ask Bower: “Compare what I saved here” or “From now on, pull the dates out of everything in this folder”.';
    expect(root.querySelector('.folder-tip')?.textContent).toBe(tip);
    expect(tip).not.toMatch(/flat|rent|listing/i);

    route.params.path = '2-Areas/Cooking';
    mount();
    expect(root.querySelector('.folder-tip')?.textContent).toBe(tip);
  });

  it('has no tip on a root folder', () => {
    mount();
    expect(root.querySelector('.folder-tip')).toBeNull();
  });
});
