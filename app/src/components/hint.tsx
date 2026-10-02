/**
 * The one look for tips, suggestions and state notes (spec §5 `hint.tsx`,
 * §6.14 R-HINT-1, D16). A `tip` explains, a `suggestion` invites (usually
 * with chips in `actions`), a `state` reports a mode the user is in and has
 * no dismiss button. Tips and suggestions are dismissed for good on this
 * device: the choice lives in `localStorage` under `bower:hint:<id>`.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

import { deleteFile } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { undoRequestNote } from '../move-request.js';
import { displayName } from '../navigation.js';
import { showToast } from '../toast-store.js';
import '../styles/hint.css';
import { BowerMark } from './bird.js';
import { IconClose } from './icons.js';
import { openAsk } from './send-to-bower.js';

export type HintVariant = 'tip' | 'suggestion' | 'state';

export interface HintProps {
  /** The dismissal key: stored as `bower:hint:<id>`. */
  id: string;
  variant: HintVariant;
  icon: JSX.Element;
  children: ComponentChildren;
  /** Chips or buttons shown under the text. */
  actions?: ComponentChildren;
  /** An extra class on the box (the file tip's own look). */
  class?: string;
}

/** The `localStorage` key that remembers a dismissed hint. */
export function hintStorageKey(id: string): string {
  return `bower:hint:${id}`;
}

export function isHintDismissed(id: string): boolean {
  try {
    return localStorage.getItem(hintStorageKey(id)) !== null;
  } catch (err) {
    console.error('Could not read a dismissed hint', err);
    return false;
  }
}

export function dismissHint(id: string): void {
  try {
    localStorage.setItem(hintStorageKey(id), '1');
  } catch (err) {
    console.error('Could not remember a dismissed hint', err);
  }
}

/** Forgets a dismissal ("Show again", R-HINT-4). */
export function restoreHint(id: string): void {
  try {
    localStorage.removeItem(hintStorageKey(id));
  } catch (err) {
    console.error('Could not restore a dismissed hint', err);
  }
}

/** Fired when a tip or suggestion appears or goes, so the others re-check
 * which one is first (R-HINT-3). */
const HINTS_CHANGED = 'bower:hints-changed';

/** True when no other tip or suggestion comes before `el` in the document. */
function isFirstHint(el: Element): boolean {
  const first = document.querySelector('.hint-tip, .hint-suggestion');
  return first === null || first === el;
}

export function Hint({
  id,
  variant,
  icon,
  children,
  actions,
  class: extra,
}: HintProps): JSX.Element | null {
  const dismissible = variant !== 'state';
  const [dismissed, setDismissed] = useState<boolean>(
    () => dismissible && isHintDismissed(id),
  );
  const root = useRef<HTMLDivElement>(null);
  // At most one tip or suggestion per screen: the first one in document
  // order shows, the others wait. State hints are exempt (R-HINT-3).
  const [waiting, setWaiting] = useState(false);
  useLayoutEffect(() => {
    if (!dismissible) return undefined;
    const check = (): void => {
      if (root.current !== null) setWaiting(!isFirstHint(root.current));
    };
    check();
    window.addEventListener(HINTS_CHANGED, check);
    window.dispatchEvent(new Event(HINTS_CHANGED));
    return () => {
      window.removeEventListener(HINTS_CHANGED, check);
      window.dispatchEvent(new Event(HINTS_CHANGED));
    };
  }, [dismissible, dismissed]);
  if (dismissed) return null;
  return (
    <div
      ref={root}
      hidden={waiting}
      class={`hint hint-${variant}${extra === undefined ? '' : ` ${extra}`}`}
      role={variant === 'state' ? 'status' : undefined}
    >
      <span class="hint-icon" aria-hidden="true">
        {icon}
      </span>
      <div class="hint-body">
        <p class="hint-text">{children}</p>
        {actions !== undefined && <div class="hint-actions">{actions}</div>}
      </div>
      {dismissible && (
        <button
          type="button"
          class="hint-dismiss"
          aria-label="Dismiss this tip"
          onClick={() => {
            dismissHint(id);
            setDismissed(true);
          }}
        >
          <IconClose />
        </button>
      )}
    </div>
  );
}

