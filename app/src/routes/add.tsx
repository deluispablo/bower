import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';

import { listFolder, upload } from '../drive.js';
import { getPref } from '../prefs.js';
import { useRun } from '../run-store.js';
import { useSession } from '../session.js';
import { takeSharedFiles } from '../share-target.js';
import { uniqueName } from '../upload-names.js';

type FileStatus = 'waiting' | 'uploading' | 'done' | 'failed';

interface SelectedFile {
  id: string;
  file: File;
  /** Possibly renamed to stay unique in the inbox. */
  name: string;
  status: FileStatus;
  /** 0–100. */
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

export function Add() {
  const { me } = useSession();
  const { process } = useRun();
  const { route } = useLocation();
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<SelectedFile[]>([]);
  const sharedHandledRef = useRef(false);

  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

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
  // files waiting in Cache Storage.
  useEffect(() => {
    if (sharedHandledRef.current) return;
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('shared') !== '1') {
      return;
    }
    sharedHandledRef.current = true;
    takeSharedFiles()
      .then((shared) => {
        if (shared.length === 0) return;
        const created = addFiles(shared);
        void processFiles(created);
      })
      .catch((err: unknown) => {
        console.error(err);
      });
    // Runs once, right after mount.
  }, []);

  function addFiles(newFiles: File[]): SelectedFile[] {
    const names = new Set(existingNames);
    const created: SelectedFile[] = newFiles.map((file) => {
      const name = uniqueName(file.name, names);
      names.add(name);
      return {
        id: crypto.randomUUID(),
        file,
        name,
        status: 'waiting',
        progress: 0,
      };
    });
    setExistingNames(names);
    setFiles((prev) => [...prev, ...created]);
    return created;
  }

  function updateFile(id: string, patch: Partial<SelectedFile>): void {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function uploadOne(
    entry: SelectedFile,
    folderId: string,
  ): Promise<boolean> {
    updateFile(entry.id, {
      status: 'uploading',
      progress: 0,
      error: undefined,
    });
    try {
      await upload(
        folderId,
        withName(entry.file, entry.name),
        (sent, total) => {
          updateFile(entry.id, {
            progress: total > 0 ? Math.round((sent / total) * 100) : 100,
          });
        },
      );
      updateFile(entry.id, { status: 'done', progress: 100 });
      return true;
    } catch (err) {
      console.error(err);
      updateFile(entry.id, {
        status: 'failed',
        error: 'Could not upload this file.',
      });
      return false;
    }
  }

  /** After a run's worth of uploads: process (unless disabled) and go home.
   * The run itself (queued, done, quota, failed…) is the header button's
   * job from here; this screen only reports the upload. */
  function finish(): void {
    if (getPref('autoProcessOnAdd')) {
      void process();
    }
    setMessage('Files added. Bower is on it.');
    setTimeout(() => route('/'), 900);
  }

  /** Uploads whatever in `list` is not already `done`, then `finish()`s if,
   * across every file added so far, all of them now are. */
  async function processFiles(list: SelectedFile[]): Promise<void> {
    if (inboxFolderId === null || list.length === 0) return;
    setBusy(true);
    setMessage(null);
    for (const entry of list) {
      if (entry.status === 'done') continue;
      await uploadOne(entry, inboxFolderId);
    }
    setBusy(false);
    if (filesRef.current.length === 0) return;
    if (!filesRef.current.every((f) => f.status === 'done')) return;
    finish();
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

  const touch = isTouchDevice();

  return (
    <section class="add-screen">
      <h1>Add</h1>
      <p>Bring something in from your device.</p>

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

      <div class="add-actions">
        <button
          type="button"
          class="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose files
        </button>
        {touch && (
          <button
            type="button"
            class="button"
            onClick={() => cameraInputRef.current?.click()}
          >
            Take a photo
          </button>
        )}
      </div>

      {!touch && (
        <div
          class={`add-dropzone${dragOver ? ' add-dropzone-active' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          Drop files here
        </div>
      )}

      {files.length > 0 && (
        <ul class="add-file-list">
          {files.map((entry) => (
            <li key={entry.id} class="add-file-row">
              <span class="add-file-name">{entry.name}</span>
              <span class="add-file-status">
                {entry.status === 'waiting' && 'Waiting'}
                {entry.status === 'uploading' &&
                  `Uploading ${entry.progress} %`}
                {entry.status === 'done' && 'Done'}
                {entry.status === 'failed' && (entry.error ?? 'Failed')}
              </span>
              {entry.status === 'failed' && (
                <button
                  type="button"
                  class="button-link"
                  onClick={() => void processFiles([entry])}
                >
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {message !== null && <p class="add-message">{message}</p>}

      <button
        type="button"
        class="button"
        disabled={busy || inboxFolderId === null || files.length === 0}
        onClick={() => void processFiles(files)}
      >
        {busy ? 'Adding…' : 'Add to Bower'}
      </button>
    </section>
  );
}
