/**
 * The one list row (issue #908, spec §3.17 R-ROW-1 to R-ROW-4, canon K-12,
 * boards PF-Main-375 and LI-Main-1280): a 32 px neutral box holding a 20 px
 * FileIcon, the title up to two lines, the meta line in 13 px that wraps,
 * and a trailing part (a date, a count, a chevron) aligned with the first
 * title line. No dividers; the page never scrolls sideways at 375.
 *
 * Selection (K-19, G-5): with `onSelect` the row is part of a selection
 * (the desktop beside the preview column): one click or focus selects,
 * double click or Enter opens, hover never selects. Without it a click
 * follows the row's link (the phone). Up and Down move the focus to the
 * row above or below in the same list.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { MetaLine } from '../meta-line.js';
import type { ParaKind } from '../navigation.js';
import { FileIcon } from './file-icon.js';
import type { FileIconItem } from './file-icon.js';

import '../styles/list-row.css';

/** What a row shows of an item: FileIcon's input plus its title and link. */
export interface ListRowItem extends FileIconItem {
  /** Stable key; also the `data-row-key` the list's key handling reads. */
  id: string;
  /** Plain text, or marked-up text (Search marks the matched words). */
  title: string | ComponentChildren;
  /** Where the row opens; without it the row is a focusable group. */
  href?: string;
}

export interface ListRowProps {
  item: ListRowItem;
  /** The line under the title (`metaLine(...)` or its text). */
  meta?: MetaLine | string;
  /** Right-hand part: a `<time>` (R-META-3), a count, a chevron. */
  trailing?: ComponentChildren;
  /** A Badge after the title ("New", board AR-Main). */
  badge?: ComponentChildren;
  selected?: boolean;
  /** Present when the row takes part in a selection (desktop). */
  onSelect?: () => void;
  /** Opens the row (Enter, double click); default: follow `href`. */
  onOpen?: () => void;
  /** A mixed list's "where": the parent after a root dot ("· ● Areas"). */
  where?: { name: string; root: ParaKind | null };
  /** Extra attributes for the row element (long press, data hooks). */
  rowProps?: Record<string, unknown>;
  /**
   * The row takes the focus and moves it with the arrows (default). Off
   * in a listbox whose focus stays in a field (Search's combobox,
   * `aria-activedescendant`): the row is not a tab stop and leaves the
   * keys to the field.
   */
  roving?: boolean;
}

/** Each row's own number, for its title and meta ids. */
let nextRowId = 0;

/** The rows or tiles of the list that holds `from`, in order. */
function peers(from: HTMLElement, selector: string): HTMLElement[] {
  const list = from.closest('ul, ol, [role="list"], [role="listbox"]');
  if (list === null) return [from];
  return Array.from(list.querySelectorAll<HTMLElement>(selector));
}

/**
 * Moves the focus from `from` by `delta` among its list's `selector`
 * elements; true when the key was used. Shared by rows (±1) and tiles
 * (±1 across, ±columns down).
 */
export function moveFocus(
  from: HTMLElement,
  selector: string,
  delta: number,
): boolean {
  const all = peers(from, selector);
  const at = all.indexOf(from);
  if (at < 0) return false;
  const next = all[Math.min(all.length - 1, Math.max(0, at + delta))];
  if (next === undefined || next === from) return true;
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
  return true;
}

/** Enter opens; the arrows move. `columns` is 1 for a list. */
export function selectionKeys(
  event: KeyboardEvent,
  selector: string,
  columns: number,
  open: (() => void) | undefined,
): void {
  if (event.defaultPrevented) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const element = event.currentTarget;
  if (!(element instanceof HTMLElement)) return;
  let used = false;
  if (event.key === 'Enter' && open !== undefined) {
    open();
    used = true;
  } else if (event.key === 'ArrowDown') {
    used = moveFocus(element, selector, columns);
  } else if (event.key === 'ArrowUp') {
    used = moveFocus(element, selector, -columns);
  } else if (event.key === 'ArrowRight' && columns > 1) {
    used = moveFocus(element, selector, 1);
  } else if (event.key === 'ArrowLeft' && columns > 1) {
    used = moveFocus(element, selector, -1);
  }
  if (used) event.preventDefault();
}

/** Follows a link the way a click would, for a double click or Enter. */
export function follow(href: string | undefined): void {
  if (href === undefined) return;
  window.location.assign(href);
}

function markPointer(event: Event): void {
  const element = event.currentTarget;
  if (element instanceof HTMLElement) element.dataset.pointer = 'true';
}

function clearPointer(event: Event): void {
  const element = event.currentTarget;
  if (element instanceof HTMLElement) delete element.dataset.pointer;
}

/**
 * Marks a row, tile or card that was focused by the mouse or a finger, so
 * the CSS draws the focus ring only for keyboard focus (G-4: no focus box
 * over a selection made with the mouse). A key press or leaving the element
 * clears the mark, so the keyboard ring stays.
 */
