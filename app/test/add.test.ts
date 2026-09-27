// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me, Vault } from '../src/api.js';
import { linkNoteName } from '../src/add.js';
import type { DriveFile } from '../src/drive.js';

describe('linkNoteName', () => {
  it('names the note after the host and the given date and time', () => {
    const now = new Date(2026, 8, 27, 9, 5); // 2026-09-27 09:05 local
    expect(linkNoteName('https://example.com/page', now)).toBe(
      'Link - example.com 2026-09-27 0905.md',
    );
  });

  it('drops a leading www. from the host', () => {
    const now = new Date(2026, 0, 1, 0, 0);
    expect(linkNoteName('https://www.example.com', now)).toBe(
      'Link - example.com 2026-01-01 0000.md',
    );
  });

  it('pads the month, day, hour and minute', () => {
    const now = new Date(2026, 0, 5, 3, 7);
    expect(linkNoteName('http://example.com', now)).toBe(
      'Link - example.com 2026-01-05 0307.md',
    );
  });

  it('accepts http as well as https', () => {
    const now = new Date(2026, 8, 27, 12, 0);
    expect(linkNoteName('http://example.com', now)).toBe(
      'Link - example.com 2026-09-27 1200.md',
    );
  });

  it('keeps a subdomain that is not www', () => {
    const now = new Date(2026, 8, 27, 12, 0);
    expect(linkNoteName('https://news.example.com/x', now)).toBe(
      'Link - news.example.com 2026-09-27 1200.md',
    );
  });

  it('rejects an empty string', () => {
    expect(linkNoteName('', new Date())).toBeNull();
  });

  it('rejects a string that is not a URL at all', () => {
    expect(linkNoteName('not a link', new Date())).toBeNull();
  });

  it('rejects a non-http(s) scheme', () => {
    expect(linkNoteName('mailto:you@example.com', new Date())).toBeNull();
    expect(linkNoteName('javascript:alert(1)', new Date())).toBeNull();
    expect(linkNoteName('ftp://example.com/file', new Date())).toBeNull();
  });
});

// #208: Add only ever fills the inbox. Uploading resolves without starting
// a run — there is no `autoProcessOnAdd` left to call `process()` for, and
// `Add` no longer even reads `run-store.js` (rendered here with no
// `RunProvider` in the tree at all: `useRun()` would throw if it were still
// called).
const fakeFile: DriveFile = {
  id: 'FILE_ID',
  name: 'a.txt',
  mimeType: 'text/plain',
  parents: ['FOLDER_ID'],
  path: 'a.txt',
};

const location = { path: '/add', route: vi.fn() };
const listFolder = vi.fn<(folderId: string) => Promise<DriveFile[]>>(() =>
  Promise.resolve([]),
);
const upload = vi.fn<
  (
    parentId: string,
    file: File,
    onProgress?: (sent: number, total: number) => void,
  ) => Promise<DriveFile>
>(() => Promise.resolve(fakeFile));
const createTextFile = vi.fn<
  (parentId: string, name: string, content: string) => Promise<DriveFile>
>(() => Promise.resolve(fakeFile));

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
vi.mock('../src/drive.js', () => ({
  listFolder,
  upload,
  createTextFile,
}));
// #289 added a `useVault()` call to Add (the refresh after a batch's
// worth of uploads). Mocked the same way sibling suites do
// (`layout.test.ts`, `settings-demo.test.ts`): no real VaultProvider
// needed for a plain UI check.
vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ refresh: vi.fn() }),
}));

const { Add } = await import('../src/routes/add.js');

let root: HTMLElement;

function dropFiles(files: File[]): void {
  const zone = root.querySelector('.add-dropzone');
  if (zone === null) throw new Error('dropzone missing');
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  void act(() => {
    zone.dispatchEvent(event);
  });
}

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

describe('Add', () => {
  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(h(Add, {}), root);
    });
  });

  afterEach(() => {
    void act(() => {
      render(null, root);
    });
    root.remove();
    vi.clearAllMocks();
  });

  it('never mentions the removed "Tidy up right after adding" switch', () => {
    expect(root.textContent).not.toContain('Tidy up right after adding');
  });

  it('shows the amber card saying Add only fills the inbox', () => {
    const banner = root.querySelector('.app-file-banner');
    expect(banner?.textContent).toContain('This only fills your inbox.');
    expect(banner?.textContent).toContain(
      'Bower does better work with a pile than with one thing at a time.',
    );
  });

  it('uploading files resolves without starting a run', async () => {
    dropFiles([
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
      new File(['c'], 'c.txt', { type: 'text/plain' }),
    ]);
    await flush();

    const addButton = Array.from(root.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Add to Bower'),
    );
    if (addButton === undefined) {
      throw new Error('Add to Bower button missing');
    }
    void act(() => addButton.click());
    // Every upload resolves and the button goes back to its idle label —
    // the whole batch settled with nothing throwing and no run started
    // (nothing here reads `run-store.js`; `useRun()` would throw outside a
    // `RunProvider`, which this test never wraps `Add` in).
    await waitFor(() => (addButton.textContent ?? '') === 'Add to Bower');

    expect(upload).toHaveBeenCalledTimes(3);
  });
});
