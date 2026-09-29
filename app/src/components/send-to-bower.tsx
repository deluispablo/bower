/**
 * The one sheet for everything sent to Bower (R-ASK-1, spec §6.13, boards
 * Rename-*, Ask-*): Rename, Move, "Ask Bower about it/this" and a tapped
 * suggestion chip all open it. Title and subtitle, the one field, the
 * "It waits in your inbox" box, "Put in the inbox" and the text button
 * "Just this, now" with its cost line. It writes one instruction note
 * (`writeRequestNote`); nothing is sent until a button is pressed.
 *
 * Open it with `openSendToBower`; it lives on the Overlay queue.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { deleteFile, createTextFile } from '../drive.js';
import { undoRequestNote, writeRequestNote } from '../move-request.js';
import { close, open, OVERLAY_PRIORITY } from '../overlay-queue.js';
import { RUN_NOW_LABEL, RUN_NOW_LINE, useRunNow } from '../run-now.js';
import { useSession } from '../session.js';
import { showToast } from '../toast-store.js';
import { useVault } from '../vault-store.js';
import { FolderMark } from './folder-mark.js';
import type { ParaKind } from './folder-mark.js';
import { IconClose, IconInbox } from './icons.js';
import { Overlay } from './overlay.js';

import '../styles/send-to-bower.css';

export const SEND_TO_BOWER_ID = 'send-to-bower';

export interface SendToBowerProps {
  /** `rename` asks for a new name, `ask` for a question. */
  mode: 'rename' | 'ask';
  /** What it is about: "About {mark} Applications". */
  about: string;
  aboutKind?: ParaKind;
  /** The field's starting text (a chip's text, the current name). */
  initialText?: string;
  /** A locked extension shown after the rename field. */
  extension?: string;
  /** The words of the request note for what is in the field. */
  buildText: (value: string) => string;
  onClose: () => void;
}

const COPY = {
  rename: {
    title: 'Rename',
    sub: 'Bower renames it and updates every link to it.',
    label: 'New name',
    when: 'Bower renames it at the next tidy-up; until then it keeps its name.',
  },
  ask: {
    title: 'Ask Bower',
    sub: null,
    label: 'Your question',
    when: 'Bower answers at the next tidy-up and puts the answer in {about}.',
  },
} as const;

export function SendToBower({
  mode,
  about,
  aboutKind,
  initialText = '',
  extension,
  buildText,
  onClose,
}: SendToBowerProps): JSX.Element {
  const copy = COPY[mode];
  const { me } = useSession();
  const { refresh } = useVault();
  const runNow = useRunNow();
  const [value, setValue] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;
  const empty = value.trim() === '';

  useEffect(() => {
    field.current?.focus();
  }, []);

  async function undo(id: string): Promise<void> {
    const result = await undoRequestNote(deleteFile, id);
    if (result === 'failed') {
      showToast("Couldn't take that back. It is still in your inbox.");
      return;
    }
    void refresh();
    showToast('Taken out of your inbox.');
  }

  async function send(when: 'later' | 'now'): Promise<void> {
    if (inboxFolderId === null || empty) {
      setError('Could not send that. Try again.');
      return;
    }
    setBusy(true);
    setError(null);
    let id: string | null;
    try {
      id = await writeRequestNote(
        { createTextFile },
        { inboxFolderId, text: buildText(value.trim()), now: new Date() },
      );
    } catch (err) {
      console.error(err);
      setBusy(false);
      setError('Could not send that. Try again.');
      return;
    }
    void refresh();
    if (when === 'later') {
      showToast(
        mode === 'ask'
          ? 'In your inbox. Bower answers at the next tidy-up.'
          : 'In your inbox. Bower renames it at the next tidy-up.',
        undefined,
        id === null
          ? undefined
          : { label: 'Undo', run: () => void undo(id as string) },
      );
      onClose();
      return;
    }
    // The note is written already, so nothing is left to wait for.
    const started = await runNow.run();
    showToast(
      started
        ? 'Bower is on it now.'
        : "Couldn't start Bower now. Your request goes with the next tidy-up.",
    );
    onClose();
  }

  const fieldProps = {
    id: 'send-to-bower-field',
    ref: field,
    value,
    'aria-label': copy.label,
    onInput: (event: JSX.TargetedEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue(event.currentTarget.value),
  };

  return (
    <Overlay kind="sheet" labelledBy="send-to-bower-title" onClose={onClose}>
      <div class="send-to-bower">
        <header class="send-to-bower-head">
          <div>
            <h2 id="send-to-bower-title" class="send-to-bower-title">
              {copy.title}
            </h2>
            <p class="send-to-bower-sub">
              {aboutKind !== undefined && (
                <FolderMark kind={aboutKind} size={18} />
              )}
              {copy.sub ?? `About ${about}`}
            </p>
          </div>
          <button
            type="button"
            class="send-to-bower-close"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>
        <label class="send-to-bower-label" htmlFor="send-to-bower-field">
          {copy.label}
        </label>
        <div class="send-to-bower-field">
          {mode === 'rename' ? (
            <>
              <input type="text" class="send-to-bower-input" {...fieldProps} />
              {extension !== undefined && (
                <span class="send-to-bower-ext">{extension}</span>
              )}
            </>
          ) : (
            <textarea class="send-to-bower-input" rows={3} {...fieldProps} />
          )}
        </div>
        <div class="send-to-bower-box">
          <span class="send-to-bower-box-icon" aria-hidden="true">
            <IconInbox />
          </span>
          <div>
            <p class="send-to-bower-box-title">It waits in your inbox</p>
            <p class="send-to-bower-box-text">
              {copy.when.replace('{about}', about)}
            </p>
          </div>
        </div>
        {error !== null && (
          <p class="send-to-bower-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          class="button send-to-bower-primary"
          disabled={busy || empty}
          onClick={() => void send('later')}
        >
          <IconInbox /> Put in the inbox
        </button>
        <button
          type="button"
          class="send-to-bower-now"
          disabled={busy || empty || runNow.block !== null}
          onClick={() => void send('now')}
        >
          {RUN_NOW_LABEL}
        </button>
        <p class="send-to-bower-line">
          {runNow.reason ?? `${RUN_NOW_LINE} The rest of the inbox waits.`}
        </p>
      </div>
    </Overlay>
  );
}

/** Opens the sheet on the overlay queue; it closes with `onClose`. */
export function openSendToBower(props: Omit<SendToBowerProps, 'onClose'>): void {
  open({
    id: SEND_TO_BOWER_ID,
    priority: OVERLAY_PRIORITY.own,
    render: () => (
      <SendToBower {...props} onClose={() => close(SEND_TO_BOWER_ID)} />
    ),
  });
}
