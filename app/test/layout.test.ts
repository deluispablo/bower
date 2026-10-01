// @vitest-environment jsdom

import { h, render } from 'preact';
import type { VNode } from 'preact';
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
import { buildVaultIndex } from '../src/vault-index.js';
import { stubMatchMedia } from './helpers/match-media.js';

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

vi.mock('../src/session.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/session.js')>()),
  useSession: () => ({ status: 'signed-in', me, signOut }),
}));

// One index for the whole file, as the real store keeps it between renders:
// the quick switcher (opened from the search) re-reads it
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
    lastFinished: null,
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
  loadSeen: () => Promise.resolve([]),
  saveSeen: () => Promise.resolve(),
  loadTreeState: () => Promise.resolve(undefined),
  saveTreeState: () => Promise.resolve(),
}));

const { Layout, clampSidebarWidth, readStoredSidebarWidth } =
  await import('../src/components/layout.js');

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Layout, null, h('p', null, 'Screen')), root);
  });
}

/** The sheets load on first use (#834): wait for their chunks to arrive. */
async function lazyChunks(): Promise<void> {
  await act(async () => {
    await import('../src/components/help-sheet.js');
    await import('../src/components/working-sheet.js');
    await new Promise((resolve) => setTimeout(resolve, 0));
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
    expect(nav.getAttribute('aria-label')).toBe('Main');
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a'));
    // The label only: the Bower tab's bird mark carries its own hidden
    // drawing text (#915).
    expect(
      links.map((a) => a.querySelector(':scope > span')?.textContent),
    ).toEqual(['Home', 'Folders', 'Add', 'Bower']);
    expect(links[3]?.querySelector('svg.b.mark')).not.toBeNull();
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

  it('mounts the working sheet once, outside the bar, during a run (#320)', async () => {
    runState.phase = 'running';
    runState.sheetOpen = true;
    mount();
    await lazyChunks();
    // On the shared overlay it is in the body, outside the page (#752).
    const sheets = document.body.querySelectorAll(
      '[role="dialog"][aria-label="Tidying up"]',
    );
    expect(sheets).toHaveLength(1);
    expect(query('.topbar').contains(sheets[0] ?? null)).toBe(false);
  });

  it('lights Home on Just filed and no tab on Settings (R-TABBAR-2)', () => {
    location.path = '/just-filed';
    mount();
    const current = (): (string | null)[] =>
      Array.from(root.querySelectorAll('nav.bottom-nav a')).map((a) =>
        a.getAttribute('aria-current'),
      );
    expect(current()).toEqual(['page', null, null, null]);
    void act(() => {
      render(null, root);
    });
    location.path = '/settings';
    mount();
    expect(current()).toEqual([null, null, null, null]);
    void act(() => {
      render(null, root);
    });
    location.path = '/note/id-1';
    mount();
    expect(current()).toEqual([null, 'page', null, null]);
  });

  it('orders the tab bar: files, title, ⋯, spacer, avatar; no "?" (R-TOPBAR-1)', () => {
    mount();
    const bar = query('.topbar');
    expect(bar.classList.contains('topbar-tab')).toBe(true);
    const order = Array.from(bar.children).map((el) => el.className);
    expect(order[0]).toBe('topbar-files');
    expect(order[1]).toBe('topbar-crumb');
    expect(order[2]).toContain('topbar-actions');
    expect(order[order.length - 1]).toBe('topbar-avatar');
    expect(root.querySelector('.topbar-help')).toBeNull();
    expect(bar.textContent).not.toContain('?');

    expect(query('.topbar-files').getAttribute('aria-label')).toBe(
      'Open your folders',
    );
    const avatar = query<HTMLButtonElement>('.topbar-avatar');
    expect(avatar.tagName).toBe('BUTTON');
    expect(avatar.getAttribute('aria-label')).toBe('Settings');
    expect(avatar.textContent).toBe('Y');
    location.route.mockClear();
    click(avatar);
    expect(location.route).toHaveBeenCalledWith('/settings');
  });

  it('shows the Folders tab bar: "Folders", no files button (NT-Main-375)', () => {
    location.path = '/notes';
    mount();
    const bar = query('.topbar');
    expect(bar.classList.contains('topbar-explorer')).toBe(true);
    expect(root.querySelector('.topbar-files')).toBeNull();
    expect(query('.topbar h1.topbar-title').textContent).toBe('Folders');
    expect(root.querySelector('.topbar-avatar')).not.toBeNull();
  });

  it('shows files, Back and no avatar on Settings (ST-Top-375)', () => {
    location.path = '/settings';
    mount();
    const bar = query('.topbar');
    expect(bar.classList.contains('topbar-inner')).toBe(true);
    expect(root.querySelector('.topbar-files')).not.toBeNull();
    expect(query('.topbar-back').getAttribute('aria-label')).toBe(
      'Back to Home',
    );
    expect(root.querySelector('.topbar-avatar')).toBeNull();
  });

  it("opens the help sheet on the ⋯ menu's bower:open-help event, and cancels it", async () => {
    location.path = '/bower';
    mount();
    const event = new Event('bower:open-help', { cancelable: true });
    void act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    await lazyChunks();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.querySelector('h2')?.textContent).toBe('Bower');
  });

  it('"Show me around" on the help sheet closes it and goes Home for the tour', async () => {
    location.path = '/notes';
    location.route.mockClear();
    mount();
    void act(() => {
      window.dispatchEvent(new Event('bower:open-help', { cancelable: true }));
    });
    await lazyChunks();
    const showMe = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent === 'Show me around',
    );
    if (showMe === undefined) throw new Error('Show me around missing');
    click(showMe);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(location.route).toHaveBeenCalledWith('/');
  });

  it('shows the wordmark as text, and never the bird, in the bar', () => {
    mount();
    const title = query('.topbar .topbar-title');
    expect(title.textContent).toBe('Bower');
    expect(title.querySelector('svg')).toBeNull();
    expect(root.querySelector('.topbar .bird')).toBeNull();
  });

  it('shows Back on an inner screen', () => {
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

  it('shows the explorer as a desktop landmark, not a dialog', () => {
    mount();
    const sidebar = query('nav[aria-label="Your folders"]');
    expect(sidebar.getAttribute('role')).toBeNull();
    // #909: Health check is a nav item (#906); no account row (board).
    expect(sidebar.textContent).toContain('Your folders');
    expect(sidebar.textContent).not.toContain('you@example.com');
    expect(sidebar.querySelector('[role="tree"]')).not.toBeNull();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps Settings as a desktop sidebar row', () => {
    mount();
    expect(
      query('nav[aria-label="Your folders"] a[href="/settings"]').textContent,
    ).toBe('Settings');
  });

  it('has no folder menu on the phone: the Notes tab is the only explorer (#586)', () => {
    mount();
    expect(root.querySelector('.menu-button')).toBeNull();
    expect(root.querySelector('.drawer')).toBeNull();
    expect(root.querySelector('button[aria-label="Your folders"]')).toBeNull();
  });

  it('has the three tools on YOUR FOLDERS, one name each (#909)', () => {
    mount();
    const sidebar = query('nav[aria-label="Your folders"]');
    expect(
      Array.from(sidebar.querySelectorAll('.explorer-tool')).map((b) =>
        b.getAttribute('aria-label'),
      ),
    ).toEqual(['Show the open item', 'Sort', 'Collapse all folders']);
  });

  it('"Collapse all folders" collapses every folder (#909)', () => {
    mount();
    const sidebar = query('nav[aria-label="Your folders"]');
    for (const chevron of Array.from(
      sidebar.querySelectorAll<HTMLButtonElement>('.tree-chevron'),
    )) {
      click(chevron);
    }
    expect(
      sidebar.querySelectorAll('[aria-expanded="true"]').length,
    ).toBeGreaterThan(0);
    click(
      query<HTMLButtonElement>(
        'nav[aria-label="Your folders"] button[aria-label="Collapse all folders"]',
      ),
    );
    expect(sidebar.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0);
  });

  it("shows the waiting count on Add's row, not on Home (#422, #326, C.9)", () => {
    mount();
    const sidebar = query('nav[aria-label="Your folders"]');
    const add = query<HTMLAnchorElement>(
      'nav[aria-label="Main"] a[href="/add"]',
    );
    expect(add.querySelector('.nav-badge')?.textContent).toBe('1');
    const home = query<HTMLAnchorElement>('nav[aria-label="Main"] a[href="/"]');
    expect(home.querySelector('.nav-badge')).toBeNull();
    // Sanity: the fixture's one pending file is `0-Inbox/Receipt.pdf` (the tree names its folder Inbox).
    expect(sidebar.textContent).toContain('Inbox');
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

  it('marks a folder route for its three panes and labels the pane Preview (#614)', () => {
    location.path = '/folder/1-Projects/Flat%20hunt';
    const preview = h('p', null, 'Selected');
    function FillAside() {
      useShellSlot('aside', preview);
      return null;
    }

    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(
        h(ShellSlotsProvider, null, h(Layout, null, h(FillAside, null))),
        root,
      );
    });

    expect(query('.shell').classList.contains('shell-folder')).toBe(true);
    expect(query('aside.shell-aside').getAttribute('aria-label')).toBe(
      'Preview',
    );
  });

  it('keeps About this note as the pane label on a note (#614)', () => {
    location.path = '/note/id-1';
    const about = h('p', null, 'About');
    function FillAside() {
      useShellSlot('aside', about);
      return null;
    }

    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(
        h(ShellSlotsProvider, null, h(Layout, null, h(FillAside, null))),
        root,
      );
    });

    expect(query('.shell').classList.contains('shell-folder')).toBe(false);
    expect(query('aside.shell-aside').getAttribute('aria-label')).toBe(
      'About this note',
    );
  });
});

