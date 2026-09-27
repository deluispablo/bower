// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../src/api.js';
import type { DriveFile, DriveToken } from '../src/drive.js';
import type * as PickerModule from '../src/picker.js';

// #217: Add's "From your Drive" button. The Picker library, Drive and the
// session are faked; `filesFromPickerResponse` and, unless a test says
// otherwise, `loadPicker` are the real ones.

const FOLDER = 'application/vnd.google-apps.folder';
const SCRIPT = 'script[src="https://apis.google.com/js/api.js"]';

function driveFile(id: string, name: string, mimeType: string): DriveFile {
  return { id, name, mimeType, parents: ['SOURCE_ID'], path: name };
}

const location = { path: '/add', route: vi.fn() };
const state = { online: true };
const token: DriveToken = {
  accessToken: 'token-1',
  expiresAt: '2026-09-27T12:00:00.000Z',
  folderId: 'FOLDER_ID',
};

const getToken = vi.fn(() => Promise.resolve(token));
const listFolder = vi.fn<(folderId: string) => Promise<DriveFile[]>>(() =>
  Promise.resolve([]),
);
const copyIntoInbox = vi.fn<
  (id: string, name: string, inboxId: string) => Promise<DriveFile>
>((id, name) => Promise.resolve(driveFile(`${id}_COPY`, name, 'x')));
const openFilePicker =
  vi.fn<
    (
      api: typeof google.picker,
      accessToken: string,
      apiKey: string,
      onResult: (data: google.picker.ResponseObject) => void,
    ) => void
  >();
let realLoadPicker: typeof PickerModule.loadPicker = () =>
  Promise.reject(new Error('not loaded'));
const loadPicker = vi.fn(() => realLoadPicker());

const me: Me = {
  email: 'you@example.com',
  vault: { folderId: 'FOLDER_ID', inboxFolderId: 'INBOX_ID', name: 'Bower' },
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

vi.mock('preact-iso', () => ({ useLocation: () => location }));
vi.mock('../src/session.js', () => ({ useSession: () => ({ me }) }));
vi.mock('../src/online.js', () => ({
  useOnline: () => state.online,
  offlineReason: () => 'You are offline.',
}));
vi.mock('../src/drive.js', () => ({
  FOLDER_MIME: 'application/vnd.google-apps.folder',
  copyIntoInbox,
  createTextFile: vi.fn(),
  getToken,
  listFolder,
  upload: vi.fn(),
}));
vi.mock('../src/picker.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PickerModule>();
  realLoadPicker = actual.loadPicker;
  return { ...actual, loadPicker, openFilePicker };
});

let root: HTMLElement;

async function mountAdd(apiKey: string): Promise<void> {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_API_KEY', apiKey);
  const { Add } = await import('../src/routes/add.js');
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(Add, {}), root);
  });
}

function driveButton(): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll('button')).find(
    (b) => b.textContent === 'From your Drive',
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(predicate: () => boolean, tries = 40): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error('waitFor: condition never became true');
}

/** Presses the button with a Picker that answers `response` at once. */
async function pick(response: google.picker.ResponseObject): Promise<void> {
  loadPicker.mockResolvedValueOnce({} as typeof google.picker);
  openFilePicker.mockImplementationOnce((_api, _token, _key, onResult) => {
    onResult(response);
  });
  const button = driveButton();
  if (button === undefined) throw new Error('From your Drive missing');
  await act(() => button.click());
}

afterEach(() => {
  render(null, root);
  root.remove();
  document.querySelectorAll(SCRIPT).forEach((el) => el.remove());
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  state.online = true;
});

describe('Add from your Drive', () => {
  it('hides the button without a Picker key', async () => {
    await mountAdd('');
    expect(driveButton()).toBeUndefined();
  });

  it('loads the Picker script only after the button is pressed', async () => {
    await mountAdd('test-key');
    expect(document.querySelector(SCRIPT)).toBeNull();

    const button = driveButton();
    if (button === undefined) throw new Error('From your Drive missing');
    await act(() => button.click());

    expect(document.querySelector(SCRIPT)).not.toBeNull();
  });

  it('is disabled offline, with the reason line', async () => {
    state.online = false;
    await mountAdd('test-key');
    expect(driveButton()?.disabled).toBe(true);
    expect(root.textContent).toContain('You are offline.');
  });

  it('copies each picked file into the inbox, one card each', async () => {
    await mountAdd('test-key');
    await pick({
      action: 'picked',
      docs: [
        { id: 'A_ID', name: 'Lease.pdf', mimeType: 'application/pdf' },
        { id: 'B_ID', name: 'Warranty.pdf', mimeType: 'application/pdf' },
        { id: 'C_ID', name: 'IMG_1.jpg', mimeType: 'image/jpeg' },
      ],
    });
    await waitFor(() => copyIntoInbox.mock.calls.length === 3);

    expect(copyIntoInbox.mock.calls).toEqual([
      ['A_ID', 'Lease.pdf', 'INBOX_ID'],
      ['B_ID', 'Warranty.pdf', 'INBOX_ID'],
      ['C_ID', 'IMG_1.jpg', 'INBOX_ID'],
    ]);
    await waitFor(
      () =>
        root.querySelectorAll('.add-queue-card').length === 3 &&
        (root.textContent ?? '').includes(
          'Copied from your Drive · the original stays where it was',
        ),
    );
  });

  it('copies a folder’s own files, at most 50, and says so when more', async () => {
    const folder = [
      driveFile('SUB_ID', 'Receipts', FOLDER),
      ...Array.from({ length: 51 }, (_, i) =>
        driveFile(`F${i}_ID`, `scan-${i}.pdf`, 'application/pdf'),
      ),
    ];
    // The inbox listing on mount stays empty.
    listFolder.mockImplementation((id) =>
      Promise.resolve(id === 'DIR_ID' ? folder : []),
    );
    await mountAdd('test-key');
    await pick({
      action: 'picked',
      docs: [{ id: 'DIR_ID', name: 'Tax 2025', mimeType: FOLDER }],
    });
    await waitFor(() => copyIntoInbox.mock.calls.length === 50, 200);

    expect(listFolder).toHaveBeenCalledWith('DIR_ID');
    expect(copyIntoInbox.mock.calls.map(([id]) => id)).not.toContain('SUB_ID');
    expect(root.textContent).toContain(
      'Tax 2025 has more than 50 files: the first 50 were added.',
    );
  });

  it('leaves out the Bower folder with a sentence', async () => {
    await mountAdd('test-key');
    await pick({
      action: 'picked',
      docs: [{ id: 'FOLDER_ID', name: 'Bower', mimeType: FOLDER }],
    });
    await waitFor(() =>
      (root.textContent ?? '').includes('Your Bower folder was left out'),
    );
    expect(listFolder).not.toHaveBeenCalledWith('FOLDER_ID');
    expect(copyIntoInbox).not.toHaveBeenCalled();
  });

  it('shows one sentence for a failed copy and copies the rest', async () => {
    copyIntoInbox.mockRejectedValueOnce(new Error('Drive said no.'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    await mountAdd('test-key');
    await pick({
      action: 'picked',
      docs: [
        { id: 'A_ID', name: 'a.pdf', mimeType: 'application/pdf' },
        { id: 'B_ID', name: 'b.pdf', mimeType: 'application/pdf' },
      ],
    });
    await waitFor(() => copyIntoInbox.mock.calls.length === 2);
    await waitFor(() =>
      (root.textContent ?? '').includes(
        'Could not copy this file from your Drive.',
      ),
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
