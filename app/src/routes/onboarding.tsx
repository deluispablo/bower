/**
 * First run (spec §7, #149): three screens in one route, with local state.
 *
 * 1. Welcome: the bird says hello. "Show me around" and "Skip the tour"
 *    both go on to the folder; skipping also records that the tour was
 *    seen, so Home never shows it.
 * 2. Where your notes live: a new Bower folder (recommended) or one the
 *    person already has, through the Drive picker or a pasted link.
 * 3. Building your bower: while `POST /vault` runs the bird builds, the six
 *    folders appear as chips and a progress bar runs; "Continue" appears
 *    once the folder exists and goes to Home, where the tour starts. On an
 *    error the bird is confused and the message says what to do.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { ApiError, createVault, loginUrl, selectVault } from '../api.js';
import type { Vault } from '../api.js';
import { Bird } from '../components/bird.js';
import type { BirdState } from '../components/bird-classes.js';
import {
  IconChat,
  IconFolder,
  IconInbox,
  IconPlus,
} from '../components/icons.js';
import { getToken } from '../drive.js';
import { parseFolderId } from '../onboarding.js';
import {
  folderIdFromPickerResponse,
  loadPicker,
  openFolderPicker,
} from '../picker.js';
import { useSession } from '../session.js';
import { endTour, markTourSeen } from '../tour-store.js';
import '../styles/onboarding.css';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? '';

type Step = 'welcome' | 'folder' | 'building';

type Mode = 'create' | 'select';

type Busy = Mode | null;

type ErrorState =
  | { kind: 'folder-exists'; text: string }
  | { kind: 'reauth'; text: string }
  | { kind: 'message'; text: string };

const STEPS: readonly Step[] = ['welcome', 'folder', 'building'];

/** The six folders of a new Bower folder, as the Building screen shows them. */
const FOLDERS: readonly { name: string; Icon: () => JSX.Element }[] = [
  { name: '0-Inbox', Icon: IconInbox },
  { name: '1-Projects', Icon: IconFolder },
  { name: '2-Areas', Icon: IconFolder },
  { name: '3-Resources', Icon: IconFolder },
  { name: '4-Archive', Icon: IconFolder },
  { name: 'Answers', Icon: IconChat },
];

/** Where the person is: three first-run screens, then the three tour steps. */
function Dots({ step }: { step: Step }): JSX.Element {
  const at = STEPS.indexOf(step);
  return (
    <div class="onb-dots" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} class={i === at ? 'is-on' : undefined} />
      ))}
    </div>
  );
}

