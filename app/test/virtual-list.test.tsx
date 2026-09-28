// @vitest-environment jsdom

import { h, render } from 'preact';
import type { RefObject } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Tree } from '../src/components/tree.js';
import { VirtualList } from '../src/components/virtual-list.js';
import type { VirtualListHandle } from '../src/components/virtual-list.js';
import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { buildVaultIndex } from '../src/vault-index.js';

const saved = vi.hoisted(() => ({
  state: undefined as { expanded: string[]; scroll: number } | undefined,
}));

vi.mock('../src/cache.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/cache.js')>()),
  loadTreeState: () => Promise.resolve(saved.state),
  saveTreeState: () => Promise.resolve(),
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
    ids: new Set<string>(),
    isNew: () => false,
    newCountIn: () => 0,
    markSeen: vi.fn(),
    markAllSeen: vi.fn(),
  }),
}));

const ROW = 40;
const VIEWPORT = 200;

let host: HTMLDivElement;

// jsdom has no layout: the scroll area is 200 px tall, a row 40 px.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.dataset.scroller !== undefined ? VIEWPORT : ROW;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.dataset.scroller !== undefined) {
        return new DOMRect(0, 0, 300, VIEWPORT);
      }
      // The list sits at the top of the scroll area, so it moves up as it
      // scrolls; a row is one row tall.
      if (this.dataset.index !== undefined) return new DOMRect(0, 0, 300, ROW);
      return new DOMRect(0, -host.scrollTop, 300, 1000 * ROW);
    },
  );
  host = document.createElement('div');
  host.dataset.scroller = '';
  host.style.overflowY = 'auto';
  // Nor does it scroll: keep the offset by hand.
  let top = 0;
  Object.defineProperty(host, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  Object.defineProperty(host, 'scrollHeight', { value: 1000 * ROW });
  host.scrollTo = ((options: ScrollToOptions) => {
    top = options.top ?? 0;
  }) as typeof host.scrollTo;
  document.body.appendChild(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  vi.restoreAllMocks();
});

const items = Array.from({ length: 1000 }, (_, i) => `Row ${i}`);

function mount(props: {
  scrollToIndex?: number;
  keepIndex?: number;
  handleRef?: RefObject<VirtualListHandle>;
}): void {
  void act(() => {
    render(
      h(VirtualList<string>, {
        items,
        estimateSize: () => ROW,
        renderRow: (item: string) => h('span', null, item),
        overscan: 2,
        as: 'ul',
        rowAs: 'li',
        role: 'list',
        ...props,
      }),
      host,
    );
  });
}

/** Lets the core's scroll handler and the re-render settle. */
async function scrolled(top?: number): Promise<void> {
  await act(async () => {
    if (top !== undefined) host.scrollTop = top;
    host.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

function rendered(): string[] {
  return [...host.querySelectorAll('li')].map((li) => li.textContent ?? '');
}

describe('VirtualList', () => {
  it('renders only the rows in view plus the overscan', () => {
    mount({});
    const rows = rendered();
    // 200 px / 40 px = 5 rows in view, plus 2 of overscan below.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(rows[0]).toBe('Row 0');
    expect(rows).not.toContain('Row 500');
    const list = host.querySelector('ul');
    expect(list?.style.height).toBe(`${1000 * ROW}px`);
  });

  it('scrolls to an index through the handle', async () => {
    const handle: { current: VirtualListHandle | null } = { current: null };
    mount({ handleRef: handle });
    void act(() => handle.current?.scrollToIndex(500, { align: 'auto' }));
    expect(host.scrollTop).toBeGreaterThan(0);
    await scrolled();
    expect(rendered()).toContain('Row 500');
    expect(rendered().length).toBeLessThanOrEqual(10);
  });

  it('scrolls to the scrollToIndex prop when it changes', async () => {
    mount({ scrollToIndex: 300 });
    await scrolled();
    expect(rendered()).toContain('Row 300');
  });

  it('keeps the kept row in the DOM when it is scrolled far away', async () => {
    mount({ keepIndex: 0 });
    await scrolled(20_000);
    const rows = rendered();
    expect(rows[0]).toBe('Row 0');
    expect(rows).toContain('Row 500');
  });
});

function folderWith(notes: number): DriveFile[] {
  const dir: DriveFile = {
    id: 'dir',
    name: '1-Projects',
    mimeType: FOLDER_MIME,
    parents: ['PARENT'],
    path: '1-Projects',
  };
  const list = Array.from({ length: notes }, (_, i): DriveFile => ({
    id: `n${i}`,
    name: `Note ${String(i).padStart(4, '0')}.md`,
    mimeType: 'text/markdown',
    parents: ['dir'],
    path: `1-Projects/Note ${String(i).padStart(4, '0')}.md`,
  }));
  return [dir, ...list];
}

async function mountTree(notes: number): Promise<void> {
  saved.state = { expanded: ['1-Projects'], scroll: 0 };
  await act(async () => {
    render(h(Tree, { index: buildVaultIndex(folderWith(notes)) }), host);
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe('Tree over VirtualList', () => {
  it('renders every row, plainly, up to 150 visible rows', async () => {
    await mountTree(149);
    // The folder row and its 149 notes: 150 rows, all in the DOM.
    expect(host.querySelectorAll('[role="treeitem"]')).toHaveLength(150);
    expect(host.querySelector('[data-index]')).toBeNull();
    expect(host.querySelector('ul.tree')?.getAttribute('style')).toBeNull();
  });

  it('renders only the rows in view past 150 visible rows', async () => {
    await mountTree(400);
    const items = host.querySelectorAll('[role="treeitem"]');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(60);
    expect(
      host.querySelector('[data-index="0"]')?.getAttribute('aria-level'),
    ).toBe('1');
    // The roving tab stop is rendered: the first row.
    expect(host.querySelector('a[tabindex="0"]')).not.toBeNull();
  });
});
