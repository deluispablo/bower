// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Tree } from '../src/components/tree.js';
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
  useNew: () => ({
    ids: state.newIds,
    isNew: (id: string) => state.newIds.has(id),
    newCountIn: (path: string) =>
      path === '1-Projects/Flat hunt' || path === '1-Projects'
        ? state.newIds.size
        : 0,
    markSeen: vi.fn(),
    markAllSeen: vi.fn(),
  }),
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

async function mount(props: { rootMeanings?: boolean } = {}): Promise<void> {
  await act(() => {
    render(h(Tree, { index: buildVaultIndex(files), ...props }), host);
  });
  await settle();
}

beforeEach(() => {
  state.saved = undefined;
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

describe('Tree v4', () => {
  it('shows the Inbox count even at 0, and no other folder at 0', async () => {
    await mount();
    const count = (path: string): string | undefined =>
      host.querySelector(`a[href="${folderHref(path)}"] .tree-count`)
        ?.textContent ?? undefined;
    expect(count('0-Inbox')).toBe('0');
    expect(count('2-Areas')).toBeUndefined();
  });

  it('shows the five landmarks with marks and meanings, a divider, then neutral folders', async () => {
    await mount({ rootMeanings: true });
    expect(topRows()).toEqual([
      'Inbox',
      'Projects',
      'Areas',
      'Resources',
      'Archives',
      'Answers',
      'Clippings',
    ]);
    const marks = [...host.querySelectorAll('.folder-mark')];
    expect(marks.map((m) => m.getAttribute('data-kind'))).toEqual([
      'inbox',
      'projects',
      'areas',
      'resources',
      'archives',
    ]);
    expect(marks[0]?.classList.contains('folder-mark-28')).toBe(true);
    expect(host.querySelector('.tree-meaning')?.textContent).toBe(
      'Waiting for the next tidy-up',
    );
    // Answers and Clippings: neutral folder icon, no tint.
    const neutral = [...host.querySelectorAll('.folder-icon')].map((n) =>
      n.getAttribute('data-tint'),
    );
    expect(neutral).toEqual([null, null]);
    // The divider sits between Archives and Answers.
    const items = [...host.querySelectorAll('.tree > li')];
    const at = items.findIndex((li) => li.classList.contains('tree-divider'));
    expect(items[at - 1]?.textContent).toContain('Archives');
    expect(items[at + 1]?.textContent).toContain('Answers');
  });

  it('uses 18 px marks and the short meaning on the desktop sidebar', async () => {
    await mount();
    expect(
      host.querySelector('.folder-mark')?.classList.contains('folder-mark-18'),
    ).toBe(true);
    const meanings = [...host.querySelectorAll('.tree-meaning')].map(
      (n) => n.textContent,
    );
    expect(meanings).toContain('Parts of life that go on');
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
    expect(
      host.querySelector(`a[href="${folderHref('1-Projects/Flat hunt')}"]`),
    ).not.toBeNull();
  });

  it('shows files as rows with their badge, sorted by title, and tints subfolders', async () => {
    state.saved = {
      expanded: ['1-Projects', '1-Projects/Flat hunt'],
      scroll: 0,
    };
    await mount();
    const flatIcon = host.querySelector(
      `a[href="${folderHref('1-Projects/Flat hunt')}"] .folder-icon`,
    );
    expect(flatIcon?.getAttribute('data-tint')).toBe('projects');
    const leaves = [
      ...host.querySelectorAll('[aria-level="3"] .tree-name'),
    ].map((n) => n.textContent);
    expect(leaves).toEqual(['Budget', 'Lease', 'Window sign']);
    const badges = [...host.querySelectorAll('.kind-badge')].map(
      (n) => n.textContent,
    );
    expect(badges).toEqual(['PDF', 'JPG']);
    expect(host.querySelector('a[href^="/file/"]')).not.toBeNull();
    expect(host.querySelector('a[href^="/note/"]')).not.toBeNull();
    // The folder's count equals its rows.
    expect(
      host.querySelector(
        `a[href="${folderHref('1-Projects/Flat hunt')}"] .tree-count`,
      )?.textContent,
    ).toBe('3');
  });

  it('restores expanded folders and saves a change', async () => {
    state.saved = { expanded: ['1-Projects'], scroll: 0 };
    await mount();
    expect(
      host.querySelector('button[aria-label="Collapse Projects"]'),
    ).not.toBeNull();
    await act(() =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Expand Areas"]')
        ?.click(),
    );
    expect([...(state.saved?.expanded ?? [])].sort()).toEqual([
      '1-Projects',
      '2-Areas',
    ]);
  });

  it('tags new rows and the folder holding them', async () => {
    const index = buildVaultIndex(files);
    state.newIds = new Set([
      index.byPath.get('1-Projects/Flat hunt/Lease.pdf')?.id ?? '',
    ]);
    state.saved = {
      expanded: ['1-Projects', '1-Projects/Flat hunt'],
      scroll: 0,
    };
    await act(() => {
      render(h(Tree, { index }), host);
    });
    await settle();
    expect(host.querySelector('[aria-expanded="true"]')).not.toBeNull();
    const tags = [...host.querySelectorAll('.new-tag')].map(
      (n) => n.textContent,
    );
    expect(tags).toContain('New');
    expect(tags).toContain('1 new');
  });
});
