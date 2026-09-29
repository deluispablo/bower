/**
 * The switcher's always-mounted part (#834): the "/" shortcut and the record
 * of every note or file opened. The panel itself (`switcher.tsx`, the largest
 * component) loads on first use and is fetched when the browser is idle, so
 * it opens without a flash.
 */

import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { lazyOverlay } from '../lazy-overlay.js';
import {
  openSwitcher,
  recordOpened,
  useSwitcherOpen,
} from '../switcher-store.js';

const LazySwitcher = lazyOverlay(() =>
  import('./switcher.js').then((m) => m.Switcher),
);

/** Fetches the panel's code ahead of the first open. */
export const preloadSwitcher = LazySwitcher.preload;

/** Notes and files open on this device, most recent first: `/note/:id`, `/file/:id`. */
function openedIdOf(location: string | undefined): string | null {
  if (location === undefined) return null;
  const match = /^\/(?:note|file)\/([^/?#]+)/.exec(location);
  if (match?.[1] === undefined) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function SwitcherHost(): JSX.Element | null {
  const { open } = useSwitcherOpen();
  const { path } = useLocation();

  // "/" opens search from anywhere that is not a text field (R-DESK-4);
  // Ctrl/Cmd+K is `app.tsx`'s.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (open) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      openSwitcher();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Mounted for the whole session, so this sees every note or file opened.
  useEffect(() => {
    const id = openedIdOf(path);
    if (id !== null) recordOpened(id);
  }, [path]);

  return open ? <LazySwitcher.Component /> : null;
}
