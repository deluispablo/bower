/**
 * The recovery screens (R-VAULT-3, spec 6.20): what someone sees when the
 * Bower folder is in the Bin, gone, or out of reach. A full page with no tab
 * bar; the copy and the order of the buttons come from the spec's table.
 * Nothing here is automatic: every way out is a button.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { ApiError, createVault, selectVault } from '../api.js';
import { Bird } from '../components/bird.js';
import type { BirdState } from '../components/bird-classes.js';
import { getToken } from '../drive.js';
import { isRecoverReason, putItBack } from '../folder-state.js';
import type { RecoverReason } from '../folder-state.js';
import { parseFolderId } from '../onboarding.js';
import {
  folderIdFromPickerResponse,
  loadPicker,
  openFolderPicker,
} from '../picker.js';
import { useSession } from '../session.js';
import '../styles/auth.css';
import '../styles/recover.css';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? '';

export type RecoverAction = 'put-back' | 'new' | 'other' | 'retry';

export interface RecoverButton {
  action: RecoverAction;
  label: string;
  kind: 'primary' | 'secondary' | 'text';
}

export interface RecoverScreen {
  bird: BirdState;
  title: string;
  text: string;
  /** In the order they are shown. */
  buttons: readonly RecoverButton[];
  foot: string;
}

/** The three screens, verbatim from the spec's table (6.20). */
export const RECOVER_SCREENS: Record<RecoverReason, RecoverScreen> = {
  trashed: {
    bird: 'confused',
    title: 'Your Bower folder is in the Bin',
    text: 'It is in your Google Drive Bin, with everything in it. Put it back and Bower carries on where it was.',
    buttons: [
      { action: 'put-back', label: 'Put it back', kind: 'primary' },
      { action: 'new', label: 'Start a new Bower folder', kind: 'secondary' },
      { action: 'other', label: 'Use another folder', kind: 'text' },
    ],
    foot: 'Nothing is changed until you choose. A new folder leaves the old one in the Bin, which Drive empties after 30 days.',
  },
  missing: {
    bird: 'confused',
    title: 'Your Bower folder is gone',
    text: 'It was deleted from your Drive, Bin included, so Bower cannot bring it back. Your notes, your rules and About me were in it.',
    buttons: [
      { action: 'new', label: 'Start a new Bower folder', kind: 'primary' },
      { action: 'other', label: 'Use another folder', kind: 'secondary' },
    ],
    foot: 'If it was emptied from the Bin, Google Drive support may still be able to get it back: ask them before starting again.',
  },
  'no-access': {
    bird: 'looking',
    title: "Bower can't open your folder",
    text: 'It may be in a shared drive, or shared by someone who no longer lets you open it. Ask them for access, then try again.',
    buttons: [
      { action: 'retry', label: 'Try again', kind: 'primary' },
      { action: 'other', label: 'Use another folder', kind: 'secondary' },
      { action: 'new', label: 'Start a new Bower folder', kind: 'text' },
    ],
    foot: 'Starting a new folder leaves your notes where they are, split across two folders.',
  },
};

const CLASS_OF_KIND: Record<RecoverButton['kind'], string> = {
  primary: 'button',
  secondary: 'button button-secondary',
  text: 'button-link',
};

/** The sentence shown when a way out did not work out. */
export const NOTICES = {
  stillInBin: 'Bower could not put it back. Try again, or start a new folder.',
  stillGone: 'Your Bower folder is still gone.',
  stillNoAccess: 'Bower still cannot open your folder.',
  offline: 'Bower could not reach Drive. Try again in a moment.',
  newFailed: 'Bower could not start a new folder. Try again in a moment.',
  otherFailed:
    'Bower cannot open that folder. Check the link and that the folder is yours.',
  otherInBin:
    'That folder is in the Bin. Take it out of the Bin in Drive first, or pick another.',
  badLink: 'That does not look like a Drive folder link.',
  picker: "Couldn't open the folder picker. Paste the link instead.",
} as const;

