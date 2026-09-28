// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../src/api.js';
import {
  ShellSlotsProvider,
  useShellSlot,
} from '../src/components/shell-slots.js';
import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { BackLink } from '../src/components/back-link.js';
import { bowerUrlFor } from '../src/routes/tell-redirect.js';
import {
  helpScreenFor,
  isInnerScreen,
  usesShell,
} from '../src/shell-routes.js';
import type { RunPhase } from '../src/run-store.js';
import { closeSwitcher } from '../src/switcher-store.js';
import { buildVaultIndex } from '../src/vault-index.js';

const location = { path: '/', route: vi.fn() };

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
  file('2-Areas', FOLDER_MIME),
  file('2-Areas/Cooking', FOLDER_MIME),
  file('2-Areas/Cooking/Sourdough starter.md'),
  file('0-Inbox', FOLDER_MIME),
  file('0-Inbox/Receipt.pdf', 'application/pdf'),
];

const signOut = vi.fn(() => Promise.resolve());

vi.mock('preact-iso', () => ({
  useLocation: () => location,
}));

vi.mock('../src/session.js', () => ({
  useSession: () => ({ status: 'signed-in', me, signOut }),
}));

// One index for the whole file, as the real store keeps it between renders:
// the quick switcher (opened from the folder menu's search row) re-reads it
// in an effect, so a fresh one per render would never settle.
let index: ReturnType<typeof buildVaultIndex> | undefined;

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => {
    index ??= buildVaultIndex(files);
    return { index, files };
  },
}));

const runState: { phase: RunPhase; sheetOpen: boolean } = {
  phase: 'idle',
  sheetOpen: false,
};

vi.mock('../src/run-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/run-store.js')>()),
  useRun: () => ({
    ...runState,
    run: null,
    sheetReopenKey: 0,
    process: vi.fn(),
    tidyUp: vi.fn(),
    openSheet: vi.fn(),
    dismissSheet: vi.fn(),
  }),
}));

vi.mock('../src/cache.js', () => ({
  loadIndex: () => Promise.resolve(undefined),
  loadNote: () => Promise.resolve(undefined),
}));

const { Layout, avatarInitial } = await import('../src/components/layout.js');

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Layout, null, h('p', null, 'Screen')), root);
  });
}

function query<T extends Element>(selector: string): T {
  const el = root.querySelector<T>(selector);
  if (el === null) throw new Error(`${selector} missing`);
  return el;
}

function click(el: Element): void {
  void act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function pressEscape(): void {
  void act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
  });
}

function openDrawer(): HTMLButtonElement {
  const menu = query<HTMLButtonElement>('.menu-button');
  menu.focus();
  click(menu);
  return menu;
}

beforeEach(() => {
  location.path = '/';
  runState.phase = 'idle';
  runState.sheetOpen = false;
  localStorage.clear();
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
});

