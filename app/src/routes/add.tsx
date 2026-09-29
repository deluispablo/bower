import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { useHasCamera } from '../add-camera.js';
import {
  setContextText,
  useContextText,
  writeContextNote,
} from '../add-context.js';
import {
  clearFiledAfterRun,
  getQueue,
  setQueue,
  useAddQueue,
  type QueueItem,
} from '../add-queue-store.js';
import { linkDisplayTitle, linkNoteName } from '../add.js';
import { isDemo } from '../api.js';
import { Bird } from '../components/bird.js';
import { UploadNotes } from '../components/upload-chip.js';
import {
  IconCamera,
  IconDrive,
  IconFile,
  IconSparkle,
} from '../components/icons.js';
import { KindBadge } from '../components/kind-badge.js';
import { labelFor, startsRun } from '../components/process-button.js';
import { useShellSlot } from '../components/shell-slots.js';
import {
  copyOrExportIntoInbox,
  createTextFile,
  exportPlanFor,
  FOLDER_MIME,
  getToken,
  listFolder,
  upload,
} from '../drive.js';
import { offlineReason, useOnline } from '../online.js';
import {
  filesFromPickerResponse,
  loadPicker,
  openFilePicker,
  type PickedItem,
} from '../picker.js';
import { formatPolicy } from '../formats.js';
import { inboxCount, inboxTotal } from '../inbox-count.js';
import { runKey, useRun } from '../run-store.js';
import { useSession } from '../session.js';
import { takeSharedFiles } from '../share-target.js';
import { uniqueName } from '../upload-names.js';
import {
  startUploads,
  uploadQueue,
  uploadThroughQueue,
} from '../upload-queue.js';
import { fileKind, type FileKind } from '../vault-index.js';
import { useVault } from '../vault-store.js';

import '../styles/add.css';
import '../styles/process.css';

/** The phone top bar's title (spec §14): a stable element, so it never
 * refills the shell's `crumb` slot on a re-render (`shell-slots.ts`). */
const CRUMB = <h1 class="topbar-title">Add</h1>;

/** Without a Picker key the "From your Drive" button is hidden, as the
 * onboarding folder picker is — except in the demo, where it always shows,
 * greyed (#364). */
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? '';

/** "From your Drive" and Settings' push toggle, greyed with one sentence
 * each in the demo (#364, `Demo-Add` board, handover C.10 and D.6): there
 * is no real Drive or push behind the demo to reach. Settings' own copy
 * (`routes/settings.tsx`) keeps its own identical constant, same as its
 * existing `NOT_IN_DEMO`, rather than a cross-route import. */
const NOT_IN_DEMO_DRIVE = 'Not in the demo. Run your own Bower to use it.';

/** The "What is this?" box's placeholder (`Flow-03-Add` board). */
const CONTEXT_PLACEHOLDER = 'Flats for November.';

/** Files copied from one picked Drive folder, at most. */
export const MAX_FOLDER_FILES = 50;

/**
 * The picks from one Picker response as files to copy: a picked folder
 * gives its own files (not its subfolders), at most `MAX_FOLDER_FILES`,
 * with a sentence in `notes` when there are more. Shared with onboarding's
 * "Start with what you have" step (#219), so it lives at module scope
 * rather than inside `Add()`.
 */
export async function expandPicks(
  picked: PickedItem[],
  notes: string[],
): Promise<PickedItem[]> {
  const files: PickedItem[] = [];
  for (const item of picked) {
    if (!item.isFolder) {
      files.push(item);
      continue;
    }
    try {
      const children = (await listFolder(item.id)).filter(
        (child) => child.mimeType !== FOLDER_MIME,
      );
      if (children.length > MAX_FOLDER_FILES) {
        notes.push(
          `${item.name} has more than ${MAX_FOLDER_FILES} files: the first ${MAX_FOLDER_FILES} were added. Pick the rest from inside the folder.`,
        );
      }
      for (const child of children.slice(0, MAX_FOLDER_FILES)) {
        files.push({
          id: child.id,
          name: child.name,
          mimeType: child.mimeType,
          isFolder: false,
        });
      }
    } catch (err) {
      console.error(err);
      notes.push(`Could not open the folder ${item.name}.`);
    }
  }
  return files;
}