export function Recover() {
  const { query } = useLocation();
  const { me, folder, refresh, recheckFolder, signOut } = useSession();
  const { route } = useLocation();
  const reason: RecoverReason = isRecoverReason(query.reason)
    ? query.reason
    : isRecoverReason(folder)
      ? folder
      : 'missing';
  const screen = RECOVER_SCREENS[reason];
  const folderId = me?.vault?.folderId ?? null;

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [link, setLink] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [reason]);

  /** Back to Home once the folder reads `ok`; clears the Worker's mark. */
  async function goHome(): Promise<void> {
    if (me?.vault?.missingAt !== undefined && folderId !== null) {
      try {
        await selectVault(folderId);
      } catch (err) {
        console.error(err);
      }
    }
    await refresh();
    await recheckFolder();
    route('/');
  }

  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      await work();
    } catch (err) {
      console.error(err);
      setNotice(NOTICES.newFailed);
    } finally {
      setBusy(false);
    }
  }

  function putBack(): Promise<void> {
    return run(async () => {
      if (folderId === null) return;
      const state = await putItBack(folderId);
      if (state === 'ok') {
        await goHome();
      } else if (state === 'unknown') {
        setNotice(NOTICES.offline);
      } else if (state === 'missing') {
        setNotice(NOTICES.stillGone);
      } else {
        setNotice(NOTICES.stillInBin);
      }
    });
  }

  function tryAgain(): Promise<void> {
    return run(async () => {
      const state = await recheckFolder();
      if (state === 'ok') {
        await goHome();
      } else if (state === 'unknown') {
        setNotice(NOTICES.offline);
      } else {
        setNotice(NOTICES.stillNoAccess);
      }
    });
  }

  function startNew(): Promise<void> {
    return run(async () => {
      await createVault();
      await refresh();
      await recheckFolder();
      route('/');
    });
  }

  async function useFolder(id: string): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      await selectVault(id);
      await refresh();
      await recheckFolder();
      route('/');
    } catch (err) {
      console.error(err);
      setNotice(
        err instanceof ApiError && err.code === 'folder_trashed'
          ? NOTICES.otherInBin
          : NOTICES.otherFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  async function chooseOther(): Promise<void> {
    setNotice(null);
    if (GOOGLE_API_KEY === '') {
      setPasting(true);
      return;
    }
    setBusy(true);
    try {
      const [token, picker] = await Promise.all([getToken(), loadPicker()]);
      openFolderPicker(picker, token.accessToken, GOOGLE_API_KEY, (data) => {
        const id = folderIdFromPickerResponse(data);
        if (id !== null) void useFolder(id);
      });
    } catch (err) {
      console.error(err);
      setPasting(true);
      setNotice(NOTICES.picker);
    } finally {
      setBusy(false);
    }
  }

  function submitLink(event: Event): void {
    event.preventDefault();
    const id = parseFolderId(link);
    if (id === null) {
      setNotice(NOTICES.badLink);
      return;
    }
    void useFolder(id);
  }

  function onButton(action: RecoverAction): void {
    if (action === 'put-back') void putBack();
    else if (action === 'retry') void tryAgain();
    else if (action === 'new') void startNew();
    else void chooseOther();
  }

  return (
    <section class="auth-screen recover">
      <div class="auth-bird">
        <Bird state={screen.bird} size={96} />
      </div>
      <div class="auth-heading">
        <h1 class="recover-title" ref={heading} tabIndex={-1}>
          {screen.title}
        </h1>
        <p class="auth-note">{screen.text}</p>
      </div>
      {notice !== null && (
        <p class="recover-notice" role="status">
          {notice}
        </p>
      )}
      <div class="auth-actions">
        {screen.buttons.map((button) => (
          <button
            key={button.action}
            type="button"
            class={CLASS_OF_KIND[button.kind]}
            disabled={busy}
            onClick={() => onButton(button.action)}
          >
            {button.label}
          </button>
        ))}
      </div>
      {pasting && (
        <form class="recover-paste" onSubmit={submitLink}>
          <label for="recover-link">Link to the folder</label>
          <input
            id="recover-link"
            type="text"
            value={link}
            onInput={(event) => setLink(event.currentTarget.value)}
          />
          <button type="submit" class="button" disabled={busy}>
            Use this folder
          </button>
        </form>
      )}
      <p class="recover-foot">{screen.foot}</p>
      <p class="recover-links">
        <a href="/welcome">Help</a>
        <span aria-hidden="true"> · </span>
        <button
          type="button"
          class="button-link"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </p>
    </section>
  );
}
