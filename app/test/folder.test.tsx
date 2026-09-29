// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  useLocation: () => ({ route: vi.fn() }),
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
}));
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
    render(h(Folder, null), root);
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

  it('shows the shared Not found screen for a path with no folder (#504)', () => {
    route.params.path = 'nope';
    mount();
    expect(root.querySelector('h1')?.textContent).toBe('I can’t find that');
    expect(root.querySelector('.auth-note')?.textContent).toBe(
      "This folder isn't in your Bower folder any more. Maybe it moved, or the link is old.",
    );
  });

  it('still shows subfolders and files under the meaning line', async () => {
    mount();
    await subfoldersReady();
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

  it('gives each subfolder row a second line: things and when updated', async () => {
    mount();
    await subfoldersReady();
    const row = root.querySelector(
      'a.folder-row[href="/folder/1-Projects/Flat%20hunt"]',
    );
    expect(row?.querySelector('.folder-row-detail')?.textContent).toBe(
      '4 things · updated today',
    );
    expect(row?.querySelector('.folder-row-count')).toBeNull();
    route.params.path = '2-Areas';
    mount();
    await subfoldersReady();
    const cooking = root.querySelector(
      'a.folder-row[href="/folder/2-Areas/Cooking"]',
    );
    expect(cooking?.querySelector('.folder-row-detail')?.textContent).toBe(
      '1 thing · 5 d',
    );
  });

  it('shows no count line for an empty subfolder, not "0 things" (#502)', async () => {
    mount();
    await subfoldersReady();
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
  it('counts files and notes together, matching the folder menu/tree/sidebar definition', async () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    await subfoldersReady();
    const row = root.querySelector(
      'a.folder-row[href="/folder/1-Projects/Flat%20hunt/Viewings"]',
    );
    // Viewings holds one note and one file: 2, not 1 (notes only).
    expect(row?.querySelector('.folder-row-count')?.textContent).toBe(
      '2 things',
    );
    expect(row?.querySelector('.folder-row-detail')).toBeNull();
  });

  it('shows no count badge for an empty subfolder, not "0" (#502)', async () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    await subfoldersReady();
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
      root.querySelectorAll<HTMLAnchorElement>('.folder-chips a.header-action'),
    ).find((a) => a.textContent?.includes('Ask Bower about it'));
    expect(chip?.getAttribute('href')).toBe(
      `/bower?text=${encodeURIComponent('About Flat hunt: ')}`,
    );
  });
});

describe('Header actions, Drive and the Ask suggestion (R-FOLD-2, R-HINT-2)', () => {
  it('shows "Open in Drive" from 900 px only, as a header action', () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    expect(
      root.querySelector('.folder-chips a[href*="drive.google"]'),
    ).toBeNull();
    void act(() => {
      render(null, root);
    });
    stubMatchMedia((query) => query === '(min-width: 900px)');
    mount();
    const chip = root.querySelector<HTMLAnchorElement>(
      '.folder-chips a.header-action[href*="drive.google.com"]',
    );
    expect(chip?.textContent).toBe('Open in Drive');
  });

  it('pins with the same HeaderAction, as a pressed toggle', () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    const pin = root.querySelector<HTMLButtonElement>(
      '.folder-chips button.header-action',
    );
    expect(pin?.textContent).toBe('Pin to Home');
    expect(pin?.getAttribute('aria-pressed')).toBe('false');
  });

  it('offers a suggestion under the actions, with two chips that open the ask sheet', () => {
    route.params.path = '1-Projects/Flat hunt';
    mount();
    expect(root.querySelector('.folder-tip')).toBeNull();
    const hint = root.querySelector('.hint-suggestion');
    expect(hint?.textContent).toContain('Try asking.');
    const chips = hint?.querySelectorAll<HTMLButtonElement>('.chip') ?? [];
    expect([...chips].map((chip) => chip.textContent)).toEqual([
      'Which offer fits me best?',
      'Pull out every closing date',
    ]);
    void act(() => chips[1]?.click());
    expect(openSheet).toHaveBeenCalledTimes(1);
    const call = openSheet.mock.calls[0]?.[0] as {
      mode: string;
      initialText: string;
      buildText: (value: string) => string;
    };
    expect(call.mode).toBe('ask');
    expect(call.initialText).toBe('Pull out every closing date');
    expect(call.buildText('Q')).toBe('About Flat hunt: Q');
  });

  it('has no suggestion on a root folder, and none once dismissed', () => {
    mount();
    expect(root.querySelector('.hint-suggestion')).toBeNull();
    route.params.path = '1-Projects/Flat hunt';
    mount();
    void act(() => {
      root.querySelector<HTMLButtonElement>('.hint-dismiss')?.click();
    });
    expect(root.querySelector('.hint-suggestion')).toBeNull();
  });
});