describe('Layout v5 slots (#741)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
  });

  type Fills = Partial<
    Record<'tidyBar' | 'uploadChip' | 'breadcrumb' | 'ledge', VNode>
  >;

  function mountWith(fills: Fills): void {
    function Fill(): null {
      useShellSlot('tidyBar', fills.tidyBar ?? null);
      useShellSlot('uploadChip', fills.uploadChip ?? null);
      useShellSlot('breadcrumb', fills.breadcrumb ?? null);
      useShellSlot('ledge', fills.ledge ?? null);
      return null;
    }
    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(h(ShellSlotsProvider, null, h(Layout, null, h(Fill, null))), root);
    });
  }

  it('shows nothing extra with every slot empty', () => {
    mount();
    expect(root.querySelector('.shell-dock')).toBeNull();
    expect(root.querySelector('.topbar-chip')).toBeNull();
    expect(query('.shell').classList.contains('shell-with-dock')).toBe(false);
    expect(query('.topbar-breadcrumb').childNodes).toHaveLength(0);
    expect(query('.shell-ledge').childNodes).toHaveLength(0);
  });

  it('puts the ledge outside the nav landmark, aria-hidden, after the explorer', () => {
    mount();
    const ledge = query('.shell-ledge');
    expect(ledge.getAttribute('aria-hidden')).toBe('true');
    expect(ledge.closest('nav')).toBeNull();
    const nav = query('nav[aria-label="Your folders"]');
    expect(nav.nextElementSibling).toBe(ledge);
    expect(ledge.parentElement).toBe(nav.parentElement);
  });

  it('docks the bar between the page and the tab bar on a phone', () => {
    mountWith({ tidyBar: h('p', null, 'Tidy') });
    const dock = query('.shell-dock');
    expect(dock.textContent).toBe('Tidy');
    expect(dock.nextElementSibling).toBe(query('nav.bottom-nav'));
    expect(query('.shell').classList.contains('shell-with-dock')).toBe(true);
    expect(root.querySelector('.topbar-chip')).toBeNull();
  });

  it('puts the same bar in the top bar from 900 px, before the avatar (the done pill is hidden in CSS, E-9)', () => {
    stubMatchMedia(true);
    mountWith({ tidyBar: h('p', null, 'Tidy') });
    const chip = query('.topbar-chip');
    expect(chip.textContent).toBe('Tidy');
    expect(chip.nextElementSibling).toBe(query('.topbar-avatar'));
    expect(root.querySelector('.shell-dock')).toBeNull();
    expect(query('.shell').classList.contains('shell-with-dock')).toBe(false);
  });

  it('lets the tidy-up bar win over the upload chip, and shows the chip alone', () => {
    mountWith({
      tidyBar: h('p', null, 'Tidy'),
      uploadChip: h('p', null, 'Upload'),
    });
    expect(query('.shell-dock').textContent).toBe('Tidy');
    void act(() => {
      render(null, root);
    });
    document.body.replaceChildren();
    mountWith({ uploadChip: h('p', null, 'Upload') });
    expect(query('.shell-dock').textContent).toBe('Upload');
  });

  it('fills the breadcrumb and ledge slots', () => {
    mountWith({
      breadcrumb: h('span', null, 'Crumbs'),
      ledge: h('span', null, 'Perch'),
    });
    expect(query('.topbar-breadcrumb').textContent).toBe('Crumbs');
    expect(query('.shell-ledge').textContent).toBe('Perch');
  });

  it('mounts the overlay host once: an opened overlay renders in the body', async () => {
    const queue = await import('../src/overlay-queue.js');
    mount();
    void act(() => {
      queue.open({
        id: 'test',
        priority: queue.OVERLAY_PRIORITY.own,
        render: () => h('p', { id: 'from-queue' }, 'Queued'),
      });
    });
    expect(document.querySelectorAll('#from-queue')).toHaveLength(1);
    void act(() => {
      queue.resetOverlayQueue();
    });
  });

  it('applies a stored sidebar width as --sidebar-width in the first render', () => {
    localStorage.setItem('bower:pref:sidebarWidth', '320');
    mount();
    expect(
      query<HTMLElement>('.shell').style.getPropertyValue('--sidebar-width'),
    ).toBe(`${clampSidebarWidth(320, window.innerWidth)}px`);
  });

  it('leaves --sidebar-width to the stylesheet with nothing stored or a bad value', () => {
    mount();
    expect(
      query<HTMLElement>('.shell').style.getPropertyValue('--sidebar-width'),
    ).toBe('');
    void act(() => {
      render(null, root);
    });
    localStorage.setItem('bower:pref:sidebarWidth', '"wide"');
    mount();
    expect(
      query<HTMLElement>('.shell').style.getPropertyValue('--sidebar-width'),
    ).toBe('');
  });
});

