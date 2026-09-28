/**
 * A small Preact adapter over TanStack Virtual's headless core (#590, D3):
 * renders only the rows in view plus an overscan, inside the nearest
 * scrolling ancestor (or the window when the page itself scrolls, as on the
 * phone). The tree uses it past a row threshold; the folder list adopts it
 * next (#611).
 *
 * Each row is a positioned wrapper (`rowAs`, an `li` inside a `ul`) that
 * carries the row's own attributes from `rowProps`, so the list keeps its
 * roles. `keepIndex` is the row that must stay in the DOM whatever the
 * scroll offset (the roving-tabindex row); `scrollToIndex` and `handleRef`
 * bring a row into view, for reveal (#591) and for keyboard focus.
 */

import {
  Virtualizer,
  defaultRangeExtractor,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  observeWindowOffset,
  observeWindowRect,
  windowScroll,
} from '@tanstack/virtual-core';
import type { Range, VirtualItem } from '@tanstack/virtual-core';
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export interface VirtualListHandle {
  /** Scrolls the row into view (nearest edge), rendering it first. */
  scrollToIndex: (index: number, options?: { align?: 'auto' }) => void;
}

export interface VirtualListProps<T> {
  items: readonly T[];
  /** The row's height before it has been measured, in px. */
  estimateSize: (index: number) => number;
  renderRow: (item: T, index: number) => ComponentChildren;
  /** Rows rendered beyond the viewport on each side (8 when left out). */
  overscan?: number;
  /** Scrolls to this row whenever it changes (`align: 'auto'`). */
  scrollToIndex?: number;
  /** A row that stays rendered even when scrolled out of range. */
  keepIndex?: number;
  /** Space between rows, in px. */
  gap?: number;
  /** A stable key per row; the index when left out. */
  getKey?: (item: T, index: number) => string | number;
  /** Attributes for a row's wrapper (role, aria-level, class...). */
  rowProps?: (item: T, index: number) => JSX.HTMLAttributes<HTMLElement>;
  as?: 'div' | 'ul';
  rowAs?: 'div' | 'li';
  class?: string;
  role?: string;
  'aria-label'?: string;
  /** Receives the imperative handle while mounted. */
  handleRef?: { current: VirtualListHandle | null };
}

/** The slice of the core this adapter uses, for an element or the window. */
interface Engine {
  getVirtualItems: () => VirtualItem[];
  getTotalSize: () => number;
  scrollToIndex: (index: number, options?: { align?: 'auto' }) => void;
  measureElement: (node: Element | null) => void;
  /** Pushes the props that change between renders. */
  update: (next: {
    count: number;
    overscan: number;
    gap: number;
    scrollMargin: number;
  }) => void;
  willUpdate: () => void;
  scrollMargin: () => number;
  destroy: () => void;
}

function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/** How far the list's top sits below the scroll area's own top. */
function marginOf(list: HTMLElement, parent: HTMLElement | null): number {
  const top = list.getBoundingClientRect().top;
  if (parent === null) return top + window.scrollY;
  return top - parent.getBoundingClientRect().top + parent.scrollTop;
}

interface Live<T> {
  items: readonly T[];
  keepIndex: number | undefined;
  getKey: ((item: T, index: number) => string | number) | undefined;
  estimateSize: (index: number) => number;
}