export const pointerFocus = {
  onPointerDownCapture: markPointer,
  onKeyDownCapture: clearPointer,
  onBlurCapture: clearPointer,
};

/** The element's classes: its own, the caller's extra one, the selection. */
export function classes(
  own: string,
  extra: unknown,
  selected: boolean,
): string {
  const parts = [own];
  if (typeof extra === 'string' && extra !== '') parts.push(extra);
  if (selected) parts.push('is-selected');
  return parts.join(' ');
}

function call(handler: unknown, event: Event): void {
  if (typeof handler === 'function') (handler as (e: Event) => void)(event);
}

function MetaText({
  meta,
  where,
}: {
  meta: MetaLine | string | undefined;
  where: ListRowProps['where'];
}): JSX.Element | null {
  const parts: ComponentChildren[] = [];
  if (typeof meta === 'string') {
    if (meta !== '') parts.push(meta);
  } else if (meta !== undefined) {
    meta.parts.forEach((part, at) => {
      if (at > 0) parts.push(' · ');
      if (meta.dot !== null && meta.dot.at === at) {
        parts.push(
          <span
            class="list-row-dot"
            data-root={meta.dot.root ?? 'none'}
            aria-hidden="true"
          />,
        );
      }
      parts.push(part);
    });
  }
  if (where !== undefined) {
    if (parts.length > 0) parts.push(' · ');
    parts.push(
      <span
        class="list-row-dot"
        data-root={where.root ?? 'none'}
        aria-hidden="true"
      />,
      where.name,
    );
  }
  return parts.length === 0 ? null : <>{parts}</>;
}

export function ListRow({
  item,
  meta,
  trailing,
  badge,
  selected = false,
  onSelect,
  onOpen,
  where,
  rowProps = {},
  roving = true,
}: ListRowProps): JSX.Element {
  // A counter, not `useId`: rows rendered in an overlay's own root (Search)
  // got the same `useId` values as the page's rows, so `aria-labelledby`
  // named a Search row after a row behind it.
  const [uid] = useState(() => (nextRowId += 1));
  const titleId = `list-row-${uid}-title`;
  const metaId = `list-row-${uid}-meta`;
  const open =
    onOpen ?? (item.href === undefined ? undefined : () => follow(item.href));
  const metaText = <MetaText meta={meta} where={where} />;
  const hasMeta =
    (typeof meta === 'string' ? meta !== '' : (meta?.parts.length ?? 0) > 0) ||
    where !== undefined;

  const handlers = {
    onClick: (event: MouseEvent): void => {
      call(rowProps.onClick, event);
      if (event.defaultPrevented) return;
      if (onSelect !== undefined) {
        // Desktop: one click selects; the link opens on a double click.
        event.preventDefault();
        // The router follows links on its own; keep this click from it.
        event.stopPropagation();
        onSelect();
      }
    },
    onDblClick: (event: MouseEvent): void => {
      call(rowProps.onDblClick, event);
      if (event.defaultPrevented || onSelect === undefined) return;
      event.preventDefault();
      open?.();
    },
    onFocus: (event: FocusEvent): void => {
      call(rowProps.onFocus, event);
      onSelect?.();
    },
    onKeyDown: (event: KeyboardEvent): void => {
      call(rowProps.onKeyDown, event);
      if (!roving) return;
      selectionKeys(
        event,
        '.list-row',
        1,
        onSelect === undefined ? onOpen : open,
      );
    },
  };
  const common = {
    ...rowProps,
    ...handlers,
    ...pointerFocus,
    class: classes('list-row', rowProps.class, selected),
    'data-row-key': rowProps['data-row-key'] ?? item.id,
    'data-selected': selected ? 'true' : undefined,
    // A row that can be selected is an option of its listbox, announced as
    // selected (spec 3.17); a plain row keeps `aria-current`.
    ...(onSelect === undefined
      ? { 'aria-current': selected ? ('true' as const) : undefined }
      : { role: 'option' as const, 'aria-selected': selected }),
    'aria-labelledby': titleId,
    'aria-describedby': hasMeta ? metaId : undefined,
    ...(!roving && { tabIndex: -1 }),
  };
  const body = (
    <>
      <FileIcon item={item} size={20} box />
      <span class="list-row-text">
        <span class="list-row-head">
          <span class="list-row-title" id={titleId}>
            {item.title}
          </span>
          {badge !== undefined && badge !== null && (
            <span class="list-row-badge">{badge}</span>
          )}
        </span>
        {hasMeta && (
          <span class="list-row-meta" id={metaId}>
            {metaText}
          </span>
        )}
      </span>
      {trailing !== undefined && trailing !== null && (
        <span class="list-row-trailing">{trailing}</span>
      )}
    </>
  );
  return item.href === undefined ? (
    <div tabIndex={0} role="group" {...common}>
      {body}
    </div>
  ) : (
    <a {...common} href={item.href}>
      {body}
    </a>
  );
}