/** The kind a queue row's badge and kept-not-read line come from: a pasted
 * link reads as a link (`doc` carries the `LINK` badge), anything else by
 * its name and MIME type, as the rest of the app does (`fileKind`). */
function queueKind(item: QueueItem): FileKind {
  if (item.kind === 'link') return 'doc';
  return fileKind({
    name: item.name,
    mimeType: item.file?.type ?? item.driveMimeType ?? '',
  });
}

/** The sources present in the queue, in the order the boards list them. */
function queueSources(queue: readonly QueueItem[], desktop: boolean): string {
  const parts: string[] = [];
  if (queue.some((it) => it.kind === 'file')) {
    parts.push(desktop ? 'drop' : 'Files');
  }
  if (queue.some((it) => it.kind === 'drive')) parts.push('Drive');
  if (queue.some((it) => it.kind === 'link')) parts.push('a link');
  if (!desktop) return `Shared from ${parts.join(', ')}`;
  const last = parts.pop();
  return `From ${parts.length > 0 ? `${parts.join(', ')} and ` : ''}${last ?? ''}`;
}

/** `file` renamed to `name`, or `file` itself when the name did not change. */
function withName(file: File, name: string): File {
  return name === file.name
    ? file
    : new File([file], name, { type: file.type });
}

/** The queue row's state text for a finished `kind: 'drive'` item (#334,
 * issue 21.2): a plain copy only says where it came from; an export also
 * says what it was saved as (#218). While it is still copying, the row
 * shows a percentage instead, the same as any other kind. */
function driveStateText(mimeType: string | undefined): string {
  const plan = exportPlanFor(mimeType ?? '');
  if (plan.action !== 'export') return 'From your Drive';
  const savedAs =
    plan.extension === '.md'
      ? 'saved as text'
      : plan.extension === '.csv'
        ? 'saved as a table, first sheet only'
        : 'saved as a PDF';
  return `From your Drive · ${savedAs}`;
}

