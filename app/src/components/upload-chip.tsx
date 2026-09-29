/**
 * The upload chip (R-UPL-2, spec §6.15b): the durable queue's face in the
 * shell's `uploadChip` slot (`shell-slots.ts`), which sits where the tidy-up
 * bar does; when both apply the layout gives the slot to the tidy-up bar and
 * the upload state shows in the tidy-up sheet. Three states:
 *
 * - uploading: "Adding 2 files · 64%", gone when the last one is in;
 * - resuming: "Finishing 1 upload from last time" (the queue found files an
 *   earlier visit left);
 * - offline: "2 files wait for a connection" (amber).
 *
 * The chip is `role="status"`. The live region says a fixed sentence that
 * changes with the state, never with the percentage, so it is announced once.
 * `UploadChipSlot` fills the slot; `UploadChipFiller` adds what only the app
 * knows (the signed-in user, the route) and starts the queue.
 * `UploadNotes` is Add's line about the last visit and about closing.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { isDemo } from '../api.js';
import { usesShell } from '../shell-routes.js';
import { useSession } from '../session.js';
import {
  UPLOAD_CLOSE_NOTE,
  UPLOAD_CLOSE_NOTE_BEST_EFFORT,
  activeItems,
  resumedFromLastTime,
  clearUploadQueue,
  startUploads,
  subscribeResumed,
  uploadQueue,
} from '../upload-queue.js';
import type { QueueItem } from '../upload-queue.js';
import { useMediaQuery } from '../use-media-query.js';
import { IconWifi } from './icons.js';
import { useShellSlot } from './shell-slots.js';
import { useTextFieldFocus } from './run-chip.js';
import { useFocusTrap } from './use-focus-trap.js';

import '../styles/upload-chip.css';

export type UploadChipState = 'uploading' | 'resuming' | 'offline';

export interface UploadChipModel {
  state: UploadChipState;
  /** The bold words. */
  title: string;
  /** The muted words after them. */
  detail: string;
  /** The button's accessible name. */
  name: string;
  /** What the live region says: fixed while the state stands. */
  announce: string;
  /** 0 to 100 while sending, `null` when a bar would be false. */
  percent: number | null;
  /** Changes when anything visible does; keeps the slot content stable. */
  signature: string;
}

export interface UploadChipInput {
  items: readonly QueueItem[];
  /** Ids the queue found from an earlier visit. */
  resumed: readonly string[];
  online: boolean;
}

function files(n: number): string {
  return `${n} file${n === 1 ? '' : 's'}`;
}

/** What the chip shows, or `null` when nothing is on its way. */
export function uploadChipModel(
  input: UploadChipInput,
): UploadChipModel | null {
  const active = activeItems(input.items);
  if (active.length === 0) return null;

  const waiting = active.filter(
    (i) => i.error === 'offline' || (!input.online && i.state === 'waiting'),
  );
  if (waiting.length > 0) {
    const n = waiting.length;
    const text = `${files(n)} ${n === 1 ? 'waits' : 'wait'} for a connection`;
    return {
      state: 'offline',
      title: text,
      detail: '',
      name: text,
      announce: text,
      percent: null,
      signature: `offline|${text}`,
    };
  }

  const fromLastTime = active.every((i) => input.resumed.includes(i.id));
  if (fromLastTime) {
    const n = active.length;
    const text = `Finishing ${n} upload${n === 1 ? '' : 's'} from last time`;
    return {
      state: 'resuming',
      title: text,
      detail: '',
      name: text,
      announce: text,
      percent: null,
      signature: `resuming|${text}`,
    };
  }

  const total = active.reduce((sum, i) => sum + i.size, 0);
  const sent = active.reduce((sum, i) => sum + Math.min(i.sent, i.size), 0);
  const percent =
    total > 0 ? Math.min(99, Math.floor((sent / total) * 100)) : 0;
  const lead = `Adding ${files(active.length)}`;
  return {
    state: 'uploading',
    title: lead,
    detail: `${percent}%`,
    name: `Uploading ${files(active.length)} to your inbox, ${percent} percent. Show`,
    announce: lead,
    percent,
    signature: `uploading|${lead}|${percent}`,
  };
}

