/**
 * The destructive confirmation (#907, spec §3.39, R-CONFIRM-1): one
 * question before something is removed for good. A phone action-style
 * sheet (title, one sentence, the red button, Cancel) and, from 900 px, the
 * centred dialog 400 wide with the buttons right-aligned. Focus starts on
 * Cancel, so Enter never destroys anything by accident.
 *
 * Callers open it with `<Confirm action=… />` where the action happens
 * (Settings, a rule, a pile); it queues like every other overlay.
 */

import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import { Overlay } from './overlay.js';
import { Queued } from './queued-overlay.js';

import '../styles/confirm.css';

export type ConfirmAction =
  | 'removePile'
  | 'removeRule'
  | 'clearKey'
  | 'signOutEverywhere'
  | 'deleteAccount';

export interface ConfirmCopy {
  title: string;
  sentence: string;
  confirm: string;
}

/** The five strings of spec §3.39; a pile's count comes from the caller. */
export function confirmCopy(action: ConfirmAction, count = 2): ConfirmCopy {
  switch (action) {
    case 'removePile':
      return {
        title: 'Remove this pile?',
        sentence: `Its ${count} ${count === 1 ? 'thing leaves' : 'things leave'} your inbox. Nothing else changes.`,
        confirm: 'Remove the pile',
      };
    case 'removeRule':
      return {
        title: 'Remove this rule?',
        sentence: 'Nothing already filed moves.',
        confirm: 'Remove the rule',
      };
    case 'clearKey':
      return {
        title: 'Remove your Claude key?',
        sentence: 'Bower goes back to running on its own plan.',
        confirm: 'Remove the key',
      };
    case 'signOutEverywhere':
      return {
        title: 'Sign out everywhere?',
        sentence:
          'Every browser and device signed in to this account is signed out.',
        confirm: 'Sign out everywhere',
      };
    case 'deleteAccount':
      return {
        title: 'Delete your Bower account?',
        sentence:
          'Your Bower folder in Drive stays, with everything in it. Bower forgets you.',
        confirm: 'Delete my account',
      };
  }
}

export interface ConfirmProps {
  action: ConfirmAction;
  /** How many things a pile holds (`removePile` only). */
  count?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const TITLE_ID = 'confirm-title';

export function Confirm({
  action,
  count,
  onConfirm,
  onCancel,
}: ConfirmProps): JSX.Element {
  const copy = confirmCopy(action, count);
  const cancel = useRef<HTMLButtonElement>(null);

  // The trap focuses the first control when it opens; Cancel wins after it.
  useEffect(() => {
    queueMicrotask(() => cancel.current?.focus());
  }, []);

  return (
    <Queued id="confirm" priority={OVERLAY_PRIORITY.own}>
      <Overlay kind="dialog" labelledBy={TITLE_ID} onClose={onCancel}>
        <div class="overlay-body confirm">
          <h2 id={TITLE_ID} class="confirm-title">
            {copy.title}
          </h2>
          <p id="confirm-sentence" class="confirm-sentence">
            {copy.sentence}
          </p>
          <div class="confirm-actions">
            <button
              ref={cancel}
              type="button"
              class="btn btn-secondary confirm-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn confirm-danger"
              onClick={() => {
                onCancel();
                onConfirm();
              }}
            >
              {copy.confirm}
            </button>
          </div>
        </div>
      </Overlay>
    </Queued>
  );
}
