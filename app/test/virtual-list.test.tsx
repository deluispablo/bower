// @vitest-environment jsdom

import { h, render } from 'preact';
import type { RefObject } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VirtualList } from '../src/components/virtual-list.js';
import type { VirtualListHandle } from '../src/components/virtual-list.js';

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
  act(() => {
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
    mount({ handleRef: handle as RefObject<VirtualListHandle> });
    act(() => handle.current?.scrollToIndex(500, { align: 'auto' }));
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