/** The queue's items, live. */
export function useUploadItems(): QueueItem[] {
  const queue = uploadQueue();
  const [items, setItems] = useState<QueueItem[]>(() => queue.items());
  useEffect(() => {
    const update = (): void => setItems(queue.items());
    update();
    return queue.subscribe(update);
  }, [queue]);
  return items;
}

function useResumed(): string[] {
  const [ids, setIds] = useState<string[]>(() => resumedFromLastTime());
  useEffect(() => {
    const update = (): void => setIds(resumedFromLastTime());
    update();
    return subscribeResumed(update);
  }, []);
  return ids;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  useEffect(() => {
    const on = (): void => setOnline(true);
    const off = (): void => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export interface UploadChipProps {
  model: UploadChipModel;
  onOpen: () => void;
}

export function UploadChip({ model, onOpen }: UploadChipProps): JSX.Element {
  const showLink = model.state === 'uploading';
  return (
    <div
      class={`run-chip upload-chip upload-chip--${model.state}`}
      role="status"
      aria-live="polite"
    >
      <span class="run-chip-announce">{model.announce}</span>
      <button
        type="button"
        class="run-chip-button upload-chip-button"
        aria-label={model.name}
        onClick={onOpen}
      >
        <span key={model.state} class="run-chip-face" aria-hidden="true">
          {model.state === 'offline' ? (
            <span class="run-chip-icon upload-chip-icon">
              <IconWifi />
            </span>
          ) : (
            <span
              class="upload-chip-dot"
              data-moving={model.state === 'uploading' ? 'true' : 'false'}
            />
          )}
          <span class="run-chip-text">
            <strong class="run-chip-title">{model.title}</strong>
            {model.detail !== '' && (
              <span class="run-chip-detail">{model.detail}</span>
            )}
          </span>
          {showLink && <span class="run-chip-see">Show</span>}
        </span>
        {model.percent !== null && (
          <span
            class="upload-chip-bar"
            aria-hidden="true"
            style={{ width: `${model.percent}%` }}
          />
        )}
      </button>
    </div>
  );
}

export interface UploadChipSlotProps {
  /** Opens Add ("Show"). */
  onShow?: () => void;
  /** The screens that carry the uploads themselves (Home's bubble) hide it. */
  hidden?: boolean;
}

/** Fills the shell's `uploadChip` slot from the queue; renders nothing itself. */
export function UploadChipSlot({
  hidden = false,
  onShow,
}: UploadChipSlotProps): null {
  const items = useUploadItems();
  const resumed = useResumed();
  const online = useOnline();
  const model = uploadChipModel({ items, resumed, online });
  const signature = model === null || hidden ? '' : model.signature;
  const content = useMemo(
    () =>
      model === null || hidden ? null : (
        <UploadChip model={model} onOpen={() => onShow?.()} />
      ),
    // `model` is rebuilt on every change; `signature` says when it really did.
    [signature],
  );
  useShellSlot('uploadChip', content);
  return null;
}

/**
 * Mounted once by `RunChipHost`, after start: starts the queue for the
 * signed-in user (R-UPL-1: files left by an earlier visit finish without
 * being picked again) and fills the slot, except on Home (the bird says it
 * there, HOME-UP-1), on routes with no shell, and on a phone while the
 * keyboard is up.
 */
export function UploadChipFiller(): JSX.Element {
  const { status, me } = useSession();
  const { path, route } = useLocation();
  const desktop = useMediaQuery('(min-width: 900px)');
  const typing = useTextFieldFocus();
  const userKey = status === 'signed-in' && !isDemo() ? me?.email : undefined;
  useEffect(() => {
    if (userKey === undefined) return;
    startUploads(userKey).catch((error: unknown) => {
      console.error('The upload queue did not start', error);
    });
  }, [userKey]);
  const hidden =
    path === '/' || !usesShell(path, isDemo()) || (!desktop && typing);
  return <UploadChipSlot hidden={hidden} onShow={() => route('/add')} />;
}

/**
 * Add's notes about uploads: what happened last time (the real count, R-UPL-1)
 * and PILE-6 while something is on its way.
 */
export function UploadNotes(): JSX.Element | null {
  const items = useUploadItems();
  const resumed = useResumed();
  const active = activeItems(items);
  const left = active.filter((i) => resumed.includes(i.id)).length;
  if (active.length === 0) return null;
  return (
    <div class="upload-notes">
      {left > 0 && (
        <p class="upload-note upload-note-resumed" role="status">
          {`${files(left)} did not finish uploading last time. Bower is finishing them now; they stay in their pile.`}
        </p>
      )}
      <p class="upload-note">
        {UPLOAD_CLOSE_NOTE} {UPLOAD_CLOSE_NOTE_BEST_EFFORT}
      </p>
    </div>
  );
}

export interface SignOutUploadsDialogProps {
  /** Files still uploading. */
  count: number;
  onWait: () => void;
  onSignOut: () => void;
}

/**
 * Sign-out with unfinished uploads (R-UPL-4): an alert dialog. "Wait" is the
 * primary button and the answer to Escape; "Sign out anyway" ends the
 * session and clears the queue, because a shared computer must not keep
 * someone's files.
 */
export function SignOutUploadsDialog({
  count,
  onWait,
  onSignOut,
}: SignOutUploadsDialogProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onWait);
  return (
    <div class="signout-scrim">
      <div
        ref={ref}
        class="signout-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="signout-uploads-title"
        aria-describedby="signout-uploads-text"
      >
        <h2 id="signout-uploads-title" class="signout-title">
          {count === 1
            ? '1 file is still uploading'
            : `${count} files are still uploading`}
        </h2>
        <p id="signout-uploads-text" class="signout-text">
          If you sign out now they stop, and this device forgets them. Wait a
          moment, or sign out and add them again later.
        </p>
        <div class="signout-actions">
          <button
            type="button"
            class="settings-button signout-wait"
            onClick={onWait}
          >
            Wait
          </button>
          <button
            type="button"
            class="settings-button settings-button-secondary"
            onClick={onSignOut}
          >
            Sign out anyway
          </button>
        </div>
      </div>
    </div>
  );
}

/** What "Sign out anyway" does, apart from the button (unit tested). */
export async function signOutAnyway(deps: {
  clearQueue: () => Promise<void>;
  signOut: () => Promise<void>;
}): Promise<void> {
  try {
    await deps.clearQueue();
  } catch (error) {
    console.error(error);
  }
  await deps.signOut();
}

/**
 * Sign-out that first asks when files are still uploading. `request` is what
 * the Sign out buttons call; render `dialog` once beside them.
 */
export function useGuardedSignOut(signOut: () => Promise<void>): {
  request: () => void;
  dialog: JSX.Element | null;
} {
  const items = useUploadItems();
  const [asking, setAsking] = useState(false);
  const count = activeItems(items).length;
  useEffect(() => {
    if (asking && count === 0) setAsking(false);
  }, [asking, count]);
  return {
    request: () => {
      if (activeItems(uploadQueue().items()).length > 0) setAsking(true);
      else void signOut();
    },
    dialog:
      asking && count > 0 ? (
        <SignOutUploadsDialog
          count={count}
          onWait={() => setAsking(false)}
          onSignOut={() => {
            void signOutAnyway({
              clearQueue: () => clearUploadQueue(),
              signOut,
            });
          }}
        />
      ) : null,
  };
}
