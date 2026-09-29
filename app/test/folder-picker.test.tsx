// @vitest-environment jsdom

import { h, render } from 'preact';
import type { ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { buildTree } from '../src/navigation.js';
import { pickerFolders } from '../src/move-request.js';
import { currentToast, dismissToast } from '../src/toast-store.js';
import { buildVaultIndex } from '../src/vault-index.js';
import type { VaultIndex } from '../src/vault-index.js';

const mocks = vi.hoisted(() => ({
  createTextFile: vi.fn(),
  process: vi.fn(),
  refresh: vi.fn(),
  index: null as VaultIndex | null,
}));

vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  createTextFile: mocks.createTextFile,
}));
vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({ index: mocks.index, refresh: mocks.refresh }),
}));
vi.mock('../src/session.js', () => ({
  useSession: () => ({ me: { vault: { inboxFolderId: 'INBOX_ID' } } }),
}));
vi.mock('../src/run-store.js', () => ({
  useRun: () => ({ process: mocks.process }),
}));

const { FolderPicker, MoveFlow } =
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
    render(vnode, root);
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
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.createTextFile.mockReset().mockResolvedValue({});
  mocks.process.mockReset().mockResolvedValue(true);
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  mocks.index = INDEX;
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
});

function picker(onChoose = vi.fn(), onClose = vi.fn()): void {
  mount(
    h(FolderPicker, {
      name: NAME,
      subject: SUBJECT,
      folders: pickerFolders(buildTree(INDEX), SUBJECT),
      onChoose,
      onClose,
    }),
  );
}

describe('FolderPicker', () => {
  it('is an Overlay dialog: the shell goes inert and Escape closes it', () => {
    const shell = document.createElement('div');
    shell.id = 'app';
    const inner = document.createElement('div');
    inner.className = 'shell';
    shell.append(inner);
    document.body.append(shell);
    const onClose = vi.fn();
    picker(vi.fn(), onClose);
    const panel = document.body.querySelector('.overlay-panel');
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-modal')).toBe('true');
    expect(inner.hasAttribute('inert')).toBe(true);
    expect(document.body.querySelector('.folder-picker-backdrop')).toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the title, the search field, the landmarks with their lines and the footer', () => {
    picker();
    expect(document.body.querySelector('h2')?.textContent).toBe(
      'Move “Lease agreement 2026” to…',
    );
    expect(
      document.body.querySelector('input')?.getAttribute('placeholder'),
    ).toBe('Find a folder');
    const text = document.body.textContent ?? '';
    expect(text).toContain('Things with an end date');
    expect(text).toContain('Parts of life that go on');
    expect(text).toContain('Things to keep');
    expect(text).toContain(
      'Bower moves it and keeps its lists straight. Now takes a minute; otherwise it goes with the next tidy-up.',
    );
    expect(button('Move it now')).toBeTruthy();
    expect(button('With the next tidy-up')).toBeTruthy();
  });

  it('offers no Inbox, offers Archives, and opens the current folder in place', () => {
    picker();
    const names = radios().map(
      (r) => r.querySelector('.folder-picker-name')?.textContent,
    );
    expect(names).not.toContain('Inbox');
    expect(names).toContain('Archives');
    // Areas is open because the item sits in Areas / Home.
    expect(names).toContain('Garden');
    expect(names).toContain('Home');
    // Projects is closed.
    expect(names).not.toContain('Flat hunt');
  });

  it('disables the current folder and ticks the chosen one', () => {
    picker();
    expect(radio('Home').disabled).toBe(true);
    click(radio('Garden'));
    expect(radio('Garden').getAttribute('aria-checked')).toBe('true');
    expect(radio('Resources').getAttribute('aria-checked')).toBe('false');
  });

  it('expands a landmark with its chevron', () => {
    picker();
    click(
      document.body.querySelector('[aria-label="Expand Projects"]') as Element,
    );
    expect(radio('Flat hunt')).toBeTruthy();
  });

  it('filters by "Find a folder"', () => {
    picker();
    type(document.body.querySelector('input') as HTMLInputElement, 'gard');
    expect(
      radios().map((r) => r.querySelector('.folder-picker-name')?.textContent),
    ).toEqual(['Garden']);
    type(document.body.querySelector('input') as HTMLInputElement, 'zzz');
    expect(radios()).toHaveLength(0);
    expect(document.body.textContent).toContain(
      'No folder has that in its name.',
    );
  });

  it('keeps both buttons off until a folder is chosen, then reports the choice', () => {
    const onChoose = vi.fn();
    picker(onChoose);
    expect(button('Move it now').disabled).toBe(true);
    click(radio('Resources'));
    click(button('With the next tidy-up'));
    expect(onChoose).toHaveBeenCalledWith('3-Resources', 'later');
    click(button('Move it now'));
    expect(onChoose).toHaveBeenLastCalledWith('3-Resources', 'now');
  });
});

describe('MoveFlow', () => {
  function flow(onClose = vi.fn()): void {
    mount(
      h(MoveFlow, {
        name: NAME,
        path: SUBJECT.path,
        isFolder: false,
        onClose,
      }),
    );
  }

  it('"Move it now" writes one request note with the exact text, then runs instructions only', async () => {
    const onClose = vi.fn();
    flow(onClose);
    click(radio('Garden'));
    click(button('Move it now'));
    await flush();
    expect(mocks.createTextFile).toHaveBeenCalledTimes(1);
    const [parent, , content] = mocks.createTextFile.mock.calls[0] as string[];
    expect(parent).toBe('INBOX_ID');
    expect(content).toContain(
      'Move “Lease agreement 2026” (2-Areas/Home/Lease agreement 2026.pdf) to 2-Areas/Garden.',
    );
    expect(mocks.process).toHaveBeenCalledWith('instructions');
    expect(onClose).toHaveBeenCalled();
  });

  it('says Asked Bower to move it now when the run started', async () => {
    dismissToast();
    flow();
    click(radio('Garden'));
    click(button('Move it now'));
    await flush();
    expect(currentToast()?.message).toBe('Asked Bower to move it now.');
  });

  it('says the run did not start, and the request waits, when POST /process failed', async () => {
    dismissToast();
    mocks.process.mockResolvedValue(false);
    const onClose = vi.fn();
    flow(onClose);
    click(radio('Garden'));
    click(button('Move it now'));
    await flush();
    expect(mocks.createTextFile).toHaveBeenCalledTimes(1);
    expect(currentToast()?.message).toBe(
      "Couldn't start Bower now. Your request goes with the next tidy-up.",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('"With the next tidy-up" writes the request only', async () => {
    flow();
    click(radio('Resources'));
    click(button('With the next tidy-up'));
    await flush();
    expect(mocks.createTextFile).toHaveBeenCalledTimes(1);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('says so and stays open when the request could not be written', async () => {
    mocks.createTextFile.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onClose = vi.fn();
    flow(onClose);
    click(radio('Resources'));
    click(button('Move it now'));
    await flush();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not send that. Try again.',
    );
    expect(mocks.process).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
