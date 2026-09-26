import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { ApiError, createVault, loginUrl, selectVault } from '../api.js';
import type { Vault } from '../api.js';
import { parseFolderId } from '../onboarding.js';
import { useSession } from '../session.js';

type Busy = 'create' | 'select' | null;

type ErrorState =
  | { kind: 'folder-exists'; text: string }
  | { kind: 'reauth'; text: string }
  | { kind: 'message'; text: string };

export function Onboarding() {
  const { me, setMe, refresh } = useSession();
  const { route } = useLocation();
  const [showSelectForm, setShowSelectForm] = useState(false);
  const [folderInput, setFolderInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  function onVault(vault: Vault): void {
    if (me) setMe({ ...me, vault });
    route('/');
  }

  function onError(err: unknown): void {
    if (err instanceof ApiError) {
      if (err.code === 'folder_exists') {
        setError({
          kind: 'folder-exists',
          text: 'You already have a folder called Bower in your Drive.',
        });
        return;
      }
      if (err.code === 'vault_exists') {
        void refresh().then(() => route('/'));
        return;
      }
      if (err.status === 400) {
        setError({
          kind: 'message',
          text: 'Bower cannot open that folder. Check the link and that the folder is yours.',
        });
        return;
      }
      if (err.code === 'reauth') {
        setError({
          kind: 'reauth',
          text: 'Google access needs to be renewed.',
        });
        return;
      }
    }
    console.error(err);
    setError({ kind: 'message', text: 'Something went wrong. Try again.' });
  }

  async function handleCreate(): Promise<void> {
    setError(null);
    setBusy('create');
    try {
      const vault = await createVault();
      onVault(vault);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  }

  function handleUseThatFolder(): void {
    setError(null);
    setShowSelectForm(true);
  }

  async function handleSelect(): Promise<void> {
    const folderId = parseFolderId(folderInput);
    if (folderId === null) {
      setInputError('That does not look like a Drive folder link.');
      return;
    }
    setInputError(null);
    setError(null);
    setBusy('select');
    try {
      const vault = await selectVault(folderId);
      onVault(vault);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section class="auth-screen">
      <h1>Welcome to Bower</h1>
      <p>
        Bower keeps your notes in a folder in your Google Drive. You can also
        open it with Obsidian.
      </p>

      {error?.kind === 'folder-exists' && (
        <div class="onboarding-notice">
          <p>{error.text}</p>
          <button type="button" class="button" onClick={handleUseThatFolder}>
            Use that folder
          </button>
        </div>
      )}
      {error?.kind === 'reauth' && (
        <p class="auth-error">
          {error.text} <a href={loginUrl()}>Sign in again</a>
        </p>
      )}
      {error?.kind === 'message' && <p class="auth-error">{error.text}</p>}

      <button
        type="button"
        class="button"
        disabled={busy !== null}
        onClick={() => void handleCreate()}
      >
        {busy === 'create' ? 'Creating your folder…' : 'Create my Bower folder'}
      </button>

      {!showSelectForm ? (
        <button
          type="button"
          class="button-link"
          onClick={() => setShowSelectForm(true)}
        >
          I already have a folder
        </button>
      ) : (
        <div class="onboarding-form">
          <label for="onboarding-folder">Paste the folder link or id</label>
          <input
            id="onboarding-folder"
            type="text"
            placeholder="https://drive.google.com/drive/folders/…"
            value={folderInput}
            onInput={(event) => {
              setFolderInput((event.target as HTMLInputElement).value);
            }}
          />
          {inputError && <p class="auth-error">{inputError}</p>}
          <button
            type="button"
            class="button"
            disabled={busy !== null}
            onClick={() => void handleSelect()}
          >
            Use this folder
          </button>
        </div>
      )}
    </section>
  );
}
