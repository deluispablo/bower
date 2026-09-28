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

vi.mock('../src/switcher-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/switcher-store.js')>()),
  openSwitcher: () => {
    openSwitcher();
  },
}));

let index: ReturnType<typeof buildVaultIndex> | undefined;

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => {
    index ??= buildVaultIndex(files);
    return {
      index,
      files,
      getNoteText: () => Promise.resolve(REPORT_TEXT),
    };
  },
}));

const { Notes } = await import('../src/routes/notes.js');

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
    const row = query<HTMLButtonElement>('button.explorer-filter');
    expect(row.textContent).toBe('Search or jump to anything');
    void act(() => {
      row.click();
    });
    expect(openSwitcher).toHaveBeenCalledOnce();
  });

  it('has no sort button, only the tree', () => {
    mount();
    expect(root.querySelector('[aria-label^="Sort by"]')).toBeNull();
    expect(root.querySelector('.explorer-section')).toBeNull();
  });

  it("shows a root folder's meaning and count, but not a project's", () => {
    mount();
    const inbox = query('.tree-folder-link[href="/folder/0-Inbox"]');
    expect(inbox.querySelector('.tree-meaning')?.textContent).toBe(
      'Waiting for the next tidy-up',
    );
    // Expand 2-Areas (its own chevron, not 0-Inbox's) to reveal Cooking,
    // a non-root folder.
    const areasChevron = query('a[href="/folder/2-Areas"]')
      .closest('.tree-row')
      ?.querySelector<HTMLButtonElement>('.tree-chevron');
    if (areasChevron === undefined || areasChevron === null) {
      throw new Error('2-Areas chevron missing');
    }
    void act(() => {
      areasChevron.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const cooking = query('.tree-folder-link[href="/folder/2-Areas/Cooking"]');
    expect(cooking.querySelector('.tree-meaning')).toBeNull();
  });

  it('puts the Health row and the hidden-files line together at the bottom, with the compact subtitle', async () => {
    mount();
    await flush();
    const foot = query('.explorer-foot');
    const health = query<HTMLAnchorElement>('.explorer-health-row');
    expect(foot.contains(health)).toBe(true);
    expect(foot.contains(query('.explorer-hidden'))).toBe(true);
    expect(health.textContent).toContain('Health check');
    expect(health.querySelector('.explorer-health-subtitle')?.textContent).toBe(
      'Sunday · 2 small things to fix',
    );
    expect(query('.explorer-hidden').textContent).toContain(
      "Bower's own files and dot-folders: hidden",
    );
  });

  it('has no account row (#353: not on the Phone-Notes board)', () => {
    mount();
    expect(root.querySelector('.explorer-account')).toBeNull();
  });
});