describe('clampSidebarWidth', () => {
  it('keeps 200 to 480 px', () => {
    expect(clampSidebarWidth(100, 1600)).toBe(200);
    expect(clampSidebarWidth(320, 1600)).toBe(320);
    expect(clampSidebarWidth(900, 1600)).toBe(480);
  });

  it('leaves the main column at least 560 px', () => {
    expect(clampSidebarWidth(480, 900)).toBe(340);
    expect(clampSidebarWidth(480, 1000)).toBe(440);
    expect(clampSidebarWidth(480, 1040)).toBe(480);
  });

  it('never goes under 200, even in a window too narrow for both', () => {
    expect(clampSidebarWidth(300, 700)).toBe(200);
  });
});

describe('readStoredSidebarWidth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads a stored number', () => {
    localStorage.setItem('bower:pref:sidebarWidth', '300');
    expect(readStoredSidebarWidth()).toBe(300);
  });

  it('is null when missing, not a number or unparseable', () => {
    expect(readStoredSidebarWidth()).toBeNull();
    localStorage.setItem('bower:pref:sidebarWidth', '"300"');
    expect(readStoredSidebarWidth()).toBeNull();
    localStorage.setItem('bower:pref:sidebarWidth', '{oops');
    expect(readStoredSidebarWidth()).toBeNull();
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

  it('puts Learn Bower in the shell signed in and bare signed out (R-LEARN-1)', () => {
    for (const path of ['/learn', '/learn/money']) {
      expect(usesShell(path)).toBe(true);
      expect(usesShell(path, false, true)).toBe(true);
      expect(usesShell(path, false, false)).toBe(false);
      expect(usesShell(path, true, true)).toBe(true);
    }
    expect(usesShell('/learning', false, false)).toBe(true);
  });

  it("puts the demo's Run your own Bower in the shell, and nothing else bare (#366)", () => {
    expect(usesShell('/login', true)).toBe(true);
    expect(usesShell('/not-invited', true)).toBe(true);
    for (const path of ['/privacy', '/terms', '/onboarding', '/welcome']) {
      expect(usesShell(path, true)).toBe(false);
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

  it("treats the demo's /login as an inner screen, with Back (#366)", () => {
    expect(isInnerScreen('/login', true)).toBe(true);
  });
});

describe('helpScreenFor', () => {
  it('points "?" at the sheet for the screen on show', () => {
    expect(helpScreenFor('/')).toBe('home');
    expect(helpScreenFor('/notes')).toBe('notes');
    expect(helpScreenFor('/add')).toBe('add');
    expect(helpScreenFor('/bower')).toBe('bower');
    expect(helpScreenFor('/folder/2-Areas/Cooking')).toBe('folder');
    expect(helpScreenFor('/note/id-1')).toBe('note');
    expect(helpScreenFor('/file/id-2')).toBe('file');
    expect(helpScreenFor('/just-filed')).toBe('justFiled');
    expect(helpScreenFor('/settings')).toBe('settings');
  });
});
