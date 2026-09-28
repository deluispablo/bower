import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';

import { linkNoteName } from '../add.js';
import { Bird } from '../components/bird.js';
import {
  IconCamera,
  IconChevronRight,
  IconDrive,
  IconFile,
  IconNote,
} from '../components/icons.js';
import { ProcessButton } from '../components/process-button.js';
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
import { useSession } from '../session.js';
import { takeSharedFiles } from '../share-target.js';
import { uniqueName } from '../upload-names.js';
import { useVault } from '../vault-store.js';

import '../styles/add.css';
import '../styles/app-file-banner.css';

/** The phone top bar's title (spec §14): a stable element, so it never
 * refills the shell's `crumb` slot on a re-render (`shell-slots.ts`). */
const CRUMB = <h1 class="topbar-title">Add</h1>;

/** Without a Picker key the "From your Drive" button is hidden, as the
 * onboarding folder picker is. */
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? '';

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

type QueueStatus = 'waiting' | 'uploading' | 'done' | 'failed';

interface QueueItem {
  id: string;
  /** A picked/dropped/shared file, a pasted link's note, or a file picked
   * in the user's Drive and copied into the inbox. */
  kind: 'file' | 'link' | 'drive';
  /** Set for `kind: 'file'`. */
  file?: File;
  /** The original's Drive id, set for `kind: 'drive'`. */
  driveId?: string;
  /** The original's MIME type, set for `kind: 'drive'`: decides whether it
   * is copied as it is or exported first (`exportPlanFor`, #218). */
  driveMimeType?: string;
  /** The pasted URL, kept for `kind: 'link'` so a failed save can retry. */
  url?: string;
  /** Possibly renamed to stay unique in the inbox. */
  name: string;
  status: QueueStatus;
  /** 0–100; always 100 once `done` (a link note has no progress of its own). */
  progress: number;
  error?: string;
}

function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && 'ontouchstart' in window;
}

/** `file` renamed to `name`, or `file` itself when the name did not change. */
function withName(file: File, name: string): File {
  return name === file.name
    ? file
    : new File([file], name, { type: file.type });
}

/** The queue card's status line for a `kind: 'drive'` item, once done or
 * while it is being copied or exported (#218). */
