// @vitest-environment jsdom

import { Fragment, h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayHost } from '../src/components/overlay.js';
import { FOLDER_MIME } from '../src/drive.js';
import type { RequestRow } from '../src/bower-tab.js';
import type { DriveFile } from '../src/drive.js';
import { buildVaultIndex } from '../src/vault-index.js';
import { stubMatchMedia } from './helpers/match-media.js';

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
  useLocation: () => ({ route: vi.fn(), path: '/folder', query: {} }),
}));

let index: ReturnType<typeof buildVaultIndex> | undefined;
// Stable references: an unstable `getNoteText` would retrigger
// `useCatalogueOrigins`'s effect (deps include it) on every render.
const openSheet = vi.fn();
const requestRows = vi.hoisted(() => ({ list: [] as RequestRow[] }));
vi.mock('../src/use-request-rows.js', () => ({
  useRequestRows: () => requestRows.list,
}));
vi.mock('../src/components/send-to-bower.js', () => ({
  openSendToBower: openSheet,
  openAsk: openSheet,
}));
const pinFolder = vi.fn(() => Promise.resolve());
const unpinFolder = vi.fn(() => Promise.resolve());
const getNoteText = (): Promise<string> => Promise.resolve('');
const openNoteForEdit = (): Promise<{
  text: string;
  modifiedTime: string | null;
}> => Promise.resolve({ text: '', modifiedTime: null });

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => {
    index ??= buildVaultIndex(files);
    return {
      index,
      pinFolder,
      unpinFolder,
      getNoteText,
      openNoteForEdit,
      saveEditedNote: vi.fn(),
    };
  },
}));

// Per-folder view settings (#582) and lazy frontmatter (#582) in memory.
const viewStore = new Map<string, Record<string, unknown>>();
vi.mock('../src/cache.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/cache.js')>()),
  loadViewSettings: (path: string) => Promise.resolve(viewStore.get(path)),
  saveViewSettings: (path: string, settings: Record<string, unknown>) => {
    viewStore.set(path, settings);
    return Promise.resolve();
  },
}));
const metaStore = new Map<string, Record<string, unknown>>();
vi.mock('../src/note-meta.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/note-meta.js')>();
  return {
    ...real,
    loadNoteMeta: (file: { id: string }) =>
      Promise.resolve(real.noteMetaFrom(metaStore.get(file.id) ?? {})),
  };
});
vi.mock('../src/use-new.js', () => ({
  useNew: () => ({
    ids: new Set<string>(),
    isNew: () => false,
    newCountIn: () => 0,
    markSeen: () => Promise.resolve(),
    markAllSeen: () => Promise.resolve(),
  }),
}));

const { Folder } = await import('../src/routes/folder.js');

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Fragment, null, h(Folder, null), h(OverlayHost, null)), root);
  });
}

beforeEach(() => {
  requestRows.list = [];
  viewStore.clear();
  metaStore.clear();
  index = undefined;
  route.params.path = '1-Projects';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  openSheet.mockClear();
  vi.useRealTimers();
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
});

const segs = (): (string | undefined)[] => texts('.folder-in-row .seg-button');
const metaText = (): string | undefined =>
  root.querySelector('.page-header-meta')?.textContent?.replace(/\s+/g, ' ');

