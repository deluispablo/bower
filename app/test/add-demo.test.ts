// @vitest-environment jsdom

/**
 * Add's "From your Drive" door in a demo build (#364, `Demo-Add` board,
 * handover C.10/D.6): shown but greyed with one sentence, instead of
 * hidden the way it is without a Picker key outside the demo. The other
 * doors keep working. `isDemo()` is mocked directly (rather than stubbing
 * `VITE_DEMO` and re-importing `api.ts`) so the real demo module never
 * boots for a plain UI check — the same pattern `settings-demo.test.ts`
 * and `demo-banner.test.ts` use.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../src/api.js';
import type { DriveFile } from '../src/drive.js';

const state = vi.hoisted(() => ({ demo: false }));

const me: Me = {
  email: 'you@example.com',
  vault: { folderId: 'FOLDER_ID', inboxFolderId: 'INBOX_ID', name: 'Bower' },
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

const location = { path: '/add', route: vi.fn() };

// The hint only shows with something pending (#336): one inbox file,
// empty unless a test asks for it.
function inboxFile(name: string): DriveFile {
  return {
    id: `ID_${name}`,
    name,
    mimeType: 'application/pdf',
    parents: ['FOLDER_ID'],
    path: `0-Inbox/${name}`,
  };
}
let vaultFiles: DriveFile[] = [];

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));
vi.mock('preact-iso', () => ({ useLocation: () => location }));
vi.mock('../src/session.js', () => ({ useSession: () => ({ me }) }));
vi.mock('../src/online.js', () => ({
  useOnline: () => true,
  offlineReason: () => 'You are offline.',
}));
vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ files: vaultFiles, refresh: vi.fn(), index: null }),
}));
vi.mock('../src/run-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/run-store.js')>()),
  useRun: () => ({
    phase: 'idle',
    tidyUp: vi.fn(),
    openSheet: vi.fn(),
    lastFinished: null,
  }),
}));
// The camera door (#339) needs a touch device with a real camera; this
// file is about copy, not that rule, so it just shows the door.
vi.mock('../src/add-camera.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/add-camera.js')>()),
  useHasCamera: () => true,
}));

const { Add } = await import('../src/routes/add.js');

const NOT_IN_DEMO_DRIVE = 'Not in the demo. Run your own Bower to use it.';

let root: HTMLElement;

async function mountAdd(): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(Add, {}), root);
  });
}

function driveButtons(): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll('button')).filter(
    (b) => b.textContent?.includes('From your Drive') ?? false,
  );
}

afterEach(() => {
  render(null, root);
  root.remove();
  state.demo = false;
  vaultFiles = [];
});

describe('Add from your Drive outside the demo', () => {
  it('hides the door without a Picker key (unchanged, #217)', async () => {
    state.demo = false;
    await mountAdd();
    expect(driveButtons()).toHaveLength(0);
  });
});

describe('Add from your Drive in a demo build', () => {
  it('shows the door greyed, with the demo sentence (#364)', async () => {
    state.demo = true;
    await mountAdd();
    const buttons = driveButtons();
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
    }
    expect(root.textContent).toContain(NOT_IN_DEMO_DRIVE);
  });

  it('leaves the other doors working', async () => {
    state.demo = true;
    await mountAdd();
    const chooseFiles = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Choose files'),
    );
    expect(chooseFiles?.disabled).toBeFalsy();
  });
});

describe('Add door subtitles per the boards (#489)', () => {
  it('Take a photo and Choose files read the real copy outside the demo', async () => {
    state.demo = false;
    await mountAdd();
    expect(root.textContent).toContain('A receipt, a sign, a page of a book');
    expect(root.textContent).toContain(
      'Photos, PDFs, screenshots, voice memos',
    );
    expect(root.textContent).not.toContain('In the demo it stays in the page');
  });

  it('Take a photo and Choose files read the Demo-Add board in a demo build', async () => {
    state.demo = true;
    await mountAdd();
    expect(root.textContent).toContain('In the demo it stays in the page');
    expect(root.textContent).toContain('Photos, PDFs, screenshots');
    expect(root.textContent).not.toContain('voice memos');
    expect(root.textContent).not.toContain(
      'A receipt, a sign, a page of a book',
    );
  });
});

describe('the Add hint sentence per the Demo-Add board (#489)', () => {
  it('reads the real sentence outside the demo', async () => {
    state.demo = false;
    vaultFiles = [inboxFile('a.pdf'), inboxFile('b.pdf'), inboxFile('c.pdf')];
    await mountAdd();
    expect(root.textContent).toContain('3 things waiting.');
    expect(root.textContent).toContain('Add the whole pile first');
  });

  it("reads the board's recorded-run sentence in a demo build", async () => {
    state.demo = true;
    vaultFiles = [inboxFile('a.pdf'), inboxFile('b.pdf'), inboxFile('c.pdf')];
    await mountAdd();
    expect(root.textContent).toContain('3 things waiting.');
    expect(root.textContent).toContain('Tap Tidy up and watch a recorded run');
    expect(root.textContent).not.toContain('Add the whole pile first');
  });
});
