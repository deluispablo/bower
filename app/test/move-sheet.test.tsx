// @vitest-environment jsdom

import { Fragment, h, render } from 'preact';
import type { ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { buildTree } from '../src/navigation.js';
import { moveRequestText, pickerFolders } from '../src/move-request.js';
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
const { openSendToBower } = await import('../src/components/send-to-bower.js');

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

function type(input: HTMLInputElement, value: string): void {
  void act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
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

  it('expands a landmark with its chevron', () => {
    choice();
    click(
      document.body.querySelector('[aria-label="Expand Projects"]') as Element,
    );
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
    expect(currentToast()?.message).toBe(
      'In your inbox. Bower moves it at the next tidy-up.',
    );
    expect(currentToast()?.action?.label).toBe('Undo');
    expect(document.body.querySelector('.overlay-panel')).toBeNull();
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

describe('Send sheet in move mode (#866)', () => {
  function sheet(subject = SUBJECT, name = NAME): void {
    mount(null);
    void act(() => {
      openSendToBower({
        mode: 'move',
        about: 'Areas › Home',
        moveSubject: subject,
        buildText: (destination) =>
          moveRequestText(name, subject.path, destination),
      });
    });
  }

  it('is the send sheet: a folder choice instead of the field, the same buttons and lines', () => {
    sheet();
    const panel = document.body.querySelector('.overlay-panel');
    expect(panel?.getAttribute('aria-modal')).toBe('true');
    expect(document.body.querySelector('h2')?.textContent).toBe('Move');
    expect(document.body.querySelector('textarea')).toBeNull();
    expect(radios().length).toBeGreaterThan(0);
    expect(button('Put in the inbox').disabled).toBe(true);
    expect(button('Just this, now').disabled).toBe(true);
    const text = document.body.textContent ?? '';
    expect(text).toContain('It waits in your inbox');
    expect(text).toContain('Uses one run of your Claude plan.');
    expect(document.body.querySelector('.folder-picker-title')).toBeNull();
  });

  it('"Put in the inbox" writes one request note with the exact text and an Undo toast, no run', async () => {
    sheet();
    click(radio('Garden'));
    click(button('Put in the inbox'));
    await flush();
    expect(mocks.createTextFile).toHaveBeenCalledTimes(1);
    const [parent, , content] = mocks.createTextFile.mock.calls[0] as string[];
    expect(parent).toBe('INBOX_ID');
    expect(content).toContain(
      'Move “Lease agreement 2026” (2-Areas/Home/Lease agreement 2026.pdf) to 2-Areas/Garden.',
    );
    expect(mocks.process).not.toHaveBeenCalled();
    expect(currentToast()?.message).toBe(
      'In your inbox. Bower moves it at the next tidy-up.',
    );
    expect(currentToast()?.action?.label).toBe('Undo');
    expect(document.body.querySelector('.overlay-panel')).toBeNull();
  });

  it('"Just this, now" writes the note, then runs instructions only', async () => {
    sheet();
    click(radio('Garden'));
    click(button('Just this, now'));
    await flush();
    expect(mocks.createTextFile).toHaveBeenCalledTimes(1);
    expect(mocks.process).toHaveBeenCalledWith('instructions');
    expect(currentToast()?.message).toBe('Bower is on it now.');
  });

  it('says the run did not start, and the request waits, when POST /process failed', async () => {
    mocks.process.mockResolvedValue(false);
    sheet();
    click(radio('Garden'));
    click(button('Just this, now'));
    await flush();
    expect(currentToast()?.message).toBe(
      "Couldn't start Bower now. Your request goes with the next tidy-up.",
    );
  });

  it('says so and stays open when the request could not be written', async () => {
    mocks.createTextFile.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sheet();
    click(radio('Resources'));
    click(button('Put in the inbox'));
    await flush();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not send that. Try again.',
    );
    expect(mocks.process).not.toHaveBeenCalled();
    expect(document.body.querySelector('.overlay-panel')).not.toBeNull();
  });

  it('moves a folder: the folder itself is not on offer', () => {
    sheet({ path: '2-Areas/Garden', isFolder: true }, 'Garden');
    const names = radios().map(
      (r) => r.querySelector('.folder-picker-name')?.textContent,
    );
    expect(names).not.toContain('Garden');
    expect(names).toContain('Resources');
  });
});