describe('Layout', () => {
  it('renders the four tabs, the current one marked, no Health', () => {
    location.path = '/add';
    mount();
    const nav = query('nav.bottom-nav');
    expect(nav.getAttribute('aria-label')).toBe('Primary');
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a'));
    expect(links.map((a) => a.textContent)).toEqual([
      'Home',
      'Notes',
      'Add',
      'Bower',
    ]);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/notes',
      '/add',
      '/bower',
    ]);
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'page',
      null,
    ]);
    for (const link of links) {
      expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('has no Tidy up in the bar, idle or during a run (#320)', () => {
    mount();
    expect(root.querySelector('.process-button')).toBeNull();
    expect(query('.topbar').textContent).not.toContain('Tidy');
    void act(() => {
      render(null, root);
    });

    runState.phase = 'running';
    mount();
    expect(root.querySelector('.process-button')).toBeNull();
    expect(query('.topbar').textContent).not.toContain('Tidying');
  });

  it('mounts the working sheet once, outside the bar, during a run (#320)', () => {
    runState.phase = 'running';
    runState.sheetOpen = true;
    mount();
    const sheets = root.querySelectorAll('[aria-label="Tidying up status"]');
    expect(sheets).toHaveLength(1);
    expect(query('.topbar').contains(sheets[0] ?? null)).toBe(false);
  });

  it('orders the bar: folder menu, title, "?", avatar (#318)', () => {
    mount();
    const bar = query('.topbar');
    const order = Array.from(bar.children).map((el) => el.className);
    const menuIndex = order.findIndex((c) => c.includes('menu-button'));
    const titleIndex = order.findIndex((c) => c.includes('topbar-crumb'));
    const helpIndex = order.findIndex((c) => c.includes('topbar-help'));
    expect(menuIndex).toBe(0);
    expect(titleIndex).toBeGreaterThan(menuIndex);
    expect(helpIndex).toBeGreaterThan(titleIndex);
    expect(order[order.length - 1]).toBe('topbar-avatar');

    expect(query('.menu-button').getAttribute('aria-label')).toBe(
      'Your folders',
    );
    expect(query('.topbar-help').getAttribute('aria-label')).toBe(
      'About this screen',
    );
    const avatar = query<HTMLAnchorElement>('.topbar-avatar');
    expect(avatar.getAttribute('href')).toBe('/settings');
    expect(avatar.getAttribute('aria-label')).toBe('Settings');
    expect(avatar.textContent).toBe('Y');
  });

  it('shows the wordmark as text, and never the bird, in the bar', () => {
    mount();
    const title = query('.topbar .topbar-title');
    expect(title.textContent).toBe('Bower');
    expect(title.querySelector('svg')).toBeNull();
    expect(root.querySelector('.topbar .bird')).toBeNull();
  });

  it('shows Back instead of the folder menu on an inner screen', () => {
    location.path = '/health';
    mount();
    expect(root.querySelector('.topbar .menu-button')).toBeNull();
    const back = query<HTMLAnchorElement>('.topbar .topbar-back');
    expect(back.getAttribute('aria-label')).toBe('Back to Home');
    expect(back.getAttribute('href')).toBe('/');
  });

  it('shows the Back a screen gives the bar, in place of the default', () => {
    location.path = '/note/id-1';
    const backLink = h(BackLink, { href: '/folder/2-Areas', label: 'Areas' });
    function FillBack() {
      useShellSlot('back', backLink);
      return null;
    }
    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(
        h(ShellSlotsProvider, null, h(Layout, null, h(FillBack, null))),
        root,
      );
    });
    const back = query<HTMLAnchorElement>('.topbar .topbar-back');
    expect(back.getAttribute('aria-label')).toBe('Back to Areas');
    expect(back.getAttribute('href')).toBe('/folder/2-Areas');
  });

  it('opens the help sheet for the tab on "?"', () => {
    location.path = '/bower';
    mount();
    click(query('.topbar-help'));
    const dialog = query('[role="dialog"]');
    expect(dialog.textContent).toContain('About this screen');
    expect(dialog.querySelector('h2')?.textContent).toBe('Bower');
    // jsdom lays nothing out, so the first Bower link (the sidebar's) wins.
    expect(query('[data-tour="bower"]').classList.contains('help-tab-on')).toBe(
      true,
    );
  });

  it('"Show me around" on the help sheet closes it and goes Home for the tour', () => {
    location.path = '/notes';
    location.route.mockClear();
    mount();
    click(query('.topbar-help'));
    const showMe = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Show me around',
    );
    if (showMe === undefined) throw new Error('Show me around missing');
    click(showMe);
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(location.route).toHaveBeenCalledWith('/');
  });

  it('shows the explorer as a desktop landmark, not a dialog', () => {
    mount();
    const sidebar = query('nav[aria-label="Your notes"]');
    expect(sidebar.getAttribute('role')).toBeNull();
    expect(sidebar.textContent).toContain('Health');
    expect(sidebar.textContent).toContain('you@example.com');
    expect(sidebar.querySelector('[role="tree"]')).not.toBeNull();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps Settings as a desktop sidebar row, not in the folder menu', () => {
    mount();
    expect(
      query('nav[aria-label="Your notes"] a[href="/settings"]').textContent,
    ).toBe('Settings');
    openDrawer();
    expect(
      root.querySelector('[role="dialog"] a[href="/settings"]'),
    ).toBeNull();
  });

  it('opens the folder menu as a modal dialog over an inert page (#319)', () => {
    mount();
    const menu = openDrawer();
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    const dialog = query('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = query(`#${dialog.getAttribute('aria-labelledby') ?? ''}`);
    expect(title.textContent).toBe('Your folders');
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (const selector of ['.shell-sidebar', '.shell-main', '.bottom-nav']) {
      expect(query(selector).hasAttribute('inert')).toBe(true);
    }

    pressEscape();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(query('.shell-main').hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(menu);
  });

  it('lists the top-level folders with their meaning line and count', () => {
    mount();
    openDrawer();
    const links = Array.from(
      root.querySelectorAll<HTMLAnchorElement>(
        '[role="dialog"] .folder-menu-link',
      ),
    );
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/folder/0-Inbox',
      '/folder/2-Areas',
    ]);
    expect(links[1]?.textContent).toBe(
      '2-AreasParts of life that go on: home, health, money1',
    );
    // No count at zero: the inbox holds only a PDF, not a note.
    expect(links[0]?.querySelector('.folder-menu-count')).toBeNull();
    expect(query('[role="dialog"] .folder-menu-foot').textContent).toContain(
      'Long-press to pin it to Home.',
    );
  });

  it("shows a folder's subfolders from its chevron", () => {
    mount();
    openDrawer();
    const chevron = query<HTMLButtonElement>(
      '[role="dialog"] button[aria-label="Folders in 2-Areas"]',
    );
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    click(chevron);
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
    expect(
      query('[role="dialog"] a[href="/folder/2-Areas/Cooking"]').textContent,
    ).toBe('Cooking1');
  });

  it('closes the menu and opens the switcher from the search row', () => {
    mount();
    openDrawer();
    const search = Array.from(
      root.querySelectorAll('[role="dialog"] button'),
    ).find((button) => button.textContent === 'Search or jump to anything');
    if (search === undefined) throw new Error('search row missing');
    click(search);
    expect(root.querySelector('.drawer')).toBeNull();
    expect(
      root.querySelector('[role="dialog"][aria-label="Quick switcher"]'),
    ).not.toBeNull();
    void act(() => {
      closeSwitcher();
    });
  });

  it('closes the drawer on a backdrop tap and on the close button', () => {
    mount();
    openDrawer();
    click(query('.drawer-backdrop'));
    expect(root.querySelector('[role="dialog"]')).toBeNull();

    openDrawer();
    click(query('[role="dialog"] button[aria-label="Close"]'));
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('sorts by last modified and remembers it', () => {
    mount();
    const sort = query<HTMLButtonElement>(
      'nav[aria-label="Your notes"] button[aria-label="Sort by last modified"]',
    );
    click(sort);
    expect(sort.getAttribute('aria-label')).toBe('Sort by name');
    expect(localStorage.getItem('bower:pref:explorerSort')).toBe('"modified"');
  });

  it('collapses every folder with Collapse all', () => {
    mount();
    const sidebar = query('nav[aria-label="Your notes"]');
    // The sidebar tree links a folder's name to `/folder/<path>` (#214); its
    // chevron is still the toggle.
    const chevron = query<HTMLButtonElement>(
      'nav[aria-label="Your notes"] .tree-folder .tree-chevron',
    );
    click(chevron);
    expect(sidebar.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1);
    click(
      query('nav[aria-label="Your notes"] button[aria-label="Collapse all"]'),
    );
    expect(sidebar.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0);
  });

  it('renders content from the actions shell slot in the bar', () => {
    // A stable VNode, created once: useShellSlot refills the slot whenever
    // its `content` argument is a new reference, so passing a fresh one on
    // every render (as an inline h(...) call here would) never settles.
    const actionButton = h('button', { type: 'button' }, 'Open in Drive');
    function FillActions() {
      useShellSlot('actions', actionButton);
      return null;
    }

    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(
        h(ShellSlotsProvider, null, h(Layout, null, h(FillActions, null))),
        root,
      );
    });

    const slot = query('[data-slot="actions"]');
    expect(slot.querySelector('button')?.textContent).toBe('Open in Drive');
  });
});