export function Onboarding(): JSX.Element {
  const { me, setMe, refresh } = useSession();
  const { route } = useLocation();
  const [step, setStep] = useState<Step>('welcome');
  const [mode, setMode] = useState<Mode>('create');
  const [vault, setVault] = useState<Vault | null>(null);
  const [showSelectForm, setShowSelectForm] = useState(false);
  const [folderInput, setFolderInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // No key configured: skip straight to the paste-a-link fallback.
  const [pickerFallback, setPickerFallback] = useState(GOOGLE_API_KEY === '');
  const heading = useRef<HTMLHeadingElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);

  // A new screen: move focus to its heading, so keyboard and screen reader
  // users start at the top of it. Not on the first screen, which the page
  // load already puts them on.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  useEffect(() => {
    if (vault !== null) continueButton.current?.focus();
  }, [vault]);

  function goToFolder(): void {
    setError(null);
    setStep('folder');
  }

  function skipTour(): void {
    endTour(false);
    if (me !== undefined) void markTourSeen(me);
    goToFolder();
  }

  function onVault(created: Vault): void {
    if (me) setMe({ ...me, vault: created });
    setVault(created);
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
    setMode('create');
    setStep('building');
    setBusy('create');
    try {
      onVault(await createVault());
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  }

  function handleUseThatFolder(): void {
    setShowSelectForm(true);
    goToFolder();
  }

  async function finishSelect(folderId: string): Promise<void> {
    setError(null);
    setMode('select');
    setStep('building');
    setBusy('select');
    try {
      onVault(await selectVault(folderId));
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  }

  async function handleSelect(): Promise<void> {
    const folderId = parseFolderId(folderInput);
    if (folderId === null) {
      setInputError('That does not look like a Drive folder link.');
      return;
    }
    setInputError(null);
    await finishSelect(folderId);
  }

  async function handleChooseFolder(): Promise<void> {
    setInputError(null);
    setError(null);
    setBusy('select');
    try {
      const [token, picker] = await Promise.all([getToken(), loadPicker()]);
      openFolderPicker(picker, token.accessToken, GOOGLE_API_KEY, (data) => {
        const folderId = folderIdFromPickerResponse(data);
        if (folderId !== null) void finishSelect(folderId);
      });
    } catch (err) {
      console.error(err);
      setPickerFallback(true);
      setError({
        kind: 'message',
        text: "Couldn't open the folder picker. Paste the link instead.",
      });
    } finally {
      setBusy(null);
    }
  }

  if (step === 'welcome') {
    return (
      <section class="auth-screen onb">
        <div class="auth-bird auth-bird--ground">
          <Bird state="hello" size={96} />
        </div>
        <div class="auth-heading">
          <h1 ref={heading} tabIndex={-1} class="onb-title">
            Hi, I'm Bower.
          </h1>
          <p class="onb-lead">
            I keep your notes tidy, in a folder in your own Google Drive. Want a
            quick look around?
          </p>
        </div>
        <div class="auth-actions">
          <button type="button" class="button onb-primary" onClick={goToFolder}>
            Show me around
          </button>
          <button type="button" class="button-link" onClick={skipTour}>
            Skip the tour
          </button>
        </div>
        <Dots step={step} />
      </section>
    );
  }

  if (step === 'folder') {
    return (
      <section class="onb onb-folder">
        <div class="onb-ask">
          <Bird state="looking" size={64} />
          <p class="onb-bubble">Where should I build the nest?</p>
        </div>
        <h1 ref={heading} tabIndex={-1} class="onb-title">
          Where your notes live
        </h1>

        {error?.kind === 'message' && <p class="auth-error">{error.text}</p>}

        <button
          type="button"
          class="onb-card onb-card--recommended"
          disabled={busy !== null}
          onClick={() => void handleCreate()}
        >
          <IconPlus />
          <span class="onb-card-text">
            <span class="onb-card-title">Make a new Bower folder</span>
            <span class="onb-card-hint">
              A folder called Bower in your Drive, with six folders and a
              rulebook inside. Recommended.
            </span>
          </span>
        </button>

        <button
          type="button"
          class="onb-card"
          aria-expanded={showSelectForm}
          aria-controls="onboarding-select"
          onClick={() => setShowSelectForm(true)}
        >
          <IconFolder />
          <span class="onb-card-text">
            <span class="onb-card-title">Use a folder I already have</span>
            <span class="onb-card-hint">
              A folder in your Drive, even one you use with Obsidian. I add what
              is missing and never overwrite what is there.
            </span>
          </span>
        </button>

        {showSelectForm && (
          <div id="onboarding-select" class="onboarding-form">
            {pickerFallback ? (
              <>
                <label for="onboarding-folder">
                  Paste the folder link or id
                </label>
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
              </>
            ) : (
              <button
                type="button"
                class="button"
                disabled={busy !== null}
                onClick={() => void handleChooseFolder()}
              >
                {busy === 'select' ? 'Working…' : 'Choose a folder'}
              </button>
            )}
          </div>
        )}

        <p class="onb-note">
          You can move the folder later; Bower keeps its id, not its place.
        </p>
        <Dots step={step} />
      </section>
    );
  }

  const ready = vault !== null;
  const birdState: BirdState =
    error !== null ? 'confused' : ready ? 'done' : 'building';

  return (
    <section class="auth-screen onb onb-building">
      <div class="onb-build-bird">
        <Bird state={birdState} size={96} scene={birdState === 'building'} />
      </div>
      <div class="auth-heading">
        <h1 ref={heading} tabIndex={-1} class="onb-title">
          Building your bower
        </h1>
        <p class="onb-lead">
          {mode === 'create'
            ? 'A folder called Bower in your Drive, six folders inside, and a rulebook you can edit. Takes a few seconds.'
            : 'Your own folder, with the six folders and the rulebook added where they are missing. Takes a few seconds.'}
        </p>
      </div>

      {error === null && (
        <>
          <div
            class={ready ? 'onb-progress is-done' : 'onb-progress'}
            role="progressbar"
            aria-label="Building your bower"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ready ? 100 : undefined}
          >
            <span class="onb-progress-fill" />
          </div>
          <ul class={ready ? 'onb-chips is-done' : 'onb-chips'}>
            {FOLDERS.map(({ name, Icon }, i) => (
              <li
                key={name}
                class="onb-chip"
                style={{ animationDelay: `${i * 0.6}s` }}
              >
                <Icon />
                {name}
              </li>
            ))}
          </ul>
        </>
      )}

      <p class="onb-status" aria-live="polite">
        {error === null
          ? ready
            ? 'Your Bower folder is ready.'
            : busy !== null
              ? 'Setting up your folder…'
              : ''
          : ''}
      </p>

      {error?.kind === 'folder-exists' && (
        <div class="onboarding-notice">
          <p class="auth-error">{error.text}</p>
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

      <div class="auth-actions">
        {ready && (
          <button
            ref={continueButton}
            type="button"
            class="button onb-primary"
            onClick={() => route('/')}
          >
            Continue
          </button>
        )}
        {error !== null && (
          <button type="button" class="button-link" onClick={goToFolder}>
            Back
          </button>
        )}
      </div>
      <Dots step={step} />
    </section>
  );
}