describe('Folder header (#911, R-PF-1, R-AR-1)', () => {
  it('heads a root folder with its name once, its purpose line and no P mark', async () => {
    mount();
    expect(root.querySelector('.page-header-title')?.textContent).toBe(
      'Projects',
    );
    expect(root.querySelector('.page-header-purpose')?.textContent).toBe(
      'Things with an end date',
    );
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('.folder-mark, .folder-chips')).toBeNull();
    // Root crumb "Your folders" reveals the tree (E-17).
    expect(root.querySelector('.page-header-crumbs a')?.textContent).toBe(
      'Your folders',
    );
    await subfoldersReady();
  });

  it('keeps the full name and the parents as crumbs for a folder that is not a root', () => {
    route.params.path = DIR;
    mount();
    expect(root.querySelector('.page-header-title')?.textContent).toBe(
      'Flat hunt',
    );
    expect(texts('.page-header-crumbs a')).toEqual(['Projects']);
    expect(root.querySelector('.page-header-purpose')).toBeNull();
  });

  it('shows the shared Not found screen for a path with no folder (#504)', () => {
    route.params.path = 'nope';
    mount();
    expect(root.querySelector('h1')?.textContent).toBe('I can’t find that');
  });

  it('opens the folder ⋯ menu beside the title', () => {
    route.params.path = DIR;
    mount();
    const more = root.querySelector<HTMLButtonElement>('.page-header-more');
    if (more === null) throw new Error('More button missing');
    void act(() => more.click());
    const labels = Array.from(
      document.querySelectorAll('.note-menu-row-label'),
      (el) => el.textContent,
    );
    expect(labels).toContain('Pin to Home');
    expect(labels).not.toContain('Edit the text');
  });

  it('imports neither the (i) pop nor the header actions, and has no Try asking card (E-6)', async () => {
    route.params.path = DIR;
    mount();
    await listReady();
    expect(root.querySelector('.info-pop-button')).toBeNull();
    expect(root.querySelector('.header-action')).toBeNull();
    expect(root.textContent).not.toContain('Try asking');
    expect(root.textContent).not.toContain('Showing only');
  });
});

describe('Folder counts agree (K-31, R-PF-2)', () => {
  it('meta equals the segment sums and the Filter "Show n things"', async () => {
    useFlatHuntWithPair();
    mount();
    await listReady();
    // 2 subfolders + Flat hunt.md, Lease 2026.pdf, the Arlington PDF = 5
    // originals; the Arlington note = 1 by Bower.
    await waitUntil(() => segs().join('|') === 'All|Originals 5|By Bower 1');
    await waitUntil(() => metaText() === 'Projects · 6 things · updated today');
    void act(() => {
      root.querySelector<HTMLButtonElement>('.filter-sort-btn')?.click();
    });
    expect(document.body.querySelector('.filter-sort-done')?.textContent).toBe(
      'Show 6 things',
    );
  });

  it('a folder of folders counts its folders and keeps Originals 0 (AR-Main)', async () => {
    mount();
    await subfoldersReady();
    await waitUntil(
      () => metaText() === 'Projects · 2 folders · updated today',
    );
    expect(segs()).toEqual(['All', 'Originals 0', 'By Bower 0']);
  });
});

describe('Folder of folders (#911, R-AR-*)', () => {
  it('shows the Folders cards, then Recently changed with the mixed meta', async () => {
    mount();
    await subfoldersReady();
    expect(texts('.folder-group')).toEqual([
      'Folders',
      'Recently changed in Projects',
    ]);
    const card = root.querySelector(
      'a.folder-card[href="/folder/1-Projects/Flat%20hunt"]',
    );
    expect(card?.querySelector('.folder-card-meta')?.textContent).toBe(
      '4 things · updated today',
    );
    const empty = root.querySelector(
      'a.folder-card[href="/folder/1-Projects/Empty%20project"]',
    );
    expect(empty?.querySelector('.folder-card-meta')?.textContent).toBe(
      'Nothing here yet',
    );
    const recent = texts('.folder-list .list-row-meta');
    expect(recent[0]).toBe('PDF · Flat hunt');
  });

  it('opens on desktop with nothing selected, and one click previews a card', async () => {
    stubMatchMedia(true);
    mount();
    await subfoldersReady();
    expect(root.querySelector('[data-selected="true"]')).toBeNull();
    const card = root.querySelector<HTMLAnchorElement>(
      'a.folder-card[href="/folder/1-Projects/Flat%20hunt"]',
    );
    void act(() => card?.click());
    await waitUntil(() => card?.getAttribute('data-selected') === 'true');
  });
});

