/**
 * The Ask sheet (spec §3.13, R-ASK-1..5; boards PF-Ask, LI-Ask, GR-Ask,
 * AR-Ask, NO-Ask, FI-Ask): a content sheet on the phone, the side panel on
 * desktop. The header "Ask Bower" and ✕, the context line (the item's own
 * icon and "About <name>"), "Your question" in a Composer (`send`, three
 * rows, "Put in the inbox"), the explainer of where the answer goes, and
 * "Just this, now" with its cost line. It writes one instruction note
 * (`writeRequestNote`) and confirms by a toast with Undo; the page under
 * it never changes.
 *
 * Open it with `openAsk(item, { prefill })` (⋯ "Ask Bower about this", the
 * file tip); `openSendToBower` stays for the older "Try asking" chips.
 */

import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { FOLDER_MIME, createTextFile, deleteFile } from '../drive.js';
import { undoRequestNote, writeRequestNote } from '../move-request.js';
import type { ParaKind } from '../navigation.js';
import { useOnline } from '../online.js';
import { close, open, OVERLAY_PRIORITY } from '../overlay-queue.js';
import { RUN_NOW_LABEL, RUN_NOW_LINE, useRunNow } from '../run-now.js';
import { useSession } from '../session.js';
import { showToast } from '../toast-store.js';
import { useVault } from '../vault-store.js';
import { Composer, COMPOSER_LINES } from './composer.js';
import { FileIcon } from './file-icon.js';
import type { FileIconItem } from './file-icon.js';
import { IconInbox } from './icons.js';
import { Overlay, OverlayHeader } from './overlay.js';

import '../styles/send-to-bower.css';

export const ASK_ID = 'ask-bower';

/** The empty box's placeholder (spec §3.13). */
export const ASK_PLACEHOLDER = 'What would you like to know?';
export const ASK_SENT_TOAST =
  'In your inbox. Bower answers at the next tidy-up.';

/** What the question is about. */
export interface AskItem {
  /** The name as the person reads it ("Moonee Ponds", "Areas"). */
  name: string;
  /** A folder's answer goes in it; a note's or file's next to it (K-29). */
  kind: 'folder' | 'note' | 'file';
  /** The item for its own icon in the context line (FileIcon 18). */
  icon?: FileIconItem;
  /** The request note's words; `About <name>: <question>` by default. */
  buildText?: (question: string) => string;
}

export interface AskOptions {
  /** The box's starting text (the file tip's question, a chip). */
  prefill?: string;
}

/** The explainer's second line (R-ASK-3). */
export function askExplainer(item: Pick<AskItem, 'name' | 'kind'>): string {
  return item.kind === 'folder'
    ? `Bower answers at the next tidy-up and puts the answer in ${item.name}.`
    : `Bower answers at the next tidy-up and puts the answer next to ${item.name}.`;
}

export interface AskSheetProps {
  item: AskItem;
  prefill?: string;
  onClose: () => void;
}

export function AskSheet({
  item,
  prefill = '',
  onClose,
}: AskSheetProps): JSX.Element {
  const { me } = useSession();
  const { refresh } = useVault();
  const runNow = useRunNow();
  const online = useOnline();
  const [value, setValue] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;
  const empty = value.trim() === '';
  const build =
    item.buildText ?? ((question: string) => `About ${item.name}: ${question}`);

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
    const question = value.trim();
    if (busy || question === '') return;
    if (inboxFolderId === null) {
      setError(COMPOSER_LINES.failed);
      return;
    }
    setBusy(true);
    setError(null);
    let id: string | null;
    try {
      id = await writeRequestNote(
        { createTextFile },
        { inboxFolderId, text: build(question), now: new Date() },
      );
    } catch (err) {
      console.error(err);
      setBusy(false);
      setError(COMPOSER_LINES.failed);
      return;
    }
    void refresh();
    if (when === 'later') {
      showToast(
        ASK_SENT_TOAST,
        undefined,
        id === null ? undefined : { label: 'Undo', run: () => void undo(id) },
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

  const nowOff = busy || empty || !online || runNow.block !== null;

  return (
    <Overlay kind="sheet" labelledBy="ask-title" onClose={onClose}>
      <div class="overlay-body ask">
        <OverlayHeader
          titleId="ask-title"
          title="Ask Bower"
          closeLabel="Close Ask Bower"
          onClose={onClose}
        />
        <p class="ask-about">
          {item.icon !== undefined && <FileIcon item={item.icon} size={16} />}
          <span>About {item.name}</span>
        </p>
        <label class="ask-label" htmlFor="ask-question">
          Your question
        </label>
        <Composer
          id="ask-question"
          mode="send"
          rows={3}
          label="Your question"
          placeholder={ASK_PLACEHOLDER}
          commitLabel="Put in the inbox"
          value={value}
          onChange={(next) => {
            setError(null);
            setValue(next);
          }}
          onCommit={() => void send('later')}
          sending={busy}
          error={error}
          autoFocus
        />
        <div class="ask-explainer">
          <span class="ask-explainer-icon" aria-hidden="true">
            <IconInbox />
          </span>
          <p>
            <b>The arrow puts it in your inbox</b>
            <br />
            {askExplainer(item)}
          </p>
        </div>
        <button
          type="button"
          class="ask-now"
          aria-disabled={nowOff || undefined}
          onClick={() => {
            if (!nowOff) void send('now');
          }}
        >
          {RUN_NOW_LABEL}
        </button>
        <p class="ask-now-line">
          {runNow.reason ?? `${RUN_NOW_LINE} The rest of the inbox waits.`}
        </p>
      </div>
    </Overlay>
  );
}

/** Opens Ask Bower about `item` on the overlay queue (R-ASK-1). */
export function openAsk(item: AskItem, options: AskOptions = {}): void {
  open({
    id: ASK_ID,
    priority: OVERLAY_PRIORITY.own,
    render: () => (
      <AskSheet
        item={item}
        {...(options.prefill !== undefined && { prefill: options.prefill })}
        onClose={() => close(ASK_ID)}
      />
    ),
  });
}

/** The older call of the "Try asking" chips (folder, file tip, compare). */
export interface SendToBowerProps {
  mode: 'ask';
  /** What it is about: "About Applications". */
  about: string;
  /** The folder's root, for its icon; the answer goes in it. */
  aboutKind?: ParaKind;
  initialText?: string;
  buildText: (value: string) => string;
}

/**
 * Opens the Ask sheet for a caller written before `openAsk`: the answer
 * goes in `about`, as that sheet always said.
 */
export function openSendToBower(props: SendToBowerProps): void {
  openAsk(
    {
      name: props.about,
      kind: 'folder',
      buildText: props.buildText,
      ...(props.aboutKind !== undefined && {
        icon: {
          name: props.about,
          mimeType: FOLDER_MIME,
          root: props.aboutKind,
        },
      }),
    },
    props.initialText !== undefined ? { prefill: props.initialText } : {},
  );
}
