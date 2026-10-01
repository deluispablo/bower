import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { Bird } from '../components/bird.js';
import { useMediaQuery } from '../use-media-query.js';
import { useHasCamera } from '../add-camera.js';
import {
  clearFiledAfterRun,
  followUploads,
  getQueue,
  setQueue,
  uploadPileId,
  useAddQueue,
  type QueueItem,
} from '../add-queue-store.js';
import { linkDisplayTitle, linkNoteName } from '../add.js';
import { isDemo } from '../api.js';
import { UploadNotes, useUploadItems } from '../components/upload-chip.js';
import {
  IconCamera,
  IconDrive,
  IconFile,
  IconLink,
  IconSparkle,
} from '../components/icons.js';
import { Card } from '../components/card.js';
import { Composer } from '../components/composer.js';
import { DoorButton } from '../components/door-button.js';
import { MoreButton } from '../components/more-button.js';
import { NoteMenu } from '../components/note-menu.js';
import { PageHeader } from '../components/page-header.js';
import { kindLabel } from '../meta-line.js';
import {
  PileRows,
  PileSheet,
  PILE_NOTE_LABEL,
  PILE_NOTE_PLACEHOLDER,
  PILE_SAVED_LINE,
  addedFromElsewhere,
  inboxNameSet,
  kindOfName,
  pileNames,
  pileTime,
  rowState,
  splitPiles,
  thingsText,
  uploadingCount,
  useDebouncedSave,
  type PileRow,
} from '../components/pile-sheet.js';
import { labelFor, startsRun } from '../components/process-button.js';
import { useShellSlot } from '../components/shell-slots.js';
import {
  copyOrExportIntoInbox,
  createTextFile,
  deleteFile,
  exportPlanFor,
  FOLDER_MIME,
  getText,
  getToken,
  listFolder,
  upload,
  type DriveFile,
} from '../drive.js';
import { inboxCount, inboxTotal } from '../inbox-count.js';
import { offlineReason, useOnline } from '../online.js';
import {
  adoptPile,
  appliesTo,
  attachToPile,
  closePile,
  getPiles,
  openPile,
  parsePileNote,
  removeFromPile,
  setPileText,
  startPile,
  usePiles,
  type Pile,
} from '../pile-store.js';
import {
  filesFromPickerResponse,
  loadPicker,
  openFilePicker,
  type PickedItem,
} from '../picker.js';
import { runKey, useRun } from '../run-store.js';
import { isContextNote, processedKind } from '../run-progress.js';
import { pendingCount } from '../navigation.js';
import { useSession } from '../session.js';
import { takeSharedFiles } from '../share-target.js';
import { uniqueName } from '../upload-names.js';
import {
  activeItems,
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

/**
 * The desktop drop line with its bird (R-BIRD-11). The bird mounts only from
 * 900 px, where the line shows: mounted, it counts in the presence store and
 * hides the perch (rule 1), so it must not mount while hidden by CSS.
 */
export function AddDropRow({
  listening = false,
}: {
  /** Dictation is on: the bird shows the Listening pose (R-BIRD-10). */
  listening?: boolean;
}): JSX.Element {
  const wide = useMediaQuery('(min-width: 900px)');
  return (
    <div class="add-drop-row">
      {wide && (
        <div class="add-drop-bird" aria-hidden="true">
          <Bird state={listening ? 'listening' : 'looking'} size={44} />
        </div>
      )}
      <p class="add-drop-line">{DROP_LINE}</p>
    </div>
  );
}

/** PILE-14, the drop line under the desktop title. */
const DROP_LINE =
  'Drop files anywhere on this page: they join the pile you are making.';

/** PILE-6, the foot of the new pile card. While uploads run, `UploadNotes`
 * says it (with the phone caveat), so the card does not repeat it. */
const CLOSE_NOTE =
  'Uploads carry on if you switch tabs. If you close Bower, they finish next time you open it.';

/** What the person typed in "What is this pile?" before its first file was
 * attached. Module level, so leaving Add and coming back keeps it. */
let draftText = '';

/** Forgets the note box's text. Tests only. */
export function resetAddDraft(): void {
  draftText = '';
}

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

/** `file` renamed to `name`, or `file` itself when the name did not change. */
function withName(file: File, name: string): File {
  return name === file.name
    ? file
    : new File([file], name, { type: file.type });
}

/** The row's line for a finished `kind: 'drive'` item (#334, issue 21.2): a
 * plain copy only says where it came from; an export also says what it was
 * saved as (#218). */
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

/** S-AD-11: what each kind of Drive file becomes (K-30, C-4). */
export const DOORS_NOTE =
  'Docs become notes, Sheets a table, Slides a PDF. Everything else is copied as it is.';

/** S-AD-12: the Paste a link box. */
export const LINK_PLACEHOLDER = 'Paste a link';
export const LINK_SAVE = 'Save the link';
export const LINK_ERROR =
  'That does not look like a link. Check it and try again.';

/** S-AD-4: "4 things, all in your inbox" / "4 things · 1 uploading". */
export function pileCountLine(things: number, uploading: number): string {
  return uploading > 0
    ? `${thingsText(things)} · ${uploading} uploading`
    : `${thingsText(things)}, all in your inbox`;
}

/** S-AD-15: a waiting pile's meta, kinds in words (K-14): "4 things · PDF,
 * Spreadsheet, Photo · 11:54". */
export function waitingMeta(pile: Pile, uploading: number): string {
  const kinds = [
    ...new Set(
      pile.items.map((item) => kindLabel({ name: item.name, mimeType: '' })),
    ),
  ].slice(0, 4);
  const when =
    uploading > 0 ? `${uploading} uploading` : pileTime(pile.createdAt);
  return [thingsText(pile.items.length), kinds.join(', '), when]
    .filter((part) => part !== '')
    .join(' · ');
}

/** Follows the durable upload queue for the life of the app, so a file of a
 * pile that lands while Add is closed still rewrites its pile's note
 * (R-PILE-1). Started again after piles were read back, so a file the last
 * visit left unfinished finds its pile. */
let stopFollowing: (() => void) | null = null;
function followPileUploads(): void {
  if (isDemo()) return;
  stopFollowing?.();
  stopFollowing = followUploads(uploadQueue());
}

/** The words a waiting pile's card shows for its note. */
function noteLine(pile: Pile): string {
  return pile.text.trim();
}

export function Add() {
  const { me } = useSession();
  const { index, files, refresh, keepRule, status } = useVault();
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
  const noteRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const sharedHandledRef = useRef(false);

  // The queue itself lives in `add-queue-store.js`, outside this component,
  // so it survives navigating away and back within the session (#334):
  // `queue` here is just this render's snapshot. Piles live in
  // `pile-store.js`, and the durable uploads in `upload-queue.js`.
  const queue = useAddQueue();
  const piles = usePiles();
  const uploads = useUploadItems();
  // Names taken in the inbox, kept synchronously: several files chosen at
  // once must each get their own name before any of them renders.
  const takenNames = useRef(new Set<string>());
  const [dragOver, setDragOver] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pickerOpening, setPickerOpening] = useState(false);
  const [driveNotes, setDriveNotes] = useState<string[]>([]);
  const [shareError, setShareError] = useState<string | null>(null);
  const [draft, setDraft] = useState(draftText);
  const [sheetPileId, setSheetPileId] = useState<string | null>(null);
  /** File names any context note in the inbox lists, once read (R-PILE-3);
   * `null` until the first read, so nothing shows as "from elsewhere" early. */
  const [noted, setNoted] = useState<Set<string> | null>(null);

  useShellSlot('crumb', CRUMB);

  // The ⋯ (E-11, kind `add`): in the phone bar's `actions` slot, and next to
  // the desktop h1 through PageHeader.
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = (): void => setMenuOpen((was) => !was);
  const actionsContent = useMemo(
    () => <MoreButton expanded={menuOpen} onClick={toggleMenu} name="Add" />,
    [menuOpen],
  );
  useShellSlot('actions', actionsContent);

  // #493: once a tidy-up this session finishes `done`, the rows it just
  // filed are stale — Home already says "All tidy" by then.
  // `clearFiledAfterRun` is the single source of truth for which run this
  // queue has already caught up with, so this fires safely even if Add was
  // not mounted when the run actually finished.
  const { lastFinished, phase, tidyUp, openSheet } = useRun();
  const tidyUpRef = useRef(tidyUp);
  tidyUpRef.current = tidyUp;
  useEffect(() => {
    if (lastFinished === null || lastFinished.state !== 'done') return;
    if (clearFiledAfterRun(runKey(lastFinished))) setMessage(null);
  }, [lastFinished]);

  // The note box saves into the open pile's context note as the person types
  // (debounced 1 s, and on blur). Declared before the leave effect below, so
  // its own cleanup (the last save) runs first.
  const saver = useDebouncedSave((text) => {
    const open = openPile();
    if (open !== undefined) void setPileText(open.id, text);
  });

  // R-PILE-2: leaving Add closes the open pile: its "From now on…" lines are
  // kept once, and its note is written for the last time.
  const leaveRef = useRef({ refresh, keepRule });
  leaveRef.current = { refresh, keepRule };
  useEffect(
    () => () => {
      const open = openPile();
      if (open === undefined) return;
      const { refresh: refreshVault, keepRule: keep } = leaveRef.current;
      void closePile(open.id, keep).then(() => refreshVault());
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
        for (const entry of entries) takenNames.current.add(entry.name);
      })
      .catch((err: unknown) => {
        console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, [inboxFolderId]);

  // R-PILE-3: the waiting piles come from the inbox listing (its context
  // notes with `pile:`), never from device storage. Each note is read once
  // per change of its own; the store adopts the piles it does not know.
  const readNotes = useRef(new Map<string, string>());
  const noteNames = useRef(new Map<string, string[]>());
  useEffect(() => {
    if (inboxFolderId === null || status === 'loading') return;
    let cancelled = false;
    const present = new Map<string, DriveFile>();
    const notes: DriveFile[] = [];
    for (const file of files) {
      if (file.path !== `0-Inbox/${file.name}`) continue;
      present.set(file.name, file);
      if (isContextNote(file.path)) notes.push(file);
    }
    void (async () => {
      let adopted = false;
      for (const note of notes) {
        const seen = readNotes.current.get(note.id);
        if (seen !== undefined && seen === (note.modifiedTime ?? '')) continue;
        try {
          const text = await getText(note.id);
          if (cancelled) return;
          readNotes.current.set(note.id, note.modifiedTime ?? '');
          const fields = parsePileNote(text);
          if (fields === null) {
            noteNames.current.set(note.id, appliesTo(text));
            continue;
          }
          noteNames.current.set(note.id, fields.names);
          if (adoptPile(inboxFolderId, note, fields, present) !== undefined) {
            adopted = true;
          }
        } catch (err) {
          console.error(err);
        }
      }
      if (cancelled) return;
      const ids = new Set(notes.map((note) => note.id));
      for (const id of [...noteNames.current.keys()]) {
        if (!ids.has(id)) noteNames.current.delete(id);
      }
      const next = new Set([...noteNames.current.values()].flat());
      // Unchanged names keep the same set, so an effect that runs on every
      // render (an unstable `files`) cannot loop.
      setNoted((prev) =>
        prev !== null &&
        prev.size === next.size &&
        [...next].every((name) => prev.has(name))
          ? prev
          : next,
      );
      if (adopted) followPileUploads();
    })();
    return () => {
      cancelled = true;
    };
  }, [files, inboxFolderId, status]);

  // Files of a pile that land while Add is closed still rewrite its note.
  useEffect(() => {
    followPileUploads();
  }, []);

  // "Show" on the upload chip opens Add with `?pile=<id>`: that pile's card
  // (the open one, or a waiting one once the store has it) is brought into
  // view, once. Without an id, the pile with uploads is.
  const shownPile = useRef<string | null>(null);
  useEffect(() => {
    const pileParam =
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('pile');
    if (pileParam === null) {
      if (getPiles().some((pile) => uploadingCount(pile) > 0)) {
        cardRef.current?.scrollIntoView?.({ block: 'start' });
      }
      return;
    }
    if (shownPile.current === pileParam) return;
    const card = [...document.querySelectorAll('[data-pile-id]')].find(
      (el) => el.getAttribute('data-pile-id') === pileParam,
    );
    if (card === undefined) return;
    shownPile.current = pileParam;
    card.scrollIntoView?.({ block: 'start' });
  }, [piles]);

  // The note box starts empty again once its pile closed (tidy-up, another
  // pile started).
  const openId = openPile()?.id ?? null;
  const lastOpenId = useRef(openId);
  useEffect(() => {
    if (lastOpenId.current !== null && openId === null) {
      draftText = '';
      setDraft('');
    }
    lastOpenId.current = openId;
  }, [openId]);

  // Web Share Target: the service worker redirected here with the shared
  // files waiting in Cache Storage. They join the pile being made and start
  // uploading at once (R-ADD-1).
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
    const unique = uniqueName(preferred, takenNames.current);
    takenNames.current.add(unique);
    return unique;
  }

  /** The pile a new file joins: `explicit` (the pile sheet's "Add more"),
   * else the one being made, else a new one (R-PILE-1: its note is written
   * with the first file). */
  function pileIdForNew(explicit?: string): string | null {
    if (explicit !== undefined) return explicit;
    if (inboxFolderId === null) return null;
    const open = openPile();
    if (open !== undefined) return open.id;
    const started = startPile(inboxFolderId);
    if (draftText.trim() !== '') void setPileText(started.id, draftText);
    return started.id;
  }

  // `setQueue` (`add-queue-store.js`) is the single writer for the queue:
  // it updates the module-level array synchronously, so `getQueue()`
  // right after it is never a render behind, and hands each row that joined
  // a pile to the pile store.
  function addFiles(newFiles: File[], pileId?: string): void {
    const joined = pileIdForNew(pileId);
    if (joined === null) return;
    const created: QueueItem[] = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      kind: 'file',
      file,
      name: claimName(file.name),
      status: 'waiting',
      progress: 0,
      pileId: joined,
    }));
    setQueue([...getQueue(), ...created]);
    void runQueue(created);
  }

  function addDriveItems(picked: PickedItem[]): QueueItem[] {
    const joined = pileIdForNew();
    if (joined === null) return [];
    const created: QueueItem[] = picked.map((item) => ({
      id: crypto.randomUUID(),
      kind: 'drive',
      driveId: item.id,
      driveMimeType: item.mimeType,
      name: claimName(item.name),
      status: 'waiting',
      progress: 0,
      pileId: joined,
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
          const landed = await uploadThroughQueue(
            uploadQueue(),
            {
              blob: item.file,
              name: item.name,
              type: item.file.type,
              pileId: uploadPileId(item),
              parentId: folderId,
            },
            onProgress,
          );
          updateItem(item.id, { fileId: landed.fileId });
        }
      } else if (item.kind === 'link' && item.url !== undefined) {
        const created = await createTextFile(folderId, item.name, item.url);
        updateItem(item.id, { fileId: created.id });
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

  /** Runs whatever in `list` is not already `done`, then has the vault
   * listing catch up, so the switcher's Tidy up count and Home's Inbox card
   * do not read stale (#289). Stays on Add (#421): adding is meant to take
   * the whole pile before a tidy-up. */
  async function runQueue(list: QueueItem[]): Promise<void> {
    if (inboxFolderId === null || list.length === 0) return;
    for (const item of list) {
      if (item.status === 'done') continue;
      await runOne(item, inboxFolderId);
    }
    void refresh();
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
    const picked = expanded.filter((item) => {
      if (exportPlanFor(item.mimeType).action !== 'skip') return true;
      notes.push(
        `${item.name} is a Google Drawing or Form: there is no format to save it as, so it was left out.`,
      );
      return false;
    });
    setDriveNotes(notes);
    if (picked.length === 0) return;
    await runQueue(addDriveItems(picked));
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

  function onDrop(event: JSX.TargetedDragEvent<HTMLElement>): void {
    event.preventDefault();
    setDragOver(false);
    const dropped = event.dataTransfer?.files;
    if (dropped && dropped.length > 0) addFiles(Array.from(dropped));
  }

  function onDragOver(event: JSX.TargetedDragEvent<HTMLElement>): void {
    event.preventDefault();
    setDragOver(true);
  }

  function onSaveLink(value: string = linkUrl): void {
    const trimmed = value.trim();
    const name = linkNoteName(trimmed, new Date());
    if (name === null) {
      setLinkError(LINK_ERROR);
      return;
    }
    const joined = pileIdForNew();
    if (joined === null) return;
    setLinkError(null);
    const item: QueueItem = {
      id: crypto.randomUUID(),
      kind: 'link',
      url: trimmed,
      name: claimName(name),
      status: 'waiting',
      progress: 0,
      pileId: joined,
    };
    setQueue([...getQueue(), item]);
    // #493: the field clears and Save greys out again — a second press on
    // a still-full field was re-saving the same link as "… (2).md".
    setLinkUrl('');
    void runQueue([item]);
  }

  function retry(name: string, pileId: string): void {
    const row = getQueue().find(
      (item) => item.name === name && item.pileId === pileId,
    );
    if (row !== undefined && row.status === 'failed') {
      void runQueue([row]);
      return;
    }
    uploadQueue().retry();
  }

  /** The inbox file behind a pile item: its own id, or the listing's. */
  function fileIdOf(name: string, known: string | undefined): string | null {
    if (known !== undefined) return known;
    return files.find((f) => f.path === `0-Inbox/${name}`)?.id ?? null;
  }

  /** Takes one file out of its pile and sends it to the Bin in Drive. */
  async function removeItem(pileId: string, name: string): Promise<void> {
    const pile = getPiles().find((p) => p.id === pileId);
    const item = pile?.items.find((i) => i.name === name);
    if (item === undefined) return;
    setQueue(
      getQueue().filter((row) => !(row.pileId === pileId && row.name === name)),
    );
    const id = fileIdOf(name, item.fileId);
    await removeFromPile(pileId, name);
    if (id !== null) {
      try {
        await deleteFile(id);
      } catch (err) {
        console.error(err);
        setMessage('Could not remove that file from your inbox. Try again.');
      }
    }
    void refresh();
  }

  /** R-PILE-10: a pile's files and note go to Drive's Bin (`deleteFile`
   * only trashes). Resolves `false` when some file could not be removed;
   * those stay in the pile. */
  async function removePile(pileId: string): Promise<boolean> {
    const pile = getPiles().find((p) => p.id === pileId);
    if (pile === undefined) return true;
    setQueue(getQueue().filter((row) => row.pileId !== pileId));
    let ok = true;
    for (const item of [...pile.items]) {
      const id = fileIdOf(item.name, item.fileId);
      try {
        if (id !== null) await deleteFile(id);
      } catch (err) {
        console.error(err);
        ok = false;
        continue;
      }
      await removeFromPile(pileId, item.name);
    }
    void refresh();
    return ok;
  }

  /** "Start another pile": the open pile closes and waits, with its note. */
  async function startAnother(): Promise<void> {
    saver.flush();
    const open = openPile();
    draftText = '';
    setDraft('');
    if (open !== undefined) await closePile(open.id, keepRule);
    void refresh();
  }

  /** R-PILE-4: "Say what they are" opens a new pile with the files no pile
   * names; the note box takes focus. */
  async function sayWhatTheyAre(things: readonly DriveFile[]): Promise<void> {
    if (inboxFolderId === null || things.length === 0) return;
    saver.flush();
    const current = openPile();
    if (current !== undefined && current.items.length > 0) {
      await closePile(current.id, keepRule);
    }
    draftText = '';
    setDraft('');
    const pile = openPile() ?? startPile(inboxFolderId);
    noteRef.current?.focus();
    for (const thing of things) {
      await attachToPile(pile.id, {
        name: thing.name,
        fileId: thing.id,
        state: 'done',
      });
    }
  }

  const { open, waiting } = splitPiles(piles, inboxNameSet(files));
  const loading = status === 'loading';
  // The inbox's own count: the same number Home's card and the "Is that
  // everything?" sheet show (R-ADD-2).
  const total = inboxTotal(inboxCount(files, loading));
  const stillUploading = [...(open === undefined ? [] : [open]), ...waiting]
    .map(uploadingCount)
    .reduce((sum, n) => sum + n, 0);
  const uploadsActive = activeItems(uploads).length > 0;
  const linkDisabled = inboxFolderId === null || !online;
  const driveShown = GOOGLE_API_KEY !== '' || isDemo();
  const driveDisabled =
    isDemo() || inboxFolderId === null || !online || pickerOpening;

  const elsewhere =
    noted === null
      ? []
      : addedFromElsewhere(
          files.filter(
            (file) =>
              file.path === `0-Inbox/${file.name}` &&
              pendingCount([file]) === 1 &&
              processedKind(file.path, undefined) === 'file',
          ),
          new Set([...pileNames(piles), ...noted]),
        );

  /** A pile's rows: its own items, with the progress and the connection
   * laid over them. */
  function rowsFor(pile: Pile): PileRow[] {
    return pile.items.map((item) => {
      const row = queue.find(
        (q) => q.name === item.name && q.pileId === pile.id,
      );
      const upload = uploads.find(
        (u) => u.name === item.name && u.pileId === pile.id,
      );
      const percent =
        row?.progress ??
        (upload !== undefined && upload.size > 0
          ? Math.round((upload.sent / upload.size) * 100)
          : 0);
      const kind = row === undefined ? kindOfName(item.name) : queueKind(row);
      const state = rowState({
        state: item.state,
        online,
        offlineError: upload?.error === 'offline',
        percent,
      });
      return {
        name: item.name,
        label:
          row?.kind === 'link' && row.url !== undefined
            ? linkDisplayTitle(row.url)
            : item.name,
        kind,
        state,
        percent,
        ...(row?.kind === 'drive'
          ? { note: driveStateText(row.driveMimeType) }
          : {}),
        ...(row !== undefined && row.kind !== 'file' && row.error !== undefined
          ? { error: row.error }
          : {}),
      };
    });
  }

  /** The one button: asks the run store for the "Is that everything?"
   * confirmation (or reopens the working sheet while a run is going). The
   * note box is saved first; the run store closes and flushes every open
   * pile before it starts (R-PILE-7). */
  function onTidyUp(): void {
    saver.flush();
    if (!startsRun(phase)) {
      openSheet();
      return;
    }
    tidyUpRef.current();
  }
  const tidyDisabled = phase === 'starting' || !online;
  const tidyLabel = startsRun(phase)
    ? loading
      ? 'Tidy up'
      : `Tidy up ${thingsText(total)}`
    : labelFor(phase);
  const running = !startsRun(phase);

  const openItems = open?.items ?? [];
  const openUploading = open === undefined ? 0 : uploadingCount(open);
  const sheetPile =
    sheetPileId === null
      ? undefined
      : piles.find((pile) => pile.id === sheetPileId);

  return (
    <section
      class={`add-screen${dragOver ? ' add-screen-drop' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <div class="add-column">
        <PageHeader
          title="Add"
          kind="tab"
          more={{ expanded: menuOpen, onClick: toggleMenu, name: 'Add' }}
        />
        {menuOpen && (
          <NoteMenu
            kind="add"
            inboxPath="0-Inbox"
            driveIds={inboxFolderId === null ? {} : { inbox: inboxFolderId }}
            onClose={() => setMenuOpen(false)}
          />
        )}
        <AddDropRow listening={dictating} />

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

        <div ref={cardRef} data-pile-id={openPile()?.id}>
          <Card variant="accent" class="pile-card-new">
            <div class="pile-card-new-head">
              <h2 class="pile-card-title">New pile</h2>
              <p class="pile-card-count">
                {openItems.length === 0
                  ? 'Add files or links, and say what they are'
                  : pileCountLine(openItems.length, openUploading)}
              </p>
            </div>

            <div class="add-context" onFocusOut={() => saver.flush()}>
              <label class="add-context-label" for="add-context">
                {PILE_NOTE_LABEL}{' '}
                <span class="add-context-optional">optional</span>
              </label>
              <Composer
                id="add-context"
                mode="save"
                rows={3}
                inputRef={noteRef}
                label={PILE_NOTE_LABEL}
                placeholder={PILE_NOTE_PLACEHOLDER}
                value={draft}
                onChange={(next) => {
                  draftText = next;
                  setDraft(next);
                  saver.schedule(next);
                }}
                onCommit={(value) => {
                  saver.schedule(value);
                  saver.flush();
                }}
                onListening={setDictating}
              />
              {(draft.trim() !== '' || openItems.length > 0) && (
                <p class="pile-saved">{PILE_SAVED_LINE}</p>
              )}
            </div>

            {open !== undefined && openItems.length > 0 && (
              <PileRows
                rows={rowsFor(open)}
                onRemove={(name) => void removeItem(open.id, name)}
                onRetry={(name) => retry(name, open.id)}
              />
            )}
            <div class="add-doors">
              {hasCamera && (
                <DoorButton
                  label="Photo"
                  name="Take a photo"
                  icon={<IconCamera />}
                  disabled={inboxFolderId === null}
                  onClick={() => cameraInputRef.current?.click()}
                />
              )}
              <DoorButton
                label="Files"
                name="Choose files"
                icon={<IconFile />}
                disabled={inboxFolderId === null}
                onClick={() => fileInputRef.current?.click()}
              />
              {driveShown && (
                <DoorButton
                  label="Drive"
                  name="From your Drive"
                  icon={<IconDrive />}
                  disabled={driveDisabled}
                  onClick={() => void onFromDrive()}
                />
              )}
              <DoorButton
                label="Link"
                name="Paste a link"
                icon={<IconLink />}
                expanded={linkOpen}
                disabled={linkDisabled}
                onClick={() => setLinkOpen(!linkOpen)}
              />
            </div>
            <p class="add-note">{DOORS_NOTE}</p>
            {isDemo() && <p class="add-note">{NOT_IN_DEMO_DRIVE}</p>}

            {linkOpen && (
              <Composer
                id="add-link"
                class="add-link"
                mode="send"
                rows={1}
                inputType="url"
                label="Link address"
                placeholder={LINK_PLACEHOLDER}
                commitLabel={LINK_SAVE}
                value={linkUrl}
                disabled={linkDisabled}
                autoFocus
                invalid={linkError !== null}
                error={linkError}
                onChange={(next) => {
                  setLinkUrl(next);
                  if (linkError !== null) setLinkError(null);
                }}
                onCommit={(value) => onSaveLink(value)}
              />
            )}

            {driveNotes.map((note) => (
              <p key={note} class="add-note">
                {note}
              </p>
            ))}
            {message !== null && <p class="add-field-error">{message}</p>}
            {!online && <p class="offline-reason">{offlineReason('add')}</p>}

            {open !== undefined && openItems.length > 0 && (
              <button
                type="button"
                class="button-link pile-another"
                onClick={() => void startAnother()}
              >
                Start another pile
              </button>
            )}
            {!uploadsActive && <p class="add-note">{CLOSE_NOTE}</p>}
          </Card>
        </div>

        {waiting.length > 0 && (
          <section class="pile-waiting" aria-labelledby="pile-waiting-title">
            <h2 id="pile-waiting-title" class="pile-waiting-title">
              Waiting for the tidy-up
            </h2>
            {!loading && (
              <p class="pile-waiting-count">
                {thingsText(total)} in your inbox
              </p>
            )}
            <ul class="pile-list">
              {waiting.map((pile) => {
                const note = noteLine(pile);
                return (
                  <li key={pile.id} data-pile-id={pile.id}>
                    <button
                      type="button"
                      class="card pile-card-waiting"
                      onClick={() => setSheetPileId(pile.id)}
                    >
                      <span
                        class={`pile-card-note${note === '' ? ' pile-card-none' : ''}`}
                      >
                        {note === '' ? 'No note' : note}
                      </span>
                      <span class="pile-card-meta">
                        {waitingMeta(pile, uploadingCount(pile))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {elsewhere.length > 0 && (
          <section
            class="pile-elsewhere"
            aria-labelledby="pile-elsewhere-title"
          >
            <h2 id="pile-elsewhere-title" class="pile-waiting-title">
              Added from elsewhere
            </h2>
            <Card class="pile-card-elsewhere">
              <span class="pile-card-meta">{thingsText(elsewhere.length)}</span>
              <button
                type="button"
                class="button-link pile-say"
                onClick={() => void sayWhatTheyAre(elsewhere)}
              >
                Say what they are
              </button>
            </Card>
          </section>
        )}

        {/* The one filled button on Add (R-ADD-0, D33): the count in its
         * label, pinned under the column. Hidden when nothing is waiting:
         * there is nothing to tidy. */}
        {total > 0 && (
          <div class="add-tidy">
            <button
              type="button"
              class="process-button add-tidy-button"
              data-phase={phase}
              data-tour="tidy"
              aria-haspopup={startsRun(phase) ? undefined : 'dialog'}
              aria-busy={loading}
              disabled={tidyDisabled}
              aria-disabled={tidyDisabled}
              onClick={onTidyUp}
            >
              <IconSparkle />
              <span aria-live="polite">{tidyLabel}</span>
            </button>
            {stillUploading > 0 && (
              <p class="add-tidy-note">
                {`${stillUploading} still uploading will wait for the next tidy-up`}
              </p>
            )}
          </div>
        )}
      </div>

      {sheetPile !== undefined && (
        <PileSheet
          pile={sheetPile}
          rows={rowsFor(sheetPile)}
          running={running}
          onText={(text) => void setPileText(sheetPile.id, text)}
          onAddFiles={(picked) => addFiles(picked, sheetPile.id)}
          onRemoveItem={(name) => void removeItem(sheetPile.id, name)}
          onRetry={(name) => retry(name, sheetPile.id)}
          onRemovePile={() => removePile(sheetPile.id)}
          onClose={() => setSheetPileId(null)}
        />
      )}
    </section>
  );
}
