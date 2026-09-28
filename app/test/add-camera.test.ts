// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me, Vault } from '../src/api.js';
import { hasVideoInput } from '../src/add-camera.js';
import { setQueue } from '../src/add-queue-store.js';
import type { DriveFile } from '../src/drive.js';

// #339 (issue 21.7): the phone's "Take a photo" door only shows on a touch
// device that reports an actual camera; `hasVideoInput` is the plain rule,
// unit-tested directly below. The rest of this file wires it up the way
// `routes/add.tsx` does, with a fake `navigator.mediaDevices`.

describe('hasVideoInput', () => {
  it('is false for an empty device list', () => {
    expect(hasVideoInput([])).toBe(false);
  });

  it('is false when nothing is a videoinput', () => {
    expect(
      hasVideoInput([{ kind: 'audioinput' }, { kind: 'audiooutput' }]),
    ).toBe(false);
  });

  it('is true once a videoinput is in the list', () => {
    expect(
      hasVideoInput([{ kind: 'audioinput' }, { kind: 'videoinput' }]),
    ).toBe(true);
  });
});

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
const location = { path: '/add', route: vi.fn() };
const listFolder = vi.fn<(folderId: string) => Promise<DriveFile[]>>(() =>
  Promise.resolve([]),
);

vi.mock('preact-iso', () => ({ useLocation: () => location }));
vi.mock('../src/session.js', () => ({ useSession: () => ({ me }) }));
vi.mock('../src/online.js', () => ({
  useOnline: () => true,
  offlineReason: () => '',
}));
vi.mock('../src/drive.js', () => ({
  listFolder,
  upload: vi.fn(),
  createTextFile: vi.fn(),
}));
vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ files: [], refresh: vi.fn() }),
}));
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

const { Add } = await import('../src/routes/add.js');

let root: HTMLElement;

/** Marks `window` as a touch device (`'ontouchstart' in window`), the way
 * `isTouchDevice()` reads it, and stubs `navigator.mediaDevices` with
 * `enumerateDevices()` resolving to `devices`. `undefined` leaves
 * `mediaDevices` itself missing, as a browser without the API would. */
function stubDevices(devices: { kind: string }[] | undefined): void {
  Object.defineProperty(window, 'ontouchstart', {
    value: null,
    configurable: true,
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    value:
      devices === undefined
        ? undefined
        : { enumerateDevices: () => Promise.resolve(devices) },
    configurable: true,
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function cameraDoor(): HTMLButtonElement | undefined {
  const doors = root.querySelector('.add-doors');
  return Array.from(doors?.querySelectorAll('button') ?? []).find((b) =>
    (b.textContent ?? '').startsWith('Take a photo'),
  );
}

describe('Add: the camera door', () => {
  beforeEach(() => {
    setQueue([]);
    root = document.createElement('div');
    document.body.append(root);
  });

  afterEach(() => {
    void act(() => {
      render(null, root);
    });
    root.remove();
    Reflect.deleteProperty(window, 'ontouchstart');
    Reflect.deleteProperty(navigator, 'mediaDevices');
    vi.clearAllMocks();
  });

  // jsdom's own `window` always answers `'ontouchstart' in window` with
  // `true` (an inherited IDL attribute, present whether or not a real
  // touch device would define it), so the "not a touch device at all"
  // branch of `isTouchDevice()` is not reachable from here; the other
  // three rows below still prove the rule out fully.

  it('stays hidden on a touch device with no camera', async () => {
    stubDevices([{ kind: 'audioinput' }]);
    void act(() => {
      render(h(Add, {}), root);
    });
    await flush();
    expect(cameraDoor()).toBeUndefined();
  });

  it('stays hidden without a MediaDevices API at all', async () => {
    stubDevices(undefined);
    void act(() => {
      render(h(Add, {}), root);
    });
    await flush();
    expect(cameraDoor()).toBeUndefined();
  });

  it('shows on a touch device that reports a camera', async () => {
    stubDevices([{ kind: 'audioinput' }, { kind: 'videoinput' }]);
    void act(() => {
      render(h(Add, {}), root);
    });
    await flush();
    const door = cameraDoor();
    expect(door).toBeDefined();
    expect(door?.textContent).toContain('A receipt, a sign, a page of a book');
  });

  it('opens the capture input when pressed, and the photo joins the queue like any file', async () => {
    stubDevices([{ kind: 'videoinput' }]);
    void act(() => {
      render(h(Add, {}), root);
    });
    await flush();
    const door = cameraDoor();
    if (door === undefined) throw new Error('Take a photo door missing');
    const input = root.querySelector(
      'input[type="file"][capture]',
    ) as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    door.click();
    expect(click).toHaveBeenCalledOnce();

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file] });
    void act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(root.querySelector('.add-queue-name')?.textContent).toBe(
      'photo.jpg',
    );
  });
});