function createEngine<T>(
  list: HTMLElement,
  live: { current: Live<T> },
  first: { overscan: number; gap: number },
  onChange: () => void,
): Engine {
  const parent = scrollParentOf(list);
  const shared = {
    count: live.current.items.length,
    estimateSize: (i: number): number => live.current.estimateSize(i),
    overscan: first.overscan,
    gap: first.gap,
    scrollMargin: marginOf(list, parent),
    getItemKey: (i: number): string | number => {
      const { items, getKey } = live.current;
      const item = items[i];
      return getKey !== undefined && item !== undefined ? getKey(item, i) : i;
    },
    rangeExtractor: (range: Range): number[] => {
      const base = defaultRangeExtractor(range);
      const keep = live.current.keepIndex;
      if (keep === undefined || keep < 0 || keep >= range.count) return base;
      return base.includes(keep) ? base : [...base, keep].sort((a, b) => a - b);
    },
    onChange,
  };
  const virtualizer =
    parent === null
      ? new Virtualizer<Window, HTMLElement>({
          ...shared,
          getScrollElement: () => window,
          scrollToFn: windowScroll,
          observeElementRect: observeWindowRect,
          observeElementOffset: observeWindowOffset,
          initialRect: { width: window.innerWidth, height: window.innerHeight },
        })
      : new Virtualizer<HTMLElement, HTMLElement>({
          ...shared,
          getScrollElement: () => parent,
          scrollToFn: elementScroll,
          observeElementRect,
          observeElementOffset,
        });
  const stop = virtualizer._didMount();
  virtualizer._willUpdate();
  return {
    getVirtualItems: () => virtualizer.getVirtualItems(),
    getTotalSize: () => virtualizer.getTotalSize(),
    scrollToIndex: (index, options) => virtualizer.scrollToIndex(index, options),
    measureElement: (node) => virtualizer.measureElement(node),
    update: (next) =>
      virtualizer.setOptions({ ...virtualizer.options, ...next }),
    willUpdate: () => virtualizer._willUpdate(),
    scrollMargin: () => virtualizer.options.scrollMargin,
    destroy: stop,
  };
}

export function VirtualList<T>(props: VirtualListProps<T>): JSX.Element {
  const {
    items,
    estimateSize,
    renderRow,
    overscan = 8,
    scrollToIndex,
    keepIndex,
    gap = 0,
    getKey,
    rowProps,
    as: Outer = 'div',
    rowAs: Row = 'div',
    handleRef,
  } = props;
  const listRef = useRef<HTMLElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const [, redraw] = useState(0);
  // Read by the engine's callbacks, which outlive a render.
  const live = useRef<Live<T>>({ keepIndex, items, getKey, estimateSize });
  live.current = { keepIndex, items, getKey, estimateSize };

  // Built once the list is in the DOM, when its scroll parent can be found.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) return;
    const engine = createEngine(list, live, { overscan, gap }, () =>
      redraw((n) => n + 1),
    );
    engineRef.current = engine;
    redraw((n) => n + 1);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // The engine is built once per mount; later props reach it below.
  }, []);

  // Count, spacing and offset follow every render.
  const engine = engineRef.current;
  if (engine !== null && listRef.current !== null) {
    engine.update({
      count: items.length,
      overscan,
      gap,
      scrollMargin: marginOf(listRef.current, scrollParentOf(listRef.current)),
    });
  }
  useEffect(() => {
    engineRef.current?.willUpdate();
  });

  useEffect(() => {
    if (handleRef === undefined) return;
    handleRef.current = {
      scrollToIndex: (index, options) =>
        engineRef.current?.scrollToIndex(index, { align: 'auto', ...options }),
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  useEffect(() => {
    if (scrollToIndex === undefined) return;
    engineRef.current?.scrollToIndex(scrollToIndex, { align: 'auto' });
  }, [scrollToIndex]);

  const virtualItems = engine?.getVirtualItems() ?? [];
  const total = engine?.getTotalSize() ?? 0;
  const margin = engine?.scrollMargin() ?? 0;

  return (
    <Outer
      ref={listRef as never}
      class={props.class}
      role={props.role}
      aria-label={props['aria-label']}
      style={{ position: 'relative', height: `${total}px` }}
    >
      {virtualItems.map((row) => {
        const item = items[row.index];
        if (item === undefined) return null;
        const extra = rowProps?.(item, row.index) ?? {};
        return (
          <Row
            {...(extra as object)}
            key={row.key}
            data-index={row.index}
            ref={
              ((node: HTMLElement | null) =>
                engineRef.current?.measureElement(node)) as never
            }
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start - margin}px)`,
            }}
          >
            {renderRow(item, row.index)}
          </Row>
        );
      })}
    </Outer>
  );
}