function driveStatusText(mimeType: string | undefined, done: boolean): string {
  const plan = exportPlanFor(mimeType ?? '');
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

export function Add() {
  const { me } = useSession();
  const { route } = useLocation();
  const { index, refresh } = useVault();
  const online = useOnline();
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
  const queueRef = useRef<QueueItem[]>([]);
  const sharedHandledRef = useRef(false);
  const driveNotesRef = useRef<string[]>([]);

  const [queue, setQueue] = useState<QueueItem[]>([]);
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

  // The single writer for `queue`: keeps `queueRef.current` exactly in
  // step with every change, rather than catching up on the next render (a
  // plain `useEffect` used to do that, one render behind). `runQueue`
  // reads `queueRef.current` right after its last `await`, in the same
  // tick as the last item's final status change, so a render behind was
  // exactly one render too many -- the demo's uploads settle over a plain
  // microtask with no real I/O, so that render never caught up in time and
  // `finish()` (the vault refresh included) never ran (#289).
  function setQueueSynced(next: QueueItem[]): void {
    queueRef.current = next;
    setQueue(next);
  }

  function addFiles(newFiles: File[]): QueueItem[] {
    const created: QueueItem[] = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      kind: 'file',
      file,
      name: claimName(file.name),
      status: 'waiting',
      progress: 0,
    }));
    setQueueSynced([...queueRef.current, ...created]);
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
    setQueueSynced([...queueRef.current, ...created]);
    return created;
  }

  function updateItem(id: string, patch: Partial<QueueItem>): void {
    setQueueSynced(
      queueRef.current.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }

  async function runOne(item: QueueItem, folderId: string): Promise<boolean> {
    updateItem(item.id, { status: 'uploading', progress: 0, error: undefined });
    try {
      if (item.kind === 'file' && item.file) {
        await upload(
          folderId,
          withName(item.file, item.name),
          (sent, total) => {
            updateItem(item.id, {
              progress: total > 0 ? Math.round((sent / total) * 100) : 100,
            });
          },
        );
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

  /** After a batch's worth of uploads: report the add and go home. Add only
   * ever fills the inbox; the run itself is started by a tap on Tidy up
   * (the hint below, Home's Inbox card, the switcher command), never by
   * adding. */
  function finish(): void {
    setMessage('Added to your inbox.');
    // The vault index otherwise only catches up on its next background
    // revalidation, so the switcher's Tidy up count and Home's Inbox card would
    // read stale until then (#289).
    void refresh();
    // A sentence about the last Drive pick stays on screen to be read.
    if (driveNotesRef.current.length > 0) return;
    setTimeout(() => route('/'), 900);
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
    if (queueRef.current.length === 0) return;
    if (!queueRef.current.every((it) => it.status === 'done')) return;
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
    driveNotesRef.current = notes;
    setDriveNotes(notes);
    if (files.length === 0) return;
    await runQueue(addDriveItems(files));
  }

  /** Loads the Picker (only now, never before the button is pressed) and
   * opens it over the user's Drive. */
  async function onFromDrive(): Promise<void> {
    driveNotesRef.current = [];
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
    setQueueSynced([...queueRef.current, item]);
    setLinkUrl('');
    void runQueue([item]);
  }

  const touch = isTouchDevice();
  const linkDisabled = inboxFolderId === null || !online;
  const driveDisabled = inboxFolderId === null || !online || pickerOpening;

  return (
    <section class="add-screen">
      <h1 class="screen-title">Add</h1>

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

      {/* Phone: a list of doors, no drop square (spec C.6). Desktop hides
       * this list and shows the drop zone below instead
       * (`add.css`'s 900 px breakpoint, the same one `layout.css` uses for
       * the sidebar). Both live in the DOM at once so neither needs its own
       * copy of the file inputs or the disabled/online rules. */}
      <div class="add-doors">
        {touch && (
          <button
            type="button"
            class="add-door"
            onClick={() => cameraInputRef.current?.click()}
          >
            <span class="add-door-icon">
              <IconCamera />
            </span>
            <span class="add-door-text">
              <b>Take a photo</b>
              <span>A receipt, a sign, a page of a book</span>
            </span>
            <IconChevronRight />
          </button>
        )}
        <button
          type="button"
          class="add-door"
          onClick={() => fileInputRef.current?.click()}
        >
          <span class="add-door-icon">
            <IconFile />
          </span>
          <span class="add-door-text">
            <b>Choose files</b>
            <span>Photos, PDFs, screenshots, voice memos</span>
          </span>
          <IconChevronRight />
        </button>
        {GOOGLE_API_KEY !== '' && (
          <button
            type="button"
            class="add-door"
            disabled={driveDisabled}
            aria-disabled={driveDisabled}
            onClick={() => void onFromDrive()}
          >
            <span class="add-door-icon">
              <IconDrive />
            </span>
            <span class="add-door-text">
              <b>From your Drive</b>
              <span>Copies a file in; the original stays put</span>
            </span>
            <IconChevronRight />
          </button>
        )}
      </div>

      <div
        class={`add-dropzone${dragOver ? ' add-dropzone-active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div class="add-dropzone-bird">
          <Bird state={dragOver ? 'shiny' : 'peeking'} size={64} />
        </div>
        <p class="add-dropzone-title">Drop anything here</p>
        <p class="add-dropzone-hint">Photos, PDFs, screenshots, links.</p>
        <div class="add-actions">
          <button
            type="button"
            class="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose files
          </button>
          {GOOGLE_API_KEY !== '' && (
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
        {GOOGLE_API_KEY !== '' && (
          <p class="add-drive-note">
            Docs become Markdown, Sheets a table, Slides a PDF. Everything else
            is copied as it is.
          </p>
        )}
      </div>

      <div class="add-field">
        <label for="add-link">Or paste a link</label>
        <div class="add-field-row">
          <input
            id="add-link"
            type="url"
            placeholder="https://"
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

      <p class="add-share-line">
        Or share to Bower from any app: it lands here too.
      </p>

      {queue.length > 0 && (
        <ul class="add-queue">
          {queue.map((item) => (
            <li
              key={item.id}
              class={`add-queue-card${item.status === 'waiting' ? ' add-queue-card-waiting' : ''}`}
            >
              <span class="add-queue-icon" aria-hidden="true">
                {item.status === 'done' && (
                  <span class="add-queue-check">✓</span>
                )}
                {item.status === 'uploading' && (
                  <Bird state="tidying" size={30} />
                )}
                {item.status === 'waiting' && <IconNote />}
                {item.status === 'failed' && (
                  <span class="add-queue-check add-queue-check-failed">!</span>
                )}
              </span>
              <span class="add-queue-body">
                <span class="add-queue-name">{item.name}</span>
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
                  {item.status === 'uploading' &&
                    (item.kind === 'drive'
                      ? driveStatusText(item.driveMimeType, false)
                      : `${item.progress} %`)}
                  {item.status === 'done' &&
                    (item.kind === 'drive'
                      ? driveStatusText(item.driveMimeType, true)
                      : 'Added to your inbox')}
                  {item.status === 'failed' && (item.error ?? 'Failed')}
                </span>
              </span>
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
      )}

      {driveNotes.map((note) => (
        <p key={note} class="add-drive-note">
          {note}
        </p>
      ))}

      <div class="app-file-banner" role="note">
        <p>
          <strong>This only fills your inbox.</strong> Add as much as you like,
          then tap Tidy up once: Bower does better work with a pile than with
          one thing at a time.
        </p>
        <ProcessButton />
      </div>

      {message !== null && <p class="add-message">{message}</p>}

      {!online && <p class="offline-reason">{offlineReason('add')}</p>}

      {/* The submit belongs to the queue, not to the empty screen (#333):
       * a link or a Drive pick already runs itself, so this is only for
       * files chosen, dropped or photographed, still `waiting`. */}
      {queue.length > 0 && (
        <button
          type="button"
          class="button"
          disabled={busy || inboxFolderId === null || !online}
          aria-disabled={busy || inboxFolderId === null || !online}
          onClick={() => void runQueue(queue)}
        >
          {busy ? 'Adding…' : 'Add to Bower'}
        </button>
      )}
    </section>
  );
}
