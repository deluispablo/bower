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
import { usesShell } from '../src/shell-routes.js';
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

vi.mock('../src/vault-store.js', () => ({
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

const { Layout } = await import('../src/components/layout.js');

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
  it('renders the four bottom nav links, the current one marked, no Health', () => {
    location.path = '/add';
    mount();
    const links = Array.from(
      root.querySelectorAll<HTMLAnchorElement>('.bottom-nav a'),
    );
    expect(links.map((a) => a.textContent)).toEqual([
      'Home',
      'Add',
      'Tell',
      'Settings',
    ]);
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([
      null,
      'page',
      null,
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

  it('renders the pill after the title, menu button first (spec §14)', () => {
    mount();
    const bar = query('.topbar');
    const order = Array.from(bar.children).map((el) => el.className);
    const menuIndex = order.findIndex((c) => c.includes('menu-button'));
    const titleIndex = order.findIndex((c) => c.includes('topbar-brand'));
    const pillIndex = order.findIndex((c) => c.includes('topbar-pill'));
    expect(menuIndex).toBe(0);
    expect(titleIndex).toBeGreaterThan(menuIndex);
    expect(pillIndex).toBeGreaterThan(titleIndex);
    expect(pillIndex).toBe(order.length - 1);
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
    const folder = query<HTMLButtonElement>(
      'nav[aria-label="Your notes"] .tree-folder',
    );
    click(folder);
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
  it('is false for sign-in, Not invited, Privacy, Terms and onboarding', () => {
    for (const path of [
      '/login',
      '/not-invited',
      '/privacy',
      '/terms',
      '/onboarding',
    ]) {
      expect(usesShell(path)).toBe(false);
    }
  });

  it('is true for every other route, so those keep the bottom nav', () => {
    for (const path of ['/', '/add', '/tell', '/settings', '/note/id-1']) {
      expect(usesShell(path)).toBe(true);
    }
  });
});