/** The list module has loaded and drawn its subfolder rows. */
async function subfoldersReady(): Promise<void> {
  await waitUntil(() => root.querySelector('a.folder-row') !== null);
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
  await waitUntil(() => root.querySelector('.folder-seg') !== null);
}

const has = (text: string) => (): boolean => root.textContent.includes(text);

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

describe('Folder list mode (#611)', () => {
  it('draws the path bar, the counts, the origin filter and the date groups', async () => {
    useFlatHuntWithPair();
    mount();
    await listReady();
    await waitUntil(has('3 originals, 1 by Bower'));
    expect(texts('.folder-path')[0]).toBe('PProjects›Flat hunt');
    expect(root.querySelector('.folder-path b')?.textContent).toBe('Flat hunt');
    expect(root.querySelector('.folder-counts')?.textContent).toBe(
      '6 things · 3 originals, 1 by Bower',
    );
    expect(root.querySelector('.folder-filed')?.textContent).toBe(
      'Last filed today',
    );
    expect(texts('.folder-seg-btn')).toEqual([
      'All',
      'Originals 3',
      'By Bower 1',
    ]);
    expect(texts('.folder-group')).toEqual([
      'Today',
      'Yesterday',
      'Earlier this month',
    ]);
  });

  it('shows a PDF and its note as one row in All, and one each in Originals and By Bower', async () => {
    useFlatHuntWithPair();
    mount();
    await listReady();
    await waitUntil(has('note on the listing'));
    const names = (): (string | undefined)[] => texts('.folder-row-name');
    expect(names().filter((n) => n?.startsWith('Arlington'))).toHaveLength(1);
    expect(root.textContent).toContain('note on the listing');

    const buttons = root.querySelectorAll<HTMLButtonElement>('.folder-seg-btn');
    void act(() => buttons[1]?.click());
    await waitUntil(() => !has('note on the listing')());
    expect(names()).toContain('Arlington Road, 2 bed');
    expect(root.querySelector('.kind-badge')?.textContent).toBe('PDF');
    expect(root.textContent).not.toContain('note on the listing');

    void act(() => buttons[2]?.click());
    await waitUntil(has('note on the listing PDF'));
    expect(root.textContent).toContain('note on the listing PDF');
    expect(root.querySelector('.hint-state')?.textContent).toContain(
      'Showing only By Bower.',
    );
    void act(() => {
      root.querySelector<HTMLButtonElement>('.info-pop-button')?.click();
    });
    expect(root.querySelector('.info-pop-panel')?.textContent).toContain(
      'Only what Bower wrote, with its key facts',
    );
    void act(() => {
      root.querySelector<HTMLButtonElement>('.folder-show-all')?.click();
    });
    await waitUntil(() => root.querySelector('.hint-state') === null);
  });

  it('remembers the filters per folder and keeps the Compare columns', async () => {
    stubMatchMedia((query) => query === '(min-width: 900px)');
    useFlatHuntWithPair();
    viewStore.set(DIR, {
      sort: 'name',
      kindFilter: null,
      originFilter: 'bower',
      layout: 'list',
      folderSort: 'oldest',
      compareColumns: ['rent'],
    });
    mount();
    await listReady();
    const pressed = root.querySelector('.folder-seg-btn[aria-pressed="true"]');
    expect(pressed?.textContent).toContain('By Bower');
    const sort = root.querySelector<HTMLSelectElement>(
      'select[aria-label="Sort"]',
    );
    if (sort === null) throw new Error('no sort select');
    expect(sort.value).toBe('oldest');

    sort.value = 'name';
    void act(() => {
      sort.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitUntil(() => viewStore.get(DIR)?.folderSort === 'name');
    expect(viewStore.get(DIR)).toMatchObject({
      sort: 'name',
      folderSort: 'name',
      originFilter: 'bower',
      compareColumns: ['rent'],
    });
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
    expect(root.querySelector('.folder-virtual')).not.toBeNull();
    const rendered = root.querySelectorAll('.folder-item').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(500);
  });
});

describe('One list, path once, names (R-FOLD-1, 3, 5)', () => {
  it('lists the subfolders first, in the same role="list" as the rows', async () => {
    useFlatHuntWithPair();
    mount();
    await listReady();
    await waitUntil(has('note on the listing'));
    const lists = root.querySelectorAll('ul[role="list"]');
    expect(lists).toHaveLength(1);
    expect(lists[0]?.getAttribute('aria-label')).toBe('In Flat hunt');
    const links = [...lists[0]!.querySelectorAll('a')];
    expect(links[0]?.getAttribute('href')).toBe(
      '/folder/1-Projects/Flat%20hunt/Empty',
    );
    expect(root.querySelector('.folder-label')).toBeNull();
  });

  it('names a row by the item only; the detail is its description', async () => {
    useFlatHuntWithPair();
    mount();
    await listReady();
    await waitUntil(has('note on the listing'));
    const row = root.querySelector<HTMLAnchorElement>('a.folder-item');
    const nameId = row?.getAttribute('aria-labelledby') ?? '';
    expect(document.getElementById(nameId)?.textContent).toBe(
      row?.querySelector('.folder-row-name')?.textContent,
    );
    expect(row?.getAttribute('aria-describedby')).toContain('row-detail');
    const folder = root.querySelector<HTMLAnchorElement>(
      'a.folder-row:not(.folder-item)',
    );
    expect(
      document.getElementById(folder?.getAttribute('aria-labelledby') ?? '')
        ?.textContent,
    ).toBe('Empty');
  });

  it('draws no PathBar from 900 px, where the top bar carries the path', async () => {
    stubMatchMedia((query) => query === '(min-width: 900px)');
    useFlatHuntWithPair();
    mount();
    await listReady();
    expect(root.querySelector('.folder-path')).toBeNull();
  });
});

describe('Phone Filter & sort (R-FOLD-6, D34)', () => {
  const filterButton = (): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>('.filter-sort-btn');

  it('replaces the sort, kind and layout controls with one named button', async () => {
    stubMatchMedia(false);
    useFlatHuntWithPair();
    mount();
    await listReady();
    expect(root.querySelector('select[aria-label="Sort"]')).toBeNull();
    expect(root.querySelector('.folder-layout')).toBeNull();
    expect(filterButton()?.getAttribute('aria-label')).toBe(
      'Filter and sort: newest first, all kinds',
    );
    expect(filterButton()?.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('opens a sheet whose choices apply and rename the button', async () => {
    stubMatchMedia(false);
    useFlatHuntWithPair();
    mount();
    await listReady();
    void act(() => filterButton()?.click());
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    const oldest = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ].find((button) => button.textContent === 'Oldest first');
    void act(() => oldest?.click());
    await waitUntil(() => viewStore.get(DIR)?.folderSort === 'oldest');
    expect(filterButton()?.getAttribute('aria-label')).toBe(
      'Filter and sort: oldest first, all kinds',
    );
  });

  it('keeps the toolbar from 900 px up', async () => {
    stubMatchMedia((query) => query === '(min-width: 900px)');
    useFlatHuntWithPair();
    mount();
    await listReady();
    expect(filterButton()).toBeNull();
    expect(root.querySelector('select[aria-label="Sort"]')).not.toBeNull();
  });

  it('reads a row score as 79/100 with a spoken name', async () => {
    stubMatchMedia(false);
    useFlatHuntWithPair();
    metaStore.set(listingNote.id, {
      ...metaStore.get(listingNote.id),
      fit: 79,
    });
    mount();
    await listReady();
    await waitUntil(() => root.querySelector('.folder-row-score') !== null);
    const score = root.querySelector('.folder-row-score');
    expect(score?.textContent).toBe('79/100');
    expect(score?.getAttribute('aria-label')).toBe('Your score 79 of 100');
  });

  it('puts a clock badge on the row of a file with a Rename waiting (#765, D32)', async () => {
    stubMatchMedia(false);
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
    await waitUntil(() => root.querySelector('.folder-row-waiting') !== null);
    const badges = root.querySelectorAll('.folder-row-waiting');
    expect(badges).toHaveLength(1);
    expect(badges[0]?.getAttribute('aria-label')).toBe(
      'Waiting for the next tidy-up',
    );
  });

  it('puts the same clock badge on the row of a file with a Move waiting (#866)', async () => {
    stubMatchMedia(false);
    useFlatHuntWithPair();
    requestRows.list = [
      {
        key: 'k',
        state: 'waiting',
        text: `Move “Flat” (${listingNote.path}) to 3-Resources.`,
        kind: 'job',
        since: '2026-09-29T10:00:00Z',
        fileId: 'NOTE_ID',
      },
    ];
    mount();
    await listReady();
    await waitUntil(() => root.querySelector('.folder-row-waiting') !== null);
    expect(root.querySelectorAll('.folder-row-waiting')).toHaveLength(1);
  });
});