describe('usesShell', () => {
  it('is false for sign-in, Not invited, Privacy, Terms, onboarding and the intro', () => {
    for (const path of [
      '/login',
      '/not-invited',
      '/privacy',
      '/terms',
      '/onboarding',
      '/welcome',
    ]) {
      expect(usesShell(path)).toBe(false);
    }
  });

  it('is true for every other route, so those keep the bottom nav', () => {
    for (const path of [
      '/',
      '/notes',
      '/add',
      '/bower',
      '/tell',
      '/settings',
      '/note/id-1',
    ]) {
      expect(usesShell(path)).toBe(true);
    }
  });
});

describe('bowerUrlFor', () => {
  it('sends /tell to /bower, keeping the query string', () => {
    expect(bowerUrlFor({})).toBe('/bower');
    expect(bowerUrlFor({ text: '[[Shopping list]] ' })).toBe(
      '/bower?text=%5B%5BShopping+list%5D%5D+',
    );
  });
});

describe('isInnerScreen', () => {
  it('is false for the four tabs and the bare screens', () => {
    for (const path of ['/', '/notes', '/add', '/bower', '/login']) {
      expect(isInnerScreen(path)).toBe(false);
    }
  });

  it('is true for a note, a folder, Health, Settings and Not found', () => {
    for (const path of [
      '/note/id-1',
      '/folder/2-Areas',
      '/health',
      '/settings',
      '/no-such-page',
    ]) {
      expect(isInnerScreen(path)).toBe(true);
    }
  });
});

describe('helpScreenFor', () => {
  it('points "?" at the sheet for the screen on show', () => {
    expect(helpScreenFor('/')).toBe('home');
    expect(helpScreenFor('/notes')).toBe('notes');
    expect(helpScreenFor('/add')).toBe('add');
    expect(helpScreenFor('/bower')).toBe('bower');
    expect(helpScreenFor('/folder/2-Areas/Cooking')).toBe('folder');
    expect(helpScreenFor('/note/id-1')).toBe('notes');
    expect(helpScreenFor('/settings')).toBe('home');
  });
});

describe('avatarInitial', () => {
  it("is the email's first letter, upper case, or ? without one", () => {
    expect(avatarInitial('you@example.com')).toBe('Y');
    expect(avatarInitial(undefined)).toBe('?');
    expect(avatarInitial('')).toBe('?');
  });
});
