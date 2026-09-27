// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me, Vault } from '../src/api.js';
import type { DriveFile } from '../src/drive.js';
import type * as PickerModule from '../src/picker.js';

// #219: the "Start with what you have" step after Building. Same Picker,
// copy path and card wording as Add's "From your Drive" (#217); only the
// route and its own queue rendering are onboarding's.

function driveFile(id: string, name: string, mimeType: string): DriveFile {
  return { id, name, mimeType, parents: ['SOURCE_ID'], path: name };
}

const location = { path: '/onboarding', route: vi.fn() };
const setMe = vi.fn();
const refresh = vi.fn(() => Promise.resolve());
const createVault = vi.fn<() => Promise<Vault>>();
const markTourSeen = vi.fn<(who: Me) => Promise<void>>(() => Promise.resolve());
const endTour = vi.fn();

const getToken = vi.fn(() =>
  Promise.resolve({
    accessToken: 'token-1',
    expiresAt: '2026-09-27T12:00:00.000Z',
    folderId: 'FOLDER_ID',
  }),
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
  vault: null,
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

const vault: Vault = {
  folderId: 'FOLDER_ID',
  inboxFolderId: 'INBOX_ID',
  name: 'Bower',
};

vi.mock('preact-iso', () => ({ useLocation: () => location }));

vi.mock('../src/session.js', () => ({
  useSession: () => ({ me, setMe, refresh }),
}));

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  createVault: () => createVault(),
}));

vi.mock('../src/tour-store.js', () => ({
  endTour: (finished: boolean) => {
    endTour(finished);
  },
  markTourSeen: (who: Me) => markTourSeen(who),
}));

vi.mock('../src/drive.js', () => ({ copyIntoInbox, getToken }));

vi.mock('../src/picker.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PickerModule>();
  realLoadPicker = actual.loadPicker;
  return { ...actual, loadPicker, openFilePicker };
});

const SCRIPT = 'script[src="https://apis.google.com/js/api.js"]';

let root: HTMLElement;

async function mountOnboarding(apiKey: string): Promise<void> {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_API_KEY', apiKey);
  const { Onboarding } = await import('../src/routes/onboarding.js');
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(Onboarding, {}), root);
  });
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (found === undefined) throw new Error(`button ${label} missing`);
  return found;
}

function heading(): string {
  return root.querySelector('h1')?.textContent ?? '';
}

function dots(): number {
  return root.querySelectorAll('.onb-dots span').length;
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

/** Walks Welcome → folder → Building, resolving `createVault` at once, and
 * lands on Building with "Continue" ready to press. */
async function reachBuilding(): Promise<void> {
  await act(() => button('Show me around').click());
  createVault.mockResolvedValueOnce(vault);
  await act(() => button('Make a new Bower folder').click());
  await flush();
}

/** Presses the Drive card with a Picker that answers `response` at once. */
async function pick(response: google.picker.ResponseObject): Promise<void> {
  loadPicker.mockResolvedValueOnce({} as typeof google.picker);
  openFilePicker.mockImplementationOnce((_api, _token, _key, onResult) => {
    onResult(response);
  });
  await act(() => button('Pick files from my Drive').click());
}

afterEach(() => {
  render(null, root);
  root.remove();
  document.querySelectorAll(SCRIPT).forEach((el) => el.remove());
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Onboarding: without a Picker key', () => {
  it("skips the Drive step: Building's Continue goes straight home, six dots", async () => {
    await mountOnboarding('');
    await reachBuilding();
    expect(dots()).toBe(6);

    await act(() => button('Continue').click());
    expect(location.route).toHaveBeenCalledWith('/');
    expect(heading()).not.toBe('Start with what you have');
  });
});

describe('Onboarding: Start with what you have', () => {
  it('shows the step after Building, seven dots, the fourth on', async () => {
    await mountOnboarding('test-key');
    await reachBuilding();

    await act(() => button('Continue').click());
    expect(heading()).toBe('Start with what you have');
    expect(dots()).toBe(7);
    const all = Array.from(root.querySelectorAll('.onb-dots span'));
    expect(all.filter((span) => span.classList.contains('is-on'))).toHaveLength(
      1,
    );
    expect(all.findIndex((span) => span.classList.contains('is-on'))).toBe(3);
  });

  it('"Later" goes to the tour without picking anything', async () => {
    await mountOnboarding('test-key');
    await reachBuilding();
    await act(() => button('Continue').click());

    await act(() => button('Later').click());
    expect(location.route).toHaveBeenCalledWith('/');
    expect(copyIntoInbox).not.toHaveBeenCalled();
  });

  it('picking files copies each into the inbox, one card each, then Continue', async () => {
    await mountOnboarding('test-key');
    await reachBuilding();
    await act(() => button('Continue').click());

    await pick({
      action: 'picked',
      docs: [
        { id: 'A_ID', name: 'Lease.pdf', mimeType: 'application/pdf' },
        { id: 'B_ID', name: 'Warranty.pdf', mimeType: 'application/pdf' },
      ],
    });
    await waitFor(() => copyIntoInbox.mock.calls.length === 2);

    expect(copyIntoInbox.mock.calls).toEqual([
      ['A_ID', 'Lease.pdf', 'INBOX_ID'],
      ['B_ID', 'Warranty.pdf', 'INBOX_ID'],
    ]);
    await waitFor(
      () =>
        root.querySelectorAll('.onb-drive-queue-card').length === 2 &&
        (root.textContent ?? '').includes(
          'Copied from your Drive · the original stays where it was',
        ),
    );

    await waitFor(() => button('Continue') !== undefined);
    await act(() => button('Continue').click());
    expect(location.route).toHaveBeenCalledWith('/');
  });

  it('shows one sentence for a failed copy, Continue still appears', async () => {
    copyIntoInbox.mockRejectedValueOnce(new Error('Drive said no.'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    await mountOnboarding('test-key');
    await reachBuilding();
    await act(() => button('Continue').click());

    await pick({
      action: 'picked',
      docs: [{ id: 'A_ID', name: 'a.pdf', mimeType: 'application/pdf' }],
    });
    await waitFor(() =>
      (root.textContent ?? '').includes(
        'Could not copy this file from your Drive.',
      ),
    );
    expect(() => button('Continue')).not.toThrow();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('leaves out the Bower folder with a sentence', async () => {
    await mountOnboarding('test-key');
    await reachBuilding();
    await act(() => button('Continue').click());

    await pick({
      action: 'picked',
      docs: [{ id: 'FOLDER_ID', name: 'Bower', mimeType: 'x' }],
    });
    await waitFor(() =>
      (root.textContent ?? '').includes('Your Bower folder was left out'),
    );
    expect(copyIntoInbox).not.toHaveBeenCalled();
  });
});
