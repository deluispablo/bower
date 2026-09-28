/**
 * First run (spec §7, #149; the Drive step of #219; the interview of #198):
 * five screens in one route, with local state.
 *
 * 1. Welcome: the bird says hello. "Show me around" and "Skip the tour"
 *    both go on to the folder; skipping also records that the tour was
 *    seen, so Home never shows it.
 * 2. Where your notes live: a new Bower folder (recommended) or one the
 *    person already has, through the Drive picker or a pasted link.
 * 3. Building your bower: while `POST /vault` runs the bird builds, the six
 *    folders appear as chips and a progress bar runs; "Continue" appears
 *    once the folder exists. On an error the bird is confused and the
 *    message says what to do.
 * 4. The interview (`components/interview.tsx`, spec D.2): four questions,
 *    one at a time. "Finish" writes the answers through `useVault`'s
 *    `submitInterview`; "Skip the interview" writes nothing. Replayable
 *    from Settings as `/onboarding?step=interview&from=settings`, which
 *    starts here directly and returns to Settings instead of going on.
 * 5. Start with what you have (only with `VITE_GOOGLE_API_KEY` set, spec
 *    §14 "Add from your Drive"): the same Picker and copy-or-export-into-
 *    inbox path as Add's "From your Drive" button (#218: a Doc, Sheet or
 *    Slides file is exported first). "Later" and, once any pick settles,
 *    "Continue" both go to Home, where the tour starts. Without the key
 *    the interview's own "Finish"/"Skip" go straight there instead, as
 *    Building's "Continue" always did before the interview existed.
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
  IconChevronRight,
  IconFolder,
  IconInbox,
  IconPlus,
} from '../components/icons.js';
import { Interview } from '../components/interview.js';
import { copyOrExportIntoInbox, exportPlanFor, getToken } from '../drive.js';
import type { InterviewAnswers } from '../interview.js';
import { parseFolderId } from '../onboarding.js';
import {
  filesFromPickerResponse,
  folderIdFromPickerResponse,
  loadPicker,
  openFilePicker,
  openFolderPicker,
  type PickedItem,
} from '../picker.js';
import { useSession } from '../session.js';
import { endTour, markTourSeen } from '../tour-store.js';
import { useVault } from '../vault-store.js';
import { expandPicks } from './add.js';
import '../styles/onboarding.css';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? '';

/** The fourth screen only exists with a Picker key; otherwise Building goes
 * straight to Home, as it always has. */
const HAS_DRIVE_STEP = GOOGLE_API_KEY !== '';

type Step = 'welcome' | 'folder' | 'building' | 'interview' | 'drive';

type Mode = 'create' | 'select';

type Busy = Mode | null;

type ErrorState =
  | { kind: 'folder-exists'; text: string }
  | { kind: 'reauth'; text: string }
  | { kind: 'message'; text: string };

const STEPS: readonly Step[] = HAS_DRIVE_STEP
  ? ['welcome', 'folder', 'building', 'interview', 'drive']
  : ['welcome', 'folder', 'building', 'interview'];

/** Dots for this route's own steps plus the three-step tour that follows
 * (never rendered here): seven without the Drive step, eight with it — one
 * more than before the interview (#198) existed, either way. */
const DOT_COUNT = HAS_DRIVE_STEP ? 8 : 7;

type DriveItemStatus = 'copying' | 'done' | 'failed';

interface DriveQueueItem {
  id: string;
  driveId: string;
  name: string;
  /** Decides whether the copy is exported first (`exportPlanFor`, #218). */
  mimeType: string;
  status: DriveItemStatus;
  error?: string;
}

/** The queue card's status line, once done or while it is copying or
 * exporting: the same wording as Add's own `driveStatusText` (#218). */
function driveStatusText(mimeType: string, done: boolean): string {
  const plan = exportPlanFor(mimeType);
  if (plan.action !== 'export') {
    return done
      ? 'Copied from your Drive · the original stays where it was'
      : 'Copying from your Drive…';
  }
  const savedAs =
    plan.extension === '.md'
      ? 'Markdown'
      : plan.extension === '.csv'
        ? 'a table'
        : 'a PDF';
  return done
    ? `Saved as ${savedAs} from your Drive · the original stays where it was`
    : `Saving as ${savedAs}…`;
}

/** The six folders of a new Bower folder, as the Building screen shows them. */
const FOLDERS: readonly { name: string; Icon: () => JSX.Element }[] = [
  { name: '0-Inbox', Icon: IconInbox },
  { name: '1-Projects', Icon: IconFolder },
  { name: '2-Areas', Icon: IconFolder },
  { name: '3-Resources', Icon: IconFolder },
  { name: '4-Archive', Icon: IconFolder },
  { name: 'Answers', Icon: IconChat },
];

