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

const state = vi.hoisted(() => ({ demo: false }));

const me: Me = {
  email: 'you@example.com',
  vault: { folderId: 'FOLDER_ID', inboxFolderId: 'INBOX_ID', name: 'Bower' },
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

const location = { path: '/add', route: vi.fn() };

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
  useVault: () => ({ files: [], refresh: vi.fn(), index: null }),
}));
vi.mock('../src/run-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/run-store.js')>()),
  useRun: () => ({ phase: 'idle', tidyUp: vi.fn(), openSheet: vi.fn() }),
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
