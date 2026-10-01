// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayHost } from '../src/components/overlay.js';
import { resetOverlayQueue } from '../src/overlay-queue.js';

import { SidebarSeparator } from '../src/components/sidebar-separator.js';
import {
  TREE_ROW_HEIGHT,
  Tree,
  typeAheadIndex,
} from '../src/components/tree.js';
import type { TreeProps } from '../src/components/tree.js';
import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { folderHref } from '../src/navigation.js';
import { buildVaultIndex } from '../src/vault-index.js';

interface Saved {
  expanded: string[];
  scroll: number;
}

const state = vi.hoisted(() => ({
  saved: undefined as Saved | undefined,
  newIds: new Set<string>(),
  renders: 0,
}));

vi.mock('../src/cache.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/cache.js')>()),
  loadTreeState: () => Promise.resolve(state.saved),
  saveTreeState: (next: Saved) => {
    state.saved = next;
    return Promise.resolve();
  },
}));

vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({
    pinNote: vi.fn(),
    unpinNote: vi.fn(),
    pinFolder: vi.fn(),
    unpinFolder: vi.fn(),
  }),
}));

vi.mock('../src/use-new.js', () => ({
  useNew: () => {
    state.renders++;
    return {
      ids: state.newIds,
      isNew: (id: string) => state.newIds.has(id),
      newCountIn: (path: string) =>
        path === '1-Projects/Flat hunt' || path === '1-Projects'
          ? state.newIds.size
          : 0,
      markSeen: vi.fn(),
      markAllSeen: vi.fn(),
    };
  },
}));

let nextId = 0;
function entry(path: string, mimeType = 'text/markdown'): DriveFile {
  nextId++;
  return {
    id: `id${nextId}`,
    name: path.split('/').pop() ?? path,
    mimeType,
    parents: ['PARENT'],
    path,
  };
}
const dir = (path: string): DriveFile => entry(path, FOLDER_MIME);

const files = [
  dir('0-Inbox'),
  dir('1-Projects'),
  dir('1-Projects/Flat hunt'),
  entry('1-Projects/Flat hunt/Budget.md'),
  entry('1-Projects/Flat hunt/Lease.pdf', 'application/pdf'),
  entry('1-Projects/Flat hunt/Window sign.jpg', 'image/jpeg'),
  dir('2-Areas'),
  dir('3-Resources'),
  dir('4-Archives'),
  dir('Answers'),
  dir('Clippings'),
];

let host: HTMLElement;

