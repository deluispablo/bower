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
import { helpStepFor, isInnerScreen, usesShell } from '../src/shell-routes.js';
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

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ index: buildVaultIndex(files), files }),
}));

vi.mock('../src/run-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/run-store.js')>()),
  useRun: () => ({ phase: 'idle', process: vi.fn() }),
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

  it('renders the Tidy up pill once, with the pending count', () => {
    mount();
    const pills = root.querySelectorAll('.process-button');
    expect(pills).toHaveLength(1);
    expect(pills[0]?.textContent).toBe('Tidy up (1)');
  });

  it('orders the bar: folder menu, title, pill, "?", avatar (#318)', () => {
    mount();
    const bar = query('.topbar');
    const order = Array.from(bar.children).map((el) => el.className);
    const menuIndex = order.findIndex((c) => c.includes('menu-button'));
    const titleIndex = order.findIndex((c) => c.includes('topbar-crumb'));
    const pillIndex = order.findIndex((c) => c.includes('topbar-pill'));
    const helpIndex = order.findIndex((c) => c.includes('topbar-help'));
    expect(menuIndex).toBe(0);
    expect(titleIndex).toBeGreaterThan(menuIndex);
    expect(pillIndex).toBeGreaterThan(titleIndex);
    expect(helpIndex).toBeGreaterThan(pillIndex);
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

  it('opens the tour at the step for the tab on "?"', () => {
    location.path = '/bower';
    mount();
    click(query('.topbar-help'));
    const dialog = query('[role="dialog"]');
    expect(dialog.textContent).toContain('Tell Bower');
    expect(dialog.textContent).not.toContain('Drop anything here.');
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

  it('keeps Settings as a desktop sidebar row, not in the drawer', () => {
    mount();
    expect(
      query('nav[aria-label="Your notes"] a[href="/settings"]').textContent,
    ).toBe('Settings');
    openDrawer();
    expect(
      root.querySelector('[role="dialog"] a[href="/settings"]'),
    ).toBeNull();
  });

  it('opens the drawer as a modal dialog and closes it on Escape', () => {
    mount();
    const menu = openDrawer();
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    const dialog = query('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Your notes');
    expect(dialog.contains(document.activeElement)).toBe(true);

    pressEscape();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(menu);
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

  it('renders content from the actions shell slot next to the pill', () => {
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

describe('helpStepFor', () => {
  it('points "?" at the step for the tab on screen', () => {
    expect(helpStepFor('/add')).toBe('add');
    expect(helpStepFor('/bower')).toBe('tell');
    expect(helpStepFor('/')).toBeUndefined();
    expect(helpStepFor('/notes')).toBeUndefined();
  });
});

describe('avatarInitial', () => {
  it("is the email's first letter, upper case, or ? without one", () => {
    expect(avatarInitial('you@example.com')).toBe('Y');
    expect(avatarInitial(undefined)).toBe('?');
    expect(avatarInitial('')).toBe('?');
  });
});