/** The file tip's button: what Ask opens prefilled with (S-FI-3). */
export const FILE_TIP_ASK = 'Summarise this and list what matters';

/** The file tip's dismissal key: remembered per file (spec §3.29). */
export function fileTipId(fileId: string): string {
  return `file-note:${fileId}`;
}

export interface FileTipProps {
  file: DriveFile;
  /** Bower filed it unchanged: the line says so. */
  filedAsItIs: boolean;
  /** A question about the file waits in the inbox: its request note's id
   * (`null` while the listing does not have it). Absent when none waits. */
  asked?: string | null;
  /** After Undo took the request note out of the inbox. */
  onUndone?: () => void;
}

/** The file tip's waiting state, once a question about the file is in the
 * inbox (#1003). */
export const FILE_TIP_WAITING = 'Bower answers at the next tidy-up.';

/**
 * The file tip (spec §3.29, R-HINT-1, boards FI-Main and FI-Bottom): the
 * bird 28, "Want a note on it?", and a button that opens Ask Bower about
 * the file prefilled with "Summarise this and list what matters"; the page
 * stays. ✕ ("Dismiss this tip") hides it for this file, for good on this device.
 * Once "Put in the inbox" sent a question about it, or one already waits,
 * it says "Bower answers at the next tidy-up." with Undo instead (#1003).
 */
export function FileTip({
  file,
  filedAsItIs,
  asked,
  onUndone,
}: FileTipProps): JSX.Element {
  // `undefined`: nothing sent from this tip; else the request note's id.
  const [sent, setSent] = useState<string | null | undefined>(undefined);
  // The request Undo took back, which the listing may still show a moment.
  const [undone, setUndone] = useState<string | null>(null);
  const waiting =
    sent !== undefined
      ? sent
      : asked !== undefined && (asked === null || asked !== undone)
        ? asked
        : undefined;

  async function undo(id: string): Promise<void> {
    const result = await undoRequestNote(deleteFile, id);
    if (result === 'failed') {
      showToast("Couldn't take that back. It is still in your inbox.");
      return;
    }
    setUndone(id);
    setSent(undefined);
    onUndone?.();
    showToast('Taken out of your inbox.');
  }

  if (waiting !== undefined) {
    return (
      <Hint
        key="asked"
        id={fileTipId(file.id)}
        variant="state"
        class="hint-file"
        icon={<BowerMark size={28} />}
        actions={
          <button
            type="button"
            class="btn btn-secondary btn-sm hint-file-undo"
            disabled={waiting === null}
            onClick={() => {
              if (waiting !== null) void undo(waiting);
            }}
          >
            Undo
          </button>
        }
      >
        {FILE_TIP_WAITING}
      </Hint>
    );
  }

  return (
    <Hint
      key="tip"
      id={fileTipId(file.id)}
      variant="tip"
      class="hint-file"
      icon={<BowerMark size={28} />}
      actions={
        <button
          type="button"
          class="btn btn-secondary btn-sm hint-file-ask"
          onClick={() => {
            openAsk(
              {
                name: displayName(file.name),
                kind: 'file',
                icon: {
                  name: file.name,
                  mimeType: file.mimeType,
                  path: file.path,
                },
                buildText: (value) => `About ${file.name}: ${value}`,
                onSent: (id) => setSent(id),
              },
              { prefill: FILE_TIP_ASK },
            );
          }}
        >
          {FILE_TIP_ASK}
        </button>
      }
    >
      <b>Want a note on it?</b>{' '}
      {filedAsItIs ? 'Bower filed this as it is. ' : ''}Ask for one.
    </Hint>
  );
}