/** Lets the stored tree state load and its re-render land. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(props: Partial<TreeProps> = {}): Promise<void> {
  await act(() => {
    render(h(Tree, { index: buildVaultIndex(files), ...props }), host);
  });
  await settle();
}

beforeEach(() => {
  // An empty stored state, so a folder opened by an earlier test (kept in
  // the tree's module memory) starts closed again.
  state.saved = { expanded: [], scroll: 0 };
  state.newIds = new Set();
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function topRows(): string[] {
  return [...host.querySelectorAll('[aria-level="1"] .tree-name')].map(
    (node) => node.textContent ?? '',
  );
}

function link(path: string): HTMLAnchorElement {
  const el = host.querySelector<HTMLAnchorElement>(
    `a[href="${folderHref(path)}"]`,
  );
  if (el === null) throw new Error(`${path} missing`);
  return el;
}

function keydown(el: Element, key: string): Promise<void> {
  return act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('Tree (#909): one tree, three hosts', () => {
  it('sizes rows by host: 28 px in the sidebar, 40 px in the drawer and the Folders tab', async () => {
    expect(TREE_ROW_HEIGHT).toEqual({ sidebar: 28, drawer: 40, page: 40 });
    await mount();
    expect(host.querySelector('.tree-wrap.tree-host-sidebar')).not.toBeNull();
    await mount({ host: 'drawer' });
    expect(host.querySelector('.tree-wrap.tree-host-drawer')).not.toBeNull();
    await mount({ host: 'page' });
    expect(host.querySelector('.tree-wrap.tree-host-page')).not.toBeNull();
  });

  it('shows the five roots with their discs; Answers and Clippings sit under the tree', async () => {
    await mount({ host: 'page' });
    expect(topRows()).toEqual([
      'Inbox',
      'Projects',
      'Areas',
      'Resources',
      'Archives',
    ]);
    const marks = [...host.querySelectorAll('.folder-mark')];
    expect(marks.map((m) => m.getAttribute('data-kind'))).toEqual([
      'inbox',
      'projects',
      'areas',
      'resources',
      'archives',
    ]);
  });

  it('draws no counts, meanings, badges or new tags on any host (K-1)', async () => {
    state.newIds = new Set(['id4']);
    state.saved = {
      expanded: ['1-Projects', '1-Projects/Flat hunt'],
      scroll: 0,
    };
    for (const hostName of ['sidebar', 'drawer', 'page'] as const) {
      await mount({ host: hostName });
      expect(host.querySelector('.tree-count')).toBeNull();
      expect(host.querySelector('.tree-meaning')).toBeNull();
      expect(host.querySelector('.kind-badge')).toBeNull();
      expect(host.querySelector('.new-tag')).toBeNull();
      expect(link('1-Projects').querySelector('.tree-name')?.textContent).toBe(
        'Projects',
      );
    }
  });

  it('names each chevron "Expand <name>" / "Collapse <name>" and expands in place', async () => {
    await mount();
    const chevron = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand Projects"]',
    );
    expect(chevron).not.toBeNull();
    await act(() => chevron?.click());
    expect(
      host.querySelector('button[aria-label="Collapse Projects"]'),
    ).not.toBeNull();
    expect(link('1-Projects/Flat hunt')).not.toBeNull();
  });

  it('gives an empty folder no chevron and no aria-expanded', async () => {
    await mount();
    expect(link('2-Areas').hasAttribute('aria-expanded')).toBe(false);
    expect(host.querySelector('button[aria-label="Expand Areas"]')).toBeNull();
  });

  it('lists files and notes by title with depth guides', async () => {
    state.saved = {
      expanded: ['1-Projects', '1-Projects/Flat hunt'],
      scroll: 0,
    };
    await mount();
    const leaves = [
      ...host.querySelectorAll('[aria-level="3"] .tree-name'),
    ].map((n) => n.textContent);
    expect(leaves).toEqual(['Budget', 'Lease', 'Window sign']);
    const lease = host.querySelector('a[href^="/file/"]');
    expect(
      lease?.closest('.tree-row')?.querySelectorAll('.tree-guide'),
    ).toHaveLength(2);
  });

  it('restores expanded folders and saves a change', async () => {
    state.saved = { expanded: ['1-Projects'], scroll: 0 };
    await mount();
    expect(
      host.querySelector('button[aria-label="Collapse Projects"]'),
    ).not.toBeNull();
    await act(() =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Collapse Projects"]',
        )
        ?.click(),
    );
    expect(state.saved?.expanded).toEqual([]);
  });

  it('selects the open item and colours the folder holding it', async () => {
    const index = buildVaultIndex(files);
    const budget = index.byPath.get('1-Projects/Flat hunt/Budget.md');
    await act(() => {
      render(
        h(Tree, { index, revealPath: budget?.path, currentId: budget?.id }),
        host,
      );
    });
    await settle();
    const row = host.querySelector(`a[href="/note/${budget?.id ?? ''}"]`);
    expect(row?.getAttribute('aria-selected')).toBe('true');
    expect(
      row?.closest('.tree-row')?.classList.contains('tree-row-selected'),
    ).toBe(true);
    expect(link('1-Projects/Flat hunt').getAttribute('style')).toContain(
      '--color-para-projects',
    );
    expect(link('1-Projects').getAttribute('aria-selected')).toBe('false');
  });

  it("adds the Bower's own files group only when asked", async () => {
    const withApp = [...files, entry('Bower - Rules.md')];
    await act(() => {
      render(h(Tree, { index: buildVaultIndex(withApp) }), host);
    });
    expect(host.querySelector('.tree-app-label')).toBeNull();
    await act(() => {
      render(
        h(Tree, { index: buildVaultIndex(withApp), showAppFiles: true }),
        host,
      );
    });
    expect(host.querySelector('.tree-app-label')?.textContent).toBe(
      "Bower's own files",
    );
  });
});

describe('Tree pin sheet Ask (#910)', () => {
  it('asks about the row with its kind, path and own icon', async () => {
    const onAsk = vi.fn();
    const overlays = document.createElement('div');
    document.body.append(overlays);
    await act(() => {
      render(h(OverlayHost, null), overlays);
    });
    await mount({ onAsk });
    const row = [...host.querySelectorAll('.tree-folder')].find((el) =>
      el.textContent?.includes('Projects'),
    );
    await act(() => {
      row?.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
    });
    const ask = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Ask Bower about this'),
    );
    await act(() => {
      ask?.click();
    });
    expect(onAsk).toHaveBeenCalledWith({
      name: 'Projects',
      kind: 'folder',
      icon: {
        name: '1-Projects',
        mimeType: 'application/vnd.google-apps.folder',
        path: '1-Projects',
      },
    });
    await act(() => {
      render(null, overlays);
    });
    resetOverlayQueue();
    overlays.remove();
  });
});

describe('Tree ARIA and keyboard (R-EXP-9)', () => {
  it('is a tree of treeitems with level, expanded and selected', async () => {
    await mount();
    const tree = host.querySelector('[role="tree"]');
    expect(tree?.getAttribute('aria-label')).toBe('Your folders');
    const projects = link('1-Projects');
    expect(projects.getAttribute('role')).toBe('treeitem');
    expect(projects.getAttribute('aria-level')).toBe('1');
    expect(projects.getAttribute('aria-expanded')).toBe('false');
    expect(projects.getAttribute('aria-selected')).toBe('false');
    expect(projects.getAttribute('title')).toBe('Projects');
    expect(
      host.querySelectorAll('[role="treeitem"][tabindex="0"]'),
    ).toHaveLength(1);
  });

  it('Right expands then enters, Left goes to the parent then collapses', async () => {
    await mount();
    link('1-Projects').focus();
    await keydown(link('1-Projects'), 'ArrowRight');
    expect(link('1-Projects').getAttribute('aria-expanded')).toBe('true');
    await keydown(link('1-Projects'), 'ArrowRight');
    expect(document.activeElement).toBe(link('1-Projects/Flat hunt'));
    await keydown(link('1-Projects/Flat hunt'), 'ArrowLeft');
    expect(document.activeElement).toBe(link('1-Projects'));
    await keydown(link('1-Projects'), 'ArrowLeft');
    expect(link('1-Projects').getAttribute('aria-expanded')).toBe('false');
  });

  it('Up/Down, Home/End and type-ahead move focus', async () => {
    await mount();
    link('0-Inbox').focus();
    await keydown(link('0-Inbox'), 'ArrowDown');
    expect(document.activeElement).toBe(link('1-Projects'));
    await keydown(link('1-Projects'), 'End');
    expect(document.activeElement).toBe(link('4-Archives'));
    await keydown(link('4-Archives'), 'Home');
    expect(document.activeElement).toBe(link('0-Inbox'));
    await keydown(link('0-Inbox'), 'r');
    expect(document.activeElement).toBe(link('3-Resources'));
  });

  it('type-ahead finds the next name with that start, wrapping', () => {
    const names = ['Inbox', 'Projects', 'Areas', 'Resources', 'Archives'];
    expect(typeAheadIndex(names, 0, 'a')).toBe(2);
    expect(typeAheadIndex(names, 2, 'a')).toBe(4);
    expect(typeAheadIndex(names, 4, 'a')).toBe(2);
    expect(typeAheadIndex(names, 0, 'ar')).toBe(2);
    expect(typeAheadIndex(names, 1, 'z')).toBe(1);
  });

  it('a double click on a folder name toggles it', async () => {
    await mount();
    await act(() => {
      link('1-Projects').dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true }),
      );
    });
    expect(link('1-Projects').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Sidebar drag (R-SIDE-4)', () => {
  it('does not re-render the tree while the pointer moves', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const shell = document.createElement('div');
    shell.className = 'shell';
    document.body.append(shell);
    await act(() => {
      render(
        h(
          'div',
          { class: 'shell-sidebar' },
          h(Tree, { index: buildVaultIndex(files) }),
          h(SidebarSeparator, {}),
        ),
        shell,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const handle = shell.querySelector<HTMLElement>('[role="separator"]')!;
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.hasPointerCapture = () => true;
    const fire = (type: string, clientX: number): void => {
      const event = new MouseEvent(type, { clientX, bubbles: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      handle.dispatchEvent(event);
    };
    const before = state.renders;
    fire('pointerdown', 264);
    for (let x = 270; x <= 360; x += 10) {
      fire('pointermove', x);
      frames.splice(0).forEach((cb) => {
        cb(0);
      });
    }
    expect(shell.style.getPropertyValue('--sidebar-width')).toBe('360px');
    expect(state.renders).toBe(before);
    render(null, shell);
    shell.remove();
    vi.unstubAllGlobals();
  });
});
