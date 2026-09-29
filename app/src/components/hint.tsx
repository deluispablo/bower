/**
 * The one look for tips, suggestions and state notes (spec §5 `hint.tsx`,
 * §6.14 R-HINT-1, D16). A `tip` explains, a `suggestion` invites (usually
 * with chips in `actions`), a `state` reports a mode the user is in and has
 * no dismiss button. Tips and suggestions are dismissed for good on this
 * device: the choice lives in `localStorage` under `bower:hint:<id>`.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';

import '../styles/hint.css';
import { IconClose } from './icons.js';

export type HintVariant = 'tip' | 'suggestion' | 'state';

export interface HintProps {
  /** The dismissal key: stored as `bower:hint:<id>`. */
  id: string;
  variant: HintVariant;
  icon: JSX.Element;
  children: ComponentChildren;
  /** Chips or buttons shown under the text. */
  actions?: ComponentChildren;
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

export function Hint({
  id,
  variant,
  icon,
  children,
  actions,
}: HintProps): JSX.Element | null {
  const dismissible = variant !== 'state';
  const [dismissed, setDismissed] = useState<boolean>(
    () => dismissible && isHintDismissed(id),
  );
  if (dismissed) return null;
  return (
    <div
      class={`hint hint-${variant}`}
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
