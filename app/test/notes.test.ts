// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../src/api.js';
import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { REPORT_PATH } from '../src/health-report.js';
import { buildVaultIndex } from '../src/vault-index.js';

const location = { path: '/notes', route: vi.fn() };

const me: Me = {
  email: 'you@example.com',
  vault: { folderId: 'FOLDER_ID', inboxFolderId: 'FOLDER_ID', name: 'Bower' },
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

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
  file('0-Inbox', FOLDER_MIME),
  file('0-Inbox/Receipt.pdf', 'application/pdf'),
  file('2-Areas', FOLDER_MIME),
  file('2-Areas/Cooking', FOLDER_MIME),
  file('2-Areas/Cooking/Sourdough starter.md'),
  file(REPORT_PATH),
];

const REPORT_TEXT = `---
notes: 12
findings: 2
brokenLinks: 0
---

## To fix
- [ ] 2 notes without tags
`;

vi.mock('preact-iso', () => ({
  useLocation: () => location,
}));

vi.mock('../src/session.js', () => ({
  useSession: () => ({
    status: 'signed-in',
    me,
    signOut: vi.fn(() => Promise.resolve()),
  }),
}));

const openSwitcher = vi.fn();

// The tree reads what is new (`useNew`) and its saved expansion.
vi.mock('../src/run-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/run-store.js')>()),
  useRun: () => ({ lastFinished: null }),
}));

vi.mock('../src/cache.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/cache.js')>()),
  loadSeen: () => Promise.resolve([]),
  saveSeen: () => Promise.resolve(),
  loadTreeState: () => Promise.resolve(undefined),
  saveTreeState: () => Promise.resolve(),
}));

vi.mock('../src/switcher-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/switcher-store.js')>()),
  openSwitcher: () => {
    openSwitcher();
  },
}));

let index: ReturnType<typeof buildVaultIndex> | undefined;
let firstLoad = false;

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => {
    index ??= buildVaultIndex(files);
    return {
      index: firstLoad ? null : index,
      status: firstLoad ? 'loading' : 'idle',
      files,
      getNoteText: () => Promise.resolve(REPORT_TEXT),
    };
  },
}));

const { Notes } = await import('../src/routes/notes.js');
const { PinnedSidebar } = await import('../src/components/pinned-sidebar.js');

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Notes, null), root);
  });
}

function query<T extends Element>(selector: string): T {
  const el = root.querySelector<T>(selector);
  if (el === null) throw new Error(`${selector} missing`);
  return el;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  location.path = '/notes';
  openSwitcher.mockClear();
  firstLoad = false;
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
});

describe('Notes (#353)', () => {
  it('has a search row that opens the quick switcher, no inline filter (#433)', () => {
    mount();
    expect(root.querySelector('input')).toBeNull();
    const row = query<HTMLButtonElement>('button.search-field-open');
    expect(row.textContent).toBe('Search folders, notes and files');
    void act(() => {
      row.click();
    });
    expect(openSwitcher).toHaveBeenCalledOnce();
  });

  it('has YOUR FOLDERS with its three tools (#909)', () => {
    mount();
    expect(query('.explorer-label').textContent).toBe('Your folders');
    expect(
      Array.from(root.querySelectorAll('.explorer-tool')).map((b) =>
        b.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Show the open item',
      'Sort your folders',
      'Collapse all folders',
    ]);
  });

  it('draws the tree with no counts, meanings, badges or new tags (K-1)', () => {
    mount();
    const inbox = query('a[role="treeitem"][href="/folder/0-Inbox"]');
    expect(inbox.textContent).toBe('Inbox');
    expect(root.querySelector('.tree-count')).toBeNull();
    expect(root.querySelector('.tree-meaning')).toBeNull();
    expect(root.querySelector('.kind-badge')).toBeNull();
    expect(root.querySelector('.tag-new')).toBeNull();
  });

  it('puts Health check at the bottom with no subtitle, and no hidden-files footer', async () => {
    mount();
    await flush();
    const health = query<HTMLAnchorElement>(
      '.explorer-below a[href="/health"]',
    );
    expect(health.textContent).toBe('Health check');
    expect(root.querySelector('.explorer-hidden')).toBeNull();
    expect(root.textContent).not.toContain("Bower's own files");
  });

  it('has no account row (#353: not on the Phone-Notes board)', () => {
    mount();
    expect(root.querySelector('.explorer-account')).toBeNull();
  });

  it('puts the Just filed slot between the search row and Your folders (#616 fills it)', () => {
    mount();
    const slot = query('[data-slot="just-filed"]');
    expect(slot.childElementCount).toBe(0);
    const search = query('button.search-field-open');
    const heading = query('.explorer-label');
    expect(
      search.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      slot.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows six skeleton bars on the first load (R-EXP-10)', () => {
    firstLoad = true;
    mount();
    expect(root.querySelectorAll('.explorer-skeleton-bar')).toHaveLength(6);
    expect(root.querySelector('[role="tree"]')).toBeNull();
  });

  it('shows the tree and no status line once the index exists', () => {
    mount();
    expect(root.querySelector('.explorer-skeleton')).toBeNull();
    expect(root.querySelector('[role="status"]')).toBeNull();
    expect(root.querySelector('[role="tree"]')).not.toBeNull();
  });
});

describe('PinnedSidebar (#589)', () => {
  it('shows a pinned folder with no count on the Folders tab (K-1)', () => {
    root = document.createElement('div');
    document.body.append(root);
    const items = [
      {
        kind: 'folder' as const,
        path: '2-Areas/Cooking',
        file: file('2-Areas/Cooking/_Cooking.md'),
        pinnedAt: '2026-09-27T10:00:00Z',
      },
    ];
    void act(() => {
      render(h(PinnedSidebar, { items, variant: 'page' }), root);
    });
    expect(query('.explorer-label').textContent).toBe('Pinned');
    expect(query('.explorer-item').textContent).toBe('Cooking');
  });

  it('renders nothing when nothing is pinned', () => {
    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(h(PinnedSidebar, { items: [] }), root);
    });
    expect(root.querySelector('.explorer-pinned')).toBeNull();
  });
});
