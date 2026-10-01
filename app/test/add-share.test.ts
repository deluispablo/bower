// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me, Vault } from '../src/api.js';
import { setQueue } from '../src/add-queue-store.js';
import type { DriveFile } from '../src/drive.js';

// #262/M3: the service worker redirects a share to `/add?shared=1` with the
// files waiting in Cache Storage (`share-target.ts`). They must join the
// queue as waiting cards, same as a chosen or dropped file, and never
// upload on their own — only the Tidy up button (which uploads them first) does.
// `/add?shared=failed` (#134) is the service worker reporting that nothing
// usable came through; the page shows one sentence and queues nothing.

const fakeFile: DriveFile = {
  id: 'FILE_ID',
  name: 'shared.txt',
  mimeType: 'text/plain',
  parents: ['FOLDER_ID'],
  path: 'shared.txt',
};

const location = { path: '/add', route: vi.fn() };
const noteEntry: DriveFile = {
  id: 'NOTE_ID',
  name: 'Bower - note.md',
  mimeType: 'text/markdown',
  parents: ['FOLDER_ID'],
  path: '0-Inbox/Bower - note.md',
};
const listFolder = vi.fn<(folderId: string) => Promise<DriveFile[]>>(() =>
  Promise.resolve([noteEntry]),
);
const upload = vi.fn<
  (
    parentId: string,
    file: File,
    onProgress?: (sent: number, total: number) => void,
  ) => Promise<DriveFile>
>(() => Promise.resolve(fakeFile));
const takeSharedFiles = vi.fn<() => Promise<File[]>>(() => Promise.resolve([]));

const vault: Vault = {
  folderId: 'FOLDER_ID',
  inboxFolderId: 'FOLDER_ID',
  name: 'Bower',
};
const me: Me = {
  email: 'you@example.com',
  vault,
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

vi.mock('preact-iso', () => ({ useLocation: () => location }));
vi.mock('../src/session.js', () => ({ useSession: () => ({ me }) }));
vi.mock('../src/online.js', () => ({
  useOnline: () => true,
  offlineReason: () => '',
}));
vi.mock('../src/components/upload-chip.js', () => ({
  UploadNotes: () => null,
  useUploadItems: () => [],
}));
// Add sends files through the durable queue (#768); these tests are about
// Add, so the queue hands each file straight to the `upload` mock.
vi.mock('../src/upload-queue.js', () => ({
  startUploads: () => Promise.resolve('owner'),
  activeItems: () => [],
  uploadQueue: () => ({
    items: () => [],
    subscribe: () => () => undefined,
    retry: () => undefined,
  }),
  uploadThroughQueue: (
    _queue: unknown,
    input: { blob: Blob; name: string; parentId: string },
    onProgress?: (sent: number, total: number) => void,
  ) => upload(input.parentId, new File([input.blob], input.name), onProgress),
}));
vi.mock('../src/drive.js', () => ({
  FOLDER_MIME: 'application/vnd.google-apps.folder',
  INSTRUCTION_APP_PROPERTIES: { bower: 'instruction' },
  listFolder,
  upload,
  createTextFile: vi.fn(() => Promise.resolve(noteEntry)),
  updateFileText: vi.fn(() => Promise.resolve(noteEntry)),
  deleteFile: vi.fn(() => Promise.resolve()),
  getText: vi.fn(() => Promise.resolve('')),
}));
vi.mock('../src/share-target.js', () => ({ takeSharedFiles }));
// #289 added a `useVault()` call to Add (the refresh after a batch's
// worth of uploads). Mocked the same way sibling suites do
// (`layout.test.ts`, `settings-demo.test.ts`): no real VaultProvider
// needed for a plain UI check.
// Add's hint carries the Tidy up button (#320), which reads the run store.
vi.mock('../src/run-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/run-store.js')>()),
  useRun: () => ({
    phase: 'idle',
    tidyUp: vi.fn(),
    openSheet: vi.fn(),
    lastFinished: null,
  }),
}));
vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ files: [], refresh: vi.fn() }),
}));

const { Add, resetAddDraft } = await import('../src/routes/add.js');
const { resetPiles } = await import('../src/pile-store.js');

let root: HTMLElement;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Flushes until `predicate` is true, or fails after `tries` rounds. */
async function waitFor(predicate: () => boolean, tries = 30): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (predicate()) return;
    await flush();
  }
  if (!predicate()) throw new Error('waitFor: condition never became true');
}

function renderAt(search: string): void {
  window.history.pushState({}, '', `/add${search}`);
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Add, {}), root);
  });
}

describe('Add: shared files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    takeSharedFiles.mockImplementation(() => Promise.resolve([]));
    // The queue lives in `add-queue-store.js`, module scope, on purpose
    // (#334): each test starts it empty rather than inheriting rows left
    // by the previous one.
    setQueue([]);
    resetPiles();
    resetAddDraft();
  });

  afterEach(() => {
    void act(() => {
      render(null, root);
    });
    root.remove();
    window.history.pushState({}, '', '/add');
  });

  it('renders a shared file in the new pile and starts uploading it at once (R-ADD-1)', async () => {
    takeSharedFiles.mockImplementation(() =>
      Promise.resolve([new File(['x'], 'photo.jpg', { type: 'image/jpeg' })]),
    );

    renderAt('?shared=1');
    await waitFor(() => root.textContent?.includes('photo') === true);

    await waitFor(() => upload.mock.calls.length > 0);
    expect(root.querySelector('.pile-row')).not.toBeNull();
    expect(root.textContent).not.toContain('Waiting');
    expect(upload).toHaveBeenCalledOnce();
  });

  it('queues nothing when there is nothing shared', async () => {
    renderAt('?shared=1');
    await flush();

    expect(root.querySelector('.pile-row')).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('shows one sentence and queues nothing when the service worker reports a failure', async () => {
    renderAt('?shared=failed');
    await flush();

    expect(root.textContent).toContain(
      'Could not receive the shared files. Try again.',
    );
    expect(root.querySelector('.pile-row')).toBeNull();
    expect(takeSharedFiles).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('shows the same sentence when reading the shared files back throws', async () => {
    takeSharedFiles.mockImplementation(() =>
      Promise.reject(new Error('cache blocked')),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderAt('?shared=1');
    await waitFor(
      () =>
        root.textContent?.includes('Could not receive the shared files') ===
        true,
    );

    expect(root.querySelector('.pile-row')).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(new Error('cache blocked'));
  });
});