/** Where the person is: this route's own steps, then the three tour steps. */
function Dots({ step }: { step: Step }): JSX.Element {
  const at = STEPS.indexOf(step);
  return (
    <div class="onb-dots" aria-hidden="true">
      {Array.from({ length: DOT_COUNT }, (_, i) => (
        <span key={i} class={i === at ? 'is-on' : undefined} />
      ))}
    </div>
  );
}

export function Onboarding(): JSX.Element {
  const { me, setMe, refresh } = useSession();
  const { route, query } = useLocation();
  const vault = useVault();
  // Settings › Advanced → "Tell Bower about yourself again" replays just
  // the interview, and returns there instead of going on to the tour.
  const replayingFromSettings =
    query.step === 'interview' && query.from === 'settings';
  const [step, setStep] = useState<Step>(
    replayingFromSettings ? 'interview' : 'welcome',
  );
  const [mode, setMode] = useState<Mode>('create');
  const [createdVault, setCreatedVault] = useState<Vault | null>(null);
  const [showSelectForm, setShowSelectForm] = useState(false);
  const [folderInput, setFolderInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // No key configured: skip straight to the paste-a-link fallback.
  const [pickerFallback, setPickerFallback] = useState(GOOGLE_API_KEY === '');
  const [driveQueue, setDriveQueue] = useState<DriveQueueItem[]>([]);
  const [drivePickerOpening, setDrivePickerOpening] = useState(false);
  const [driveNotes, setDriveNotes] = useState<string[]>([]);
  const [interviewBusy, setInterviewBusy] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const driveContinueButton = useRef<HTMLButtonElement>(null);

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
    if (createdVault !== null) continueButton.current?.focus();
  }, [createdVault]);

  const driveQueueIdle =
    driveQueue.length > 0 &&
    driveQueue.every((item) => item.status !== 'copying');
  useEffect(() => {
    if (driveQueueIdle) driveContinueButton.current?.focus();
  }, [driveQueueIdle]);

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
    setCreatedVault(created);
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

  /** Building's Continue: on to the interview, always. */
  function continueFromBuilding(): void {
    setStep('interview');
  }

  /** The interview's own "Finish" or "Skip": on to the Drive step when
   * there is a Picker key, straight to Home otherwise — or, replaying from
   * Settings, back there instead of either. */
  function afterInterview(): void {
    if (replayingFromSettings) {
      route('/settings');
    } else if (HAS_DRIVE_STEP) {
      setStep('drive');
    } else {
      route('/');
    }
  }

  async function handleInterviewFinish(
    answers: InterviewAnswers,
  ): Promise<void> {
    setInterviewError(null);
    setInterviewBusy(true);
    try {
      await vault.submitInterview(answers);
      afterInterview();
    } catch (err) {
      console.error(err);
      setInterviewError('Could not save that. Try again in a moment.');
    } finally {
      setInterviewBusy(false);
    }
  }

  function handleInterviewSkip(): void {
    setInterviewError(null);
    afterInterview();
  }

  async function copyDriveItem(item: DriveQueueItem): Promise<void> {
    const inboxFolderId = createdVault?.inboxFolderId;
    if (inboxFolderId === undefined) return;
    try {
      await copyOrExportIntoInbox(
        { id: item.driveId, name: item.name, mimeType: item.mimeType },
        inboxFolderId,
      );
      setDriveQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'done' } : it)),
      );
    } catch (err) {
      console.error(err);
      setDriveQueue((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: 'failed',
                error: 'Could not copy this file from your Drive.',
              }
            : it,
        ),
      );
    }
  }

  /** Same copy-or-export path as Add's "From your Drive" (#218): picks land
   * in the inbox one at a time, each as its own queue card; the Bower
   * folder is left out by `filesFromPickerResponse`, as it is there, a
   * picked folder is expanded into its own files by `expandPicks`, same as
   * Add, and a Drawing or Form (no format to save it as) is left out with
   * a sentence. */
  async function onDrivePicked(
    data: google.picker.ResponseObject,
  ): Promise<void> {
    if (data.action !== 'picked') return;
    // The vault is brand new here (no index of its own subfolders yet), so
    // the freshly created root id is all there is to check against — the
    // same single-id check Add used before #312.
    const bowerFolderIds = new Set<string>(
      createdVault?.folderId !== undefined ? [createdVault.folderId] : [],
    );
    const { items, excluded } = filesFromPickerResponse(data, bowerFolderIds);
    const notes: string[] = [];
    if (excluded > 0) {
      notes.push('That is already in your Bower folder.');
    }
    const expanded = await expandPicks(items, notes);
    const files = expanded.filter((item: PickedItem) => {
      if (exportPlanFor(item.mimeType).action !== 'skip') return true;
      notes.push(
        `${item.name} is a Google Drawing or Form: there is no format to save it as, so it was left out.`,
      );
      return false;
    });
    setDriveNotes(notes);
    if (files.length === 0) return;
    const created: DriveQueueItem[] = files.map((item) => ({
      id: crypto.randomUUID(),
      driveId: item.id,
      name: item.name,
      mimeType: item.mimeType,
      status: 'copying',
    }));
    setDriveQueue((prev) => [...prev, ...created]);
    for (const item of created) {
      await copyDriveItem(item);
    }
  }

  /** Loads the Picker (only now, never before the button is pressed) and
   * opens it over the user's Drive, exactly as Add's button does. */
  async function onPickFromDrive(): Promise<void> {
    setDriveNotes([]);
    setDrivePickerOpening(true);
    try {
      const [token, picker] = await Promise.all([getToken(), loadPicker()]);
      openFilePicker(picker, token.accessToken, GOOGLE_API_KEY, (data) => {
        void onDrivePicked(data);
      });
    } catch (err) {
      console.error(err);
      setDriveNotes(['Could not open your Drive. Try again in a moment.']);
    } finally {
      setDrivePickerOpening(false);
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

  if (step === 'interview') {
    return (
      <Interview
        onFinish={(answers) => void handleInterviewFinish(answers)}
        onSkip={handleInterviewSkip}
        busy={interviewBusy}
        error={interviewError}
        headingRef={heading}
        dots={replayingFromSettings ? undefined : <Dots step={step} />}
      />
    );
  }

  if (step === 'drive') {
    return (
      <section class="onb onb-folder onb-drive">
        <div class="onb-ask">
          <Bird state="looking" size={64} />
          <p class="onb-bubble">
            Anything already in your Drive you want me to look at?
          </p>
        </div>
        <h1 ref={heading} tabIndex={-1} class="onb-title">
          Start with what you have
        </h1>
        <p class="onb-lead">
          Bower only ever sees its own folder. Pick files from anywhere else in
          your Drive and copies land in your inbox; the originals stay where
          they are. You can do this any time from Add.
        </p>

        <button
          type="button"
          class="onb-card onb-card--recommended"
          disabled={drivePickerOpening}
          onClick={() => void onPickFromDrive()}
        >
          <IconFolder />
          <span class="onb-card-text">
            <span class="onb-card-title">Pick files from my Drive</span>
            <span class="onb-card-hint">
              Recent, My Drive, Shared with me. Docs become Markdown, Sheets a
              table, Slides a PDF; everything else is copied as it is.
            </span>
          </span>
        </button>

        <button type="button" class="onb-card" onClick={() => route('/')}>
          <IconChevronRight />
          <span class="onb-card-text">
            <span class="onb-card-title">Later</span>
            <span class="onb-card-hint">
              Start empty and add things as they come.
            </span>
          </span>
        </button>

        {driveNotes.map((note) => (
          <p key={note} class="onb-note">
            {note}
          </p>
        ))}

        {driveQueue.length > 0 && (
          <ul class="onb-drive-queue">
            {driveQueue.map((item) => (
              <li key={item.id} class="onb-drive-queue-card">
                <span class="onb-drive-queue-icon" aria-hidden="true">
                  {item.status === 'copying' && (
                    <Bird state="tidying" size={30} />
                  )}
                  {item.status === 'done' && (
                    <span class="onb-drive-queue-check">✓</span>
                  )}
                  {item.status === 'failed' && (
                    <span class="onb-drive-queue-check onb-drive-queue-check-failed">
                      !
                    </span>
                  )}
                </span>
                <span class="onb-drive-queue-body">
                  <span class="onb-drive-queue-name">{item.name}</span>
                  <span class="onb-drive-queue-status">
                    {item.status !== 'failed' &&
                      driveStatusText(item.mimeType, item.status === 'done')}
                    {item.status === 'failed' && (item.error ?? 'Failed')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {driveQueueIdle && (
          <div class="auth-actions">
            <button
              ref={driveContinueButton}
              type="button"
              class="button onb-primary"
              onClick={() => route('/')}
            >
              Continue
            </button>
          </div>
        )}

        <Dots step={step} />
      </section>
    );
  }

  const ready = createdVault !== null;
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
            onClick={continueFromBuilding}
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
