// @vitest-environment jsdom

import { Fragment, h, render } from 'preact';
import type { ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { buildTree } from '../src/navigation.js';
import { pickerFolders } from '../src/move-request.js';
import { currentToast, dismissToast } from '../src/toast-store.js';
import { buildVaultIndex } from '../src/vault-index.js';
import type { VaultIndex } from '../src/vault-index.js';

import { OverlayHost } from '../src/components/overlay.js';
import { resetOverlayQueue } from '../src/overlay-queue.js';

const mocks = vi.hoisted(() => ({
  createTextFile: vi.fn(),
  deleteFile: vi.fn(),
  process: vi.fn(),
  refresh: vi.fn(),
  index: null as VaultIndex | null,
}));

vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  createTextFile: mocks.createTextFile,
  deleteFile: mocks.deleteFile,
}));
vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({ index: mocks.index, refresh: mocks.refresh }),
}));
vi.mock('../src/session.js', () => ({
  useSession: () => ({ me: { vault: { inboxFolderId: 'INBOX_ID' } } }),
}));
vi.mock('../src/run-store.js', () => ({
  useRun: () => ({ phase: 'idle', process: mocks.process }),
}));

const { FolderChoice, openMoveTo } =
  await import('../src/components/folder-picker.js');

function folder(path: string): DriveFile {
  return {
    id: `id-${path}`,
    name: path.slice(path.lastIndexOf('/') + 1),
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['FOLDER_ID'],
    path,
  };
}

const INDEX = buildVaultIndex([
  folder('0-Inbox'),
  folder('1-Projects'),
  folder('1-Projects/Flat hunt'),
  folder('2-Areas'),
  folder('2-Areas/Garden'),
  folder('2-Areas/Home'),
  folder('3-Resources'),
  folder('4-Archives'),
]);

const SUBJECT = {
  path: '2-Areas/Home/Lease agreement 2026.pdf',
  isFolder: false,
};
const NAME = 'Lease agreement 2026';

let root: HTMLDivElement;

function mount(vnode: ComponentChild): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Fragment, null, vnode, h(OverlayHost, null)), root);
  });
}

function button(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  if (found === undefined) throw new Error(`button "${text}" missing`);
  return found;
}

function radios(): HTMLButtonElement[] {
  return [
    ...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  ];
}

function radio(name: string): HTMLButtonElement {
  const found = radios().find(
    (r) => r.querySelector('.folder-picker-name')?.textContent === name,
  );
  if (found === undefined) throw new Error(`radio "${name}" missing`);
  return found;
}