export function Add() {
  const { me } = useSession();
  const { index, files, refresh, keepRule } = useVault();
  const online = useOnline();
  const hasCamera = useHasCamera();
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;
  const bowerFolderId = me?.vault?.folderId ?? null;
  // Every folder id the app already knows under the Bower folder, at any
  // depth (#312): the root itself, every folder in its own index (`.claude`
  // included, kept aside as `agentSettingsFolder`), so a Picker refusal
  // never needs an extra Drive call.
  const bowerFolderIds = new Set<string>();
  if (bowerFolderId !== null) bowerFolderIds.add(bowerFolderId);
  for (const folder of index?.folders ?? []) bowerFolderIds.add(folder.id);
  if (index?.agentSettingsFolder !== undefined) {
    bowerFolderIds.add(index.agentSettingsFolder.id);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const sharedHandledRef = useRef(false);

  // The queue itself lives in `add-queue-store.js`, outside this
  // component, so it survives navigating away and back within the
  // session (#334): `queue` here is just this render's snapshot.
  const queue = useAddQueue();
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pickerOpening, setPickerOpening] = useState(false);
  const [driveNotes, setDriveNotes] = useState<string[]>([]);
  const [shareError, setShareError] = useState<string | null>(null);

  useShellSlot('crumb', CRUMB);

  // #493: once a tidy-up this session finishes `done`, the rows it just
  // filed (and the "Added to your inbox." line about them) are stale —
  // Home already says "All tidy" by then. `clearFiledAfterRun` is the
  // single source of truth for which run this queue has already caught up
  // with, so this fires safely even if Add was not mounted when the run
  // actually finished.
  const { lastFinished, phase, tidyUp, openSheet } = useRun();
  // `tidyUp` closes over the vault listing of its own render; after the
  // waiting files upload, the button waits for the next render's copy so the
  // "Is that everything?" sheet counts them.
  const tidyUpRef = useRef(tidyUp);
  tidyUpRef.current = tidyUp;
  useEffect(() => {
    if (lastFinished === null || lastFinished.state !== 'done') return;
    if (clearFiledAfterRun(runKey(lastFinished))) setMessage(null);
  }, [lastFinished]);

  // "What is this?" (#335): leaving Add with text in the box and a batch in
  // the inbox writes its context note now, so it is there for whichever
  // Tidy up comes next (a tidy-up started from Add writes it first,
  // `run-store.tsx`). The listing catches up afterwards, as after an add.
  const contextText = useContextText();
  const leaveRef = useRef({ inboxFolderId, refresh, keepRule });
  leaveRef.current = { inboxFolderId, refresh, keepRule };
  useEffect(
    () => () => {
      const {
        inboxFolderId: inbox,
        refresh: refreshVault,
        keepRule: keep,
      } = leaveRef.current;
      void writeContextNote(inbox, keep).then((written) => {
        if (written) void refreshVault();
      });
    },
    [],
  );

  // The current inbox listing, so new names are made unique against it.
  // `listFolder` is a single, non-recursive call (unlike `listVault`).
  useEffect(() => {
    if (inboxFolderId === null) return;
    let cancelled = false;
    listFolder(inboxFolderId)
      .then((entries) => {
        if (cancelled) return;
        setExistingNames(new Set(entries.map((entry) => entry.name)));
      })
      .catch((err: unknown) => {
        console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, [inboxFolderId]);

  // Web Share Target: the service worker redirected here with the shared
  // files waiting in Cache Storage. They join the queue as waiting cards,
  // same as chosen or dropped files: nothing uploads until the person taps
  // "Add to Bower" (#262/M3).
  useEffect(() => {
    if (sharedHandledRef.current) return;
    if (typeof window === 'undefined') return;
    const shared = new URLSearchParams(window.location.search).get('shared');
    if (shared === 'failed') {
      // The service worker logged the real error (#134); the page only
      // needs one sentence.
      sharedHandledRef.current = true;
      setShareError('Could not receive the shared files. Try again.');
      return;
    }
    if (shared !== '1') return;
    sharedHandledRef.current = true;
    takeSharedFiles()
      .then((shared) => {
        if (shared.length === 0) return;
        addFiles(shared);
      })
      .catch((err: unknown) => {
        console.error(err);
        setShareError('Could not receive the shared files. Try again.');
      });
    // Runs once, right after mount.
  }, []);

  function claimName(preferred: string): string {
    const unique = uniqueName(preferred, existingNames);
    setExistingNames((prev) => new Set(prev).add(unique));
    return unique;
  }

  // `setQueue` (`add-queue-store.js`) is the single writer for the queue:
  // it updates the module-level array synchronously, so `getQueue()`
  // right after it is never a render behind. `runQueue` reads `getQueue()`
  // right after its last `await`, in the same tick as the last item's
  // final status change, so a render behind was exactly one render too
  // many -- the demo's uploads settle over a plain microtask with no real
  // I/O, so that render never caught up in time and `finish()` (the vault
  // refresh included) never ran (#289).
  function addFiles(newFiles: File[]): QueueItem[] {
    const created: QueueItem[] = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      kind: 'file',
      file,
      name: claimName(file.name),
      status: 'waiting',
      progress: 0,
    }));
    setQueue([...getQueue(), ...created]);
    return created;
  }

  function addDriveItems(picked: PickedItem[]): QueueItem[] {
    const created: QueueItem[] = picked.map((item) => ({
      id: crypto.randomUUID(),
      kind: 'drive',
      driveId: item.id,
      driveMimeType: item.mimeType,
      name: claimName(item.name),
      status: 'waiting',
      progress: 0,
    }));
    setQueue([...getQueue(), ...created]);
    return created;
  }

  function updateItem(id: string, patch: Partial<QueueItem>): void {
    setQueue(getQueue().map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function runOne(item: QueueItem, folderId: string): Promise<boolean> {
    updateItem(item.id, { status: 'uploading', progress: 0, error: undefined });
    try {
      if (item.kind === 'file' && item.file) {
        const onProgress = (sent: number, total: number): void => {
          updateItem(item.id, {
            progress: total > 0 ? Math.round((sent / total) * 100) : 100,
          });
        };
        if (isDemo() || me === undefined) {
          await upload(folderId, withName(item.file, item.name), onProgress);
        } else {
          // The durable queue (R-UPL-1): the file is copied to this device
          // first, so it still finishes if Bower is closed or reloaded.
          await startUploads(me.email);
          await uploadThroughQueue(
            uploadQueue(),
            {
              blob: item.file,
              name: item.name,
              type: item.file.type,
              pileId: 'inbox',
              parentId: folderId,
            },
            onProgress,
          );
        }
      } else if (item.kind === 'link' && item.url !== undefined) {
        await createTextFile(folderId, item.name, item.url);
      } else if (item.kind === 'drive' && item.driveId !== undefined) {
        await copyOrExportIntoInbox(
          {
            id: item.driveId,
            name: item.name,
            mimeType: item.driveMimeType ?? '',
          },
          folderId,
        );
      }
      updateItem(item.id, { status: 'done', progress: 100 });
      return true;
    } catch (err) {
      console.error(err);
      updateItem(item.id, {
        status: 'failed',
        error:
          item.kind === 'link'
            ? 'Could not save this link.'
            : item.kind === 'drive'
              ? 'Could not copy this file from your Drive.'
              : 'Could not upload this file.',
      });
      return false;
    }
  }

  /** After a batch's worth of uploads: report the add. Stays on Add (#421,
   * C.6/#334): adding is meant to take the whole pile before a tidy-up, so
   * leaving for Home after the first row would work against that. Add only
   * ever fills the inbox; the run itself is started by a tap on Tidy up
   * (the hint below, Home's Inbox card, the switcher command), never by
   * adding. */
  function finish(): void {
    setMessage('Added to your inbox.');
    // The vault index otherwise only catches up on its next background
    // revalidation, so the switcher's Tidy up count and Home's Inbox card would
    // read stale until then (#289).
    void refresh();
  }

  /** Runs whatever in `list` is not already `done`, then `finish()`s if,
   * across the whole queue added so far, all of it now is. */
  async function runQueue(list: QueueItem[]): Promise<void> {
    if (inboxFolderId === null || list.length === 0) return;
    setBusy(true);
    setMessage(null);
    for (const item of list) {
      if (item.status === 'done') continue;
      await runOne(item, inboxFolderId);
    }
    setBusy(false);
    if (getQueue().length === 0) return;
    if (!getQueue().every((it) => it.status === 'done')) return;
    finish();
  }

  async function onDrivePicked(
    data: google.picker.ResponseObject,
  ): Promise<void> {
    if (data.action !== 'picked') return;
    const { items, excluded } = filesFromPickerResponse(data, bowerFolderIds);
    const notes: string[] = [];
    if (excluded > 0) {
      notes.push('That is already in your Bower folder.');
    }
    const expanded = await expandPicks(items, notes);
    const files = expanded.filter((item) => {
      if (exportPlanFor(item.mimeType).action !== 'skip') return true;
      notes.push(
        `${item.name} is a Google Drawing or Form: there is no format to save it as, so it was left out.`,
      );
      return false;
    });
    setDriveNotes(notes);
    if (files.length === 0) return;
    await runQueue(addDriveItems(files));
  }

  /** Loads the Picker (only now, never before the button is pressed) and
   * opens it over the user's Drive. */
  async function onFromDrive(): Promise<void> {
    setDriveNotes([]);
    setPickerOpening(true);
    try {
      const [token, picker] = await Promise.all([getToken(), loadPicker()]);
      openFilePicker(picker, token.accessToken, GOOGLE_API_KEY, (data) => {
        void onDrivePicked(data);
      });
    } catch (err) {
      console.error(err);
      setDriveNotes(['Could not open your Drive. Try again in a moment.']);
    } finally {
      setPickerOpening(false);
    }
  }

  function onFileInputChange(event: JSX.TargetedEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    if (input.files && input.files.length > 0)
      addFiles(Array.from(input.files));
    input.value = '';
  }

  function onDrop(event: JSX.TargetedDragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragOver(false);
    const dropped = event.dataTransfer?.files;
    if (dropped && dropped.length > 0) addFiles(Array.from(dropped));
  }

  function onDragOver(event: JSX.TargetedDragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragOver(true);
  }

  function onSaveLink(): void {
    const trimmed = linkUrl.trim();
    const name = linkNoteName(trimmed, new Date());
    if (name === null) {
      setLinkError('Enter a link starting with http:// or https://.');
      return;
    }
    setLinkError(null);
    const item: QueueItem = {
      id: crypto.randomUUID(),
      kind: 'link',
      url: trimmed,
      name: claimName(name),
      status: 'waiting',
      progress: 0,
    };
    setQueue([...getQueue(), item]);
    // #493: the field clears and Save greys out again — a second press on
    // a still-full field was re-saving the same link as "… (2).md". The
    // queue row below is the record of the save now, not the field.
    setLinkUrl('');
    void runQueue([item]);
  }

  const waiting = queue.filter((item) => item.status === 'waiting');
  // The inbox's own count plus what is chosen but not yet uploaded: the same
  // number the "Is that everything?" sheet shows once the pile is in.
  const total = inboxTotal(inboxCount(files, false)) + waiting.length;
  const linkDisabled = inboxFolderId === null || !online;
  const driveShown = GOOGLE_API_KEY !== '' || isDemo();
  const driveDisabled =
    isDemo() || inboxFolderId === null || !online || pickerOpening;

  /** The one button: uploads what is still waiting, then asks the run store
   * for the "Is that everything?" confirmation (or reopens the working sheet
   * while a run is going). */
  async function onTidyUp(): Promise<void> {
    if (!startsRun(phase)) {
      openSheet();
      return;
    }
    if (waiting.length > 0) {
      await runQueue(waiting);
      if (getQueue().some((item) => item.status !== 'done')) return;
      await refresh();
      // Let the render that carries the refreshed listing land first.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    tidyUpRef.current();
  }
  const tidyDisabled = busy || phase === 'starting' || !online;
  const tidyLabel = busy
    ? 'Adding…'
    : startsRun(phase)
      ? `Tidy up ${total} ${total === 1 ? 'thing' : 'things'}`
      : labelFor(phase);

  return (
    <section class="add-screen">
      <h1 class="screen-title">Add</h1>

      <UploadNotes />

      {shareError !== null && <p class="add-field-error">{shareError}</p>}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={onFileInputChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onFileInputChange}
      />

      {/* Phone: three doors in one row, no drop square (spec R-ADD-1).
       * Desktop hides them and shows the drop zone below instead
       * (`add.css`'s 900 px breakpoint, the same one `layout.css` uses for
       * the sidebar). Both live in the DOM at once so neither needs its own
       * copy of the file inputs or the disabled/online rules. The visible
       * word is short; the accessible name keeps the long one. */}
      <div class="add-doors">
        {hasCamera && (
          <button
            type="button"
            class="add-door"
            aria-label="Take a photo"
            onClick={() => cameraInputRef.current?.click()}
          >
            <IconCamera />
            <span>Photo</span>
          </button>
        )}
        <button
          type="button"
          class="add-door"
          aria-label="Choose files"
          onClick={() => fileInputRef.current?.click()}
        >
          <IconFile />
          <span>Files</span>
        </button>
        {driveShown && (
          <button
            type="button"
            class="add-door"
            aria-label="From your Drive"
            disabled={driveDisabled}
            aria-disabled={driveDisabled}
            onClick={() => void onFromDrive()}
          >
            <IconDrive />
            <span>Drive</span>
          </button>
        )}
      </div>
      {isDemo() && (
        <p class="add-drive-note add-doors-note">{NOT_IN_DEMO_DRIVE}</p>
      )}

      <div
        class={`add-dropzone${dragOver ? ' add-dropzone-active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div class="add-dropzone-bird">
          <Bird state={dragOver ? 'shiny' : 'peeking'} size={64} />
        </div>
        <p class="add-dropzone-title">Drop files here</p>
        <div class="add-actions">
          <button
            type="button"
            class="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose files
          </button>
          {driveShown && (
            <button
              type="button"
              class="button button-secondary"
              disabled={driveDisabled}
              aria-disabled={driveDisabled}
              onClick={() => void onFromDrive()}
            >
              From your Drive
            </button>
          )}
        </div>
        {driveShown && (
          <p class="add-drive-note">
            {isDemo()
              ? NOT_IN_DEMO_DRIVE
              : 'Docs become Markdown, Sheets a table, Slides a PDF. Everything else is copied as it is.'}
          </p>
        )}
      </div>

      <div class="add-field">
        <div class="add-field-row">
          <input
            id="add-link"
            type="url"
            placeholder="Paste a link"
            aria-label="Paste a link"
            value={linkUrl}
            disabled={linkDisabled}
            onInput={(e) => setLinkUrl(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveLink();
            }}
          />
          <button
            type="button"
            class="button button-secondary"
            disabled={linkDisabled || linkUrl.trim() === ''}
            onClick={onSaveLink}
          >
            Save
          </button>
        </div>
        {linkError !== null && <p class="add-field-error">{linkError}</p>}
      </div>

      {queue.length > 0 && (
        <div class="add-queue-section">
          <h2 class="add-queue-head">In your inbox · {queue.length}</h2>
          <p class="add-queue-sources">
            <span class="add-sources-phone">{queueSources(queue, false)}</span>
            <span class="add-sources-desktop">{queueSources(queue, true)}</span>
          </p>
          <ul class="add-queue">
            {queue.map((item) => (
              <li
                key={item.id}
                class={`add-queue-card${item.status === 'waiting' ? ' add-queue-card-waiting' : ''}`}
              >
                <span class="add-queue-body">
                  <span class="add-queue-name">
                    {item.kind === 'link' && item.url !== undefined
                      ? linkDisplayTitle(item.url)
                      : item.name}
                  </span>
                  {item.status === 'uploading' && item.kind !== 'drive' && (
                    <span class="add-queue-bar">
                      <span
                        class="add-queue-bar-fill"
                        style={{ width: `${item.progress}%` }}
                      />
                    </span>
                  )}
                  <span class="add-queue-status">
                    {item.status === 'waiting' && 'Waiting'}
                    {item.status === 'uploading' && `${item.progress}%`}
                    {item.status === 'done' &&
                      (item.kind === 'drive'
                        ? driveStateText(item.driveMimeType)
                        : 'In your inbox')}
                    {item.status === 'failed' && (item.error ?? 'Failed')}
                  </span>
                  {formatPolicy(queueKind(item)).queueLine !== null && (
                    <span class="add-queue-kept">
                      {formatPolicy(queueKind(item)).queueLine}
                    </span>
                  )}
                </span>
                <KindBadge
                  kind={queueKind(item)}
                  file={{
                    name: item.name,
                    mimeType: item.file?.type ?? item.driveMimeType ?? '',
                  }}
                />
                {item.status === 'failed' && (
                  <button
                    type="button"
                    class="button-link"
                    onClick={() => void runQueue([item])}
                  >
                    Retry
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {queue.length > 0 && (
        <div class="add-context">
          <label for="add-context">
            What is this? <span class="add-context-optional">optional</span>
          </label>
          <textarea
            id="add-context"
            rows={2}
            placeholder={CONTEXT_PLACEHOLDER}
            value={contextText}
            onInput={(e) => setContextText(e.currentTarget.value)}
          />
        </div>
      )}

      {driveNotes.map((note) => (
        <p key={note} class="add-drive-note">
          {note}
        </p>
      ))}

      {message !== null && <p class="add-message">{message}</p>}

      {!online && <p class="offline-reason">{offlineReason('add')}</p>}

      {/* The one button (R-ADD-5): the count in its label, always in the
       * same place above the tabs. It uploads whatever is still waiting
       * (chosen, dropped, photographed or shared files), then opens the
       * "Is that everything?" sheet. Hidden when nothing is waiting: there
       * is nothing to tidy. */}
      {total > 0 && (
        <div class="add-tidy">
          <button
            type="button"
            class="process-button add-tidy-button"
            data-phase={busy ? 'running' : phase}
            data-tour="tidy"
            aria-haspopup={startsRun(phase) ? undefined : 'dialog'}
            disabled={tidyDisabled}
            aria-disabled={tidyDisabled}
            onClick={() => void onTidyUp()}
          >
            <IconSparkle />
            <span aria-live="polite">{tidyLabel}</span>
          </button>
        </div>
      )}
    </section>
  );
}