describe('Folder list (#911, R-PF-4, R-PF-5, R-LI-*)', () => {
  it('heads the list with h2 "In this folder" and lists subfolders first', async () => {
    useFlatHuntWithPair();
    mount();
    await listReady();
    expect(root.querySelector('h2.folder-in-title')?.textContent).toBe(
      'In this folder',
    );
    await waitUntil(() => root.querySelector('.folder-item') !== null);
    const list = root.querySelector('ul.folder-list[role="list"]');
    expect(list?.getAttribute('aria-label')).toBe('In Flat hunt');
    const first = list?.querySelector('a');
    expect(first?.getAttribute('href')).toBe(
      '/folder/1-Projects/Flat%20hunt/Empty',
    );
    // Viewings holds one note and one file.
    const viewings = root.querySelector(
      'a.list-row[href="/folder/1-Projects/Flat%20hunt/Viewings"]',
    );
    expect(viewings?.querySelector('.list-row-trailing')?.textContent).toBe(
      '2 things',
    );
  });

  it('groups the rows by day: Today, Yesterday, then the date', async () => {
    useFlatHuntWithPair();
    mount();
    await listReady();
    await waitUntil(() => texts('.folder-group').length === 3);
    expect(texts('.folder-group')).toEqual(['Today', 'Yesterday', '20 Sep']);
  });

  it('keeps an empty segment with its line (R-PF-11, R-LI-1)', async () => {
    route.params.path = '2-Areas/Cooking';
    mount();
    await listReady();
    const bower = [
      ...root.querySelectorAll<HTMLButtonElement>('.folder-in-row .seg-button'),
    ].find((button) => button.textContent?.startsWith('By Bower'));
    expect(bower?.textContent).toBe('By Bower 0');
    void act(() => bower?.click());
    await waitUntil(() => root.querySelector('.empty-segment') !== null);
    expect(root.querySelector('.empty-segment')?.textContent).toBe(
      'Nothing by Bower here yet.',
    );
  });

  it('draws the empty folder state (R-SYS-4)', async () => {
    route.params.path = '1-Projects/Flat hunt/Empty';
    mount();
    await waitUntil(() => root.querySelector('.empty-folder') !== null);
    expect(root.querySelector('.empty-folder-title')?.textContent).toBe(
      'Nothing here yet.',
    );
  });

  it('shows a PDF and its note as one row in All, and one each in Originals and By Bower', async () => {
    useFlatHuntWithPair();
    mount();
    await listReady();
    const names = (): (string | undefined)[] => texts('.list-row-title');
    await waitUntil(() => names().some((n) => n?.startsWith('Arlington')));
    expect(names().filter((n) => n?.startsWith('Arlington'))).toHaveLength(1);
    const buttons = root.querySelectorAll<HTMLButtonElement>(
      '.folder-in-row .seg-button',
    );
    void act(() => buttons[1]?.click());
    await waitUntil(() => texts('.list-row-meta').includes('PDF'));
    expect(names()).toContain('Arlington Road, 2 bed');
    expect(root.querySelector('.kind-badge')).toBeNull();
  });

  it('remembers the layout per folder and draws the same header in Grid (R-GR-3)', async () => {
    useFlatHuntWithPair();
    viewStore.set(DIR, {
      sort: 'modified',
      kindFilter: null,
      originFilter: null,
      layout: 'grid',
      layoutChosen: true,
      compareColumns: ['rent'],
    });
    mount();
    await listReady();
    await waitUntil(() => root.querySelector('.grid-tile') !== null);
    expect(root.querySelector('h2.folder-in-title')).not.toBeNull();
    const button = root.querySelector('.filter-sort-btn');
    expect(button?.getAttribute('aria-label')).toBe(
      'Filter and sort (grid layout on)',
    );
    expect(button?.querySelector('.filter-sort-dot')).not.toBeNull();
    expect(root.querySelector('.folder-layout')).toBeNull();
  });

  it('applies Filter & sort only on "Show n things" and stores it', async () => {
    useFlatHuntWithPair();
    mount();
    await listReady();
    void act(() => {
      root.querySelector<HTMLButtonElement>('.filter-sort-btn')?.click();
    });
    const grid = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ].find((button) => button.textContent === 'Grid');
    void act(() => grid?.click());
    expect(viewStore.get(DIR)?.layout).toBeUndefined();
    void act(() => {
      document.body
        .querySelector<HTMLButtonElement>('.filter-sort-done')
        ?.click();
    });
    await waitUntil(() => viewStore.get(DIR)?.layout === 'grid');
    expect(viewStore.get(DIR)?.compareColumns).toBeUndefined();
  });

  it('renders a 500-item folder through VirtualList', async () => {
    const many = Array.from({ length: 500 }, (_, at) =>
      file(
        `${DIR}/Note ${String(at).padStart(3, '0')}.md`,
        'text/markdown',
        '2026-09-20T09:00:00Z',
      ),
    );
    index = buildVaultIndex([...files, ...many]);
    route.params.path = DIR;
    mount();
    await listReady();
    await waitUntil(() => root.querySelector('.folder-virtual') !== null);
    const rendered = root.querySelectorAll('.folder-item').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(500);
    // The CI runner is slower than a laptop: 500 rows need more than 5 s there.
  }, 20_000);

  it('shows no score or facts on a row (#908, G-18)', async () => {
    useFlatHuntWithPair();
    metaStore.set(listingNote.id, {
      ...metaStore.get(listingNote.id),
      fit: 79,
    });
    mount();
    await listReady();
    expect(root.querySelector('.folder-list')?.textContent).not.toContain('79');
  });

  it('says on the row of a file with a Rename waiting (#765, D32)', async () => {
    useFlatHuntWithPair();
    requestRows.list = [
      {
        key: 'k',
        state: 'waiting',
        text: `Rename ${listingNote.path} to Flat.md`,
        kind: 'job',
        since: '2026-09-29T10:00:00Z',
        fileId: 'NOTE_ID',
      },
    ];
    mount();
    await listReady();
    const waitingRows = (): (string | undefined)[] =>
      texts('.list-row-meta').filter((text) =>
        text?.endsWith('· waiting for the next tidy-up'),
      );
    await waitUntil(() => waitingRows().length > 0);
    expect(waitingRows()).toHaveLength(1);
  });
});