function click(el: Element): void {
  void act(() => {
    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.createTextFile.mockReset().mockResolvedValue({ id: 'REQUEST_ID' });
  mocks.deleteFile.mockReset().mockResolvedValue(undefined);
  mocks.process.mockReset().mockResolvedValue(true);
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  mocks.index = INDEX;
  dismissToast();
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  resetOverlayQueue();
  document.body.replaceChildren();
});

function choice(onChoose = vi.fn(), chosen = ''): void {
  mount(
    h(FolderChoice, {
      subject: SUBJECT,
      folders: pickerFolders(buildTree(INDEX), SUBJECT),
      chosen,
      onChoose,
    }),
  );
}

describe('FolderChoice', () => {
  it('is the tree alone: no "Find a folder" field, roots with their discs (#909)', () => {
    choice();
    expect(document.body.querySelector('input')).toBeNull();
    expect(document.body.textContent).not.toContain('Find a folder');
    expect(
      [...document.body.querySelectorAll('.folder-mark')].map((m) =>
        m.getAttribute('data-kind'),
      ),
    ).toEqual(['projects', 'areas', 'resources', 'archives']);
    expect(document.body.querySelector('.tree-guide')).not.toBeNull();
  });

  it('offers no Inbox, offers Archives, and opens the current folder in place', () => {
    choice();
    const names = radios().map(
      (r) => r.querySelector('.folder-picker-name')?.textContent,
    );
    expect(names).not.toContain('Inbox');
    expect(names).toContain('Archives');
    expect(names).toContain('Garden');
    expect(names).toContain('Home');
    expect(names).not.toContain('Flat hunt');
  });

  it('disables the current folder, ticks the chosen one and reports a choice', () => {
    const onChoose = vi.fn();
    choice(onChoose, '2-Areas/Garden');
    expect(radio('Home').disabled).toBe(true);
    expect(radio('Garden').getAttribute('aria-checked')).toBe('true');
    expect(radio('Resources').getAttribute('aria-checked')).toBe('false');
    click(radio('Resources'));
    expect(onChoose).toHaveBeenCalledWith('3-Resources');
  });

  it('shows a folder being moved dimmed under its parent, not on offer (PF-Move, #950 F-19)', () => {
    const subject = { path: '2-Areas/Garden', isFolder: true };
    mount(
      h(FolderChoice, {
        subject,
        folders: pickerFolders(buildTree(INDEX), subject),
        chosen: '',
        onChoose: vi.fn(),
      }),
    );
    expect(radio('Garden').disabled).toBe(true);
    expect(
      radio('Garden')
        .closest('.folder-picker-row')
        ?.classList.contains('folder-picker-current'),
    ).toBe(true);
    expect(radio('Areas').disabled).toBe(false);
    expect(radio('Home').disabled).toBe(false);
  });

  it('expands a landmark with its chevron', () => {
    choice();
    const row = radio('Projects').closest('.folder-picker-row');
    click(row?.querySelector('.tree-chevron') as Element);
    expect(radio('Flat hunt')).toBeTruthy();
  });

  // #920 T-4: the chevron is out of the radiogroup's roles; the radio
  // opens and closes its folder with the arrows instead.
  it('keeps the chevron out of the roles and expands with ArrowRight', () => {
    choice();
    const projects = radio('Projects');
    const chevron = projects
      .closest('.folder-picker-row')
      ?.querySelector('.tree-chevron');
    expect(chevron?.getAttribute('aria-hidden')).toBe('true');
    void act(() => {
      projects.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });
    expect(radio('Flat hunt')).toBeTruthy();
  });
});

describe('Move to… (#909, PF-Move)', () => {
  function moveTo(): void {
    mount(null);
    void act(() => {
      openMoveTo({ subject: SUBJECT, name: NAME });
    });
  }

  it('titles the sheet "Move to…" with its line and "Move here" off until a choice', () => {
    moveTo();
    expect(document.body.querySelector('h2')?.textContent).toBe('Move to…');
    expect(document.body.textContent).toContain(
      `Pick a folder for ${NAME}. Bower moves it at the next tidy-up.`,
    );
    expect(
      document.body.querySelector('[aria-label="Close Move to"]'),
    ).not.toBeNull();
    expect(button('Move here').disabled).toBe(true);
    click(radio('Resources'));
    expect(document.body.textContent).toContain('Moving to Resources');
    expect(button('Move here').disabled).toBe(false);
  });

  it('"Move here" queues the move and confirms by a toast with Undo', async () => {
    moveTo();
    click(radio('Garden'));
    click(button('Move here'));
    await flush();
    expect(mocks.createTextFile).toHaveBeenCalledTimes(1);
    const [parent, , content] = mocks.createTextFile.mock.calls[0] as string[];
    expect(parent).toBe('INBOX_ID');
    expect(content).toContain(
      'Move “Lease agreement 2026” (2-Areas/Home/Lease agreement 2026.pdf) to 2-Areas/Garden.',
    );
    // One Undo (L-20, F-22): the page's "Moving to …" line, no toast.
    expect(currentToast()).toBeNull();
    expect(document.body.querySelector('.overlay-panel')).toBeNull();
  });

  it('reopens a waiting move with its folder chosen, and Move here replaces it (§3.6)', async () => {
    mount(null);
    void act(() => {
      openMoveTo({
        subject: SUBJECT,
        name: NAME,
        pending: { destination: '2-Areas/Garden', fileId: 'OLD_ID' },
      });
    });
    expect(radio('Garden').getAttribute('aria-checked')).toBe('true');
    expect(document.body.textContent).toContain('Moving to Garden');
    expect(button('Move here').disabled).toBe(false);
    click(button('Move here'));
    await flush();
    expect(mocks.createTextFile).toHaveBeenCalledTimes(1);
    expect(mocks.deleteFile).toHaveBeenCalledWith('OLD_ID');
    expect(currentToast()).toBeNull();
  });

  it('says so and stays open when the move could not be written', async () => {
    mocks.createTextFile.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    moveTo();
    click(radio('Resources'));
    click(button('Move here'));
    await flush();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not send that. Try again.',
    );
    expect(document.body.querySelector('.overlay-panel')).not.toBeNull();
  });
});