/** The list module has loaded and drawn its subfolder rows. */
async function subfoldersReady(): Promise<void> {
  await waitUntil(
    () => root.querySelector('a.list-row, a.folder-card') !== null,
  );
}

/** Polls until `done()` holds (5 s at most): the list mode is loaded on
 * demand and its notes' frontmatter arrives after the first render, so a
 * slow runner needs more than a fixed number of ticks. */
async function waitUntil(done: () => boolean): Promise<void> {
  const until = Date.now() + 5000;
  while (!done() && Date.now() < until) {
    await settle();
  }
  expect(done()).toBe(true);
}

/** The list mode has rendered. */
async function listReady(): Promise<void> {
  await waitUntil(() => root.querySelector('.folder-in-row') !== null);
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function texts(selector: string): (string | undefined)[] {
  return [...root.querySelectorAll(selector)].map((el) =>
    el.textContent?.replace(/\s+/g, ' ').trim(),
  );
}

const DIR = '1-Projects/Flat hunt';
const listingPdf = file(
  `${DIR}/Arlington Road, 2 bed.pdf`,
  'application/pdf',
  '2026-09-27T08:00:00Z',
);
const listingNote = file(
  `${DIR}/Arlington Road, 2 bed.md`,
  'text/markdown',
  '2026-09-27T09:00:00Z',
);

function useFlatHuntWithPair(): void {
  index = buildVaultIndex([...files, listingPdf, listingNote]);
  metaStore.set(listingNote.id, {
    kind: 'rental-listing',
    original: '[[Arlington Road, 2 bed.pdf]]',
    address: '12 Arlington Road',
    rent: { amount: 2150, currency: 'GBP' },
  });
  route.params.path = DIR;
}
