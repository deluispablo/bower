// @vitest-environment jsdom

import { Fragment, h, render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { COPIED_MS, NoteMenu } from '../src/components/note-menu.js';
import { OverlayHost } from '../src/components/overlay.js';
import type { NoteMenuProps } from '../src/components/note-menu.js';
import type { DriveFile } from '../src/drive.js';

const openAsk = vi.hoisted(() => vi.fn());
const openRename = vi.hoisted(() => vi.fn());
const openMoveTo = vi.hoisted(() => vi.fn());
vi.mock('../src/components/send-to-bower.js', () => ({ openAsk }));
vi.mock('../src/components/rename-sheet.js', () => ({ openRename }));
vi.mock('../src/components/folder-picker.js', async (original) => ({
  ...(await original<object>()),
  openMoveTo,
}));

/** Ask Bower about this opens the Ask sheet about `name` (#910). */
function expectAsk(name: string, kind: string): void {
  openAsk.mockClear();
  click(rowByText('Ask Bower about this'));
  expect(openAsk).toHaveBeenCalledOnce();
  expect(openAsk.mock.calls[0]?.[0]).toMatchObject({ name, kind });
}

function file(name: string): DriveFile {
  return {
    id: 'note-1',
    name,
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path: name,
  };
}

const NOTE = file('Shopping list.md');

let root: HTMLDivElement;
let opener: HTMLButtonElement;

/**
 * Mounts `NoteMenu` the way `note.tsx` does — `{menuOpen && <NoteMenu .../>}`
 * — so that calling `onClose` actually unmounts it, the same way Escape, a
 * backdrop tap or a followed row closes it for real (and lets
 * `use-focus-trap.ts` hand focus back to whatever had it before, on that
 * unmount).
 */
function mount(
  canEdit: boolean,
  onEdit = vi.fn(),
  pinned = false,
  onTogglePin = vi.fn(),
  canAppend = true,
  onAddParagraph = vi.fn(),
): {
  onEdit: () => void;
  onTogglePin: () => void;
  onAddParagraph: () => void;
  onClose: () => void;
} {
  const onClose = vi.fn();

  function Harness() {
    const [open, setOpen] = useState(true);
    if (!open) return null;
    return h(NoteMenu, {
      file: NOTE,
      title: 'Shopping list',
      typeLabel: 'Note',
      askName: 'Shopping list',
      canEdit,
      canAppend,
      pinned,
      onTogglePin,
      onAddParagraph,
      onEdit,
      onClose: () => {
        onClose();
        setOpen(false);
      },
    });
  }

  opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Fragment, null, h(Harness, {}), h(OverlayHost, null)), root);
  });
  return { onEdit, onTogglePin, onAddParagraph, onClose };
}

/** The menu's rows, Cancel left out (it only closes the sheet). */
function rows(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).filter((r) => !r.classList.contains('note-menu-cancel'));
}

/** Mounts the menu for a file or a folder, the way `file.tsx` and
 * `folder.tsx` do. */
function mountFor(props: Omit<NoteMenuProps, 'onClose'>): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(
      h(
        Fragment,
        null,
        h(NoteMenu, { onClose: vi.fn(), ...props }),
        h(OverlayHost, null),
      ),
      root,
    );
  });
}

function rowByText(text: string): HTMLElement {
  const row = rows().find((r) => r.textContent?.includes(text));
  if (row === undefined) throw new Error(`row "${text}" missing`);
  return row;
}

function click(el: Element): void {
  void act(() => {
    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  });
}

/** Flushes the microtask queue inside `act`, so state set from a resolved
 * promise (`copyToClipboard`, say) is committed before assertions run. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
});

describe('NoteMenu', () => {
  it('offers Rename… for a note that has its folder names, and opens the Rename sheet (#765, #910)', () => {
    openRename.mockClear();
    mountFor({
      file: NOTE,
      title: 'Shopping list',
      typeLabel: 'Note',
      askName: 'Shopping list',
      siblingNames: ['Shopping list.md', 'Todo.md'],
    });
    const labels = rows().map(
      (r) => r.querySelector('.note-menu-row-label')?.textContent,
    );
    expect(labels.indexOf('Rename…')).toBe(labels.indexOf('Move to…') - 1);
    const rename = rowByText('Rename…');
    expect(rename.textContent).toContain(
      'Bower renames it at the next tidy-up',
    );
    click(rename);
    expect(openRename).toHaveBeenCalledWith({
      path: 'Shopping list.md',
      name: 'Shopping list.md',
      isNote: true,
      siblingNames: ['Shopping list.md', 'Todo.md'],
    });
  });

  it('leaves Rename… out for a folder, for the app files and without names (#765)', () => {
    const base = { title: 'X', typeLabel: 'Note', askName: 'X' };
    mountFor({
      ...base,
      kind: 'folder',
      file: file('Garden'),
      siblingNames: [],
    });
    expect(rows().some((r) => r.textContent?.includes('Rename…'))).toBe(false);
    void act(() => render(null, root));
    mountFor({ ...base, file: file('Rules.md'), siblingNames: [] });
    expect(rows().some((r) => r.textContent?.includes('Rename…'))).toBe(false);
    void act(() => render(null, root));
    mountFor({ ...base, file: NOTE });
    expect(rows().some((r) => r.textContent?.includes('Rename…'))).toBe(false);
  });

  it("lists a note's rows in the NO-More order (#907)", () => {
    mount(true);
    expect(
      rows().map((r) => r.querySelector('.note-menu-row-label')?.textContent),
    ).toEqual([
      'Ask Bower about this',
      'Pin to Home',
      'Open in Drive',
      'Show in folders',
      'Move to…',
      'Copy link',
      'Add a paragraph…',
      'Edit the text',
      'Help and about this',
    ]);
  });

  it('has no header, and separates its groups with a rule (#907)', () => {
    mount(true);
    expect(document.querySelector('.note-menu-head')).toBeNull();
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(3);
  });

  it('closes on Cancel, and returns focus to the opener', () => {
    const { onClose } = mount(true);
    const cancel = document.querySelector('.note-menu-cancel');
    if (cancel === null) throw new Error('Cancel missing');
    click(cancel);
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });

  it('lists six rows, Edit left out, for a protected note', () => {
    mount(false);
    expect(rows()).toHaveLength(8);
    expect(rows().some((r) => r.textContent?.includes('Edit the text'))).toBe(
      false,
    );
  });

  it('leaves out Add a paragraph when the note cannot be appended to', () => {
    mount(true, vi.fn(), false, vi.fn(), false);
    expect(rows()).toHaveLength(8);
    expect(rows().some((r) => r.textContent?.includes('Add a paragraph'))).toBe(
      false,
    );
  });

  it('closes and calls onAddParagraph when Add a paragraph is activated', () => {
    const { onAddParagraph, onClose } = mount(true);
    click(rowByText('Add a paragraph…'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onAddParagraph).toHaveBeenCalledOnce();
  });

  it('says Unpin from Home when the note is already pinned', () => {
    mount(true, vi.fn(), true);
    expect(rowByText('Unpin from Home')).toBeDefined();
    expect(root.textContent).not.toContain('Pin to Home');
  });

  it('closes and calls onTogglePin when the Pin row is activated', () => {
    const { onTogglePin, onClose } = mount(true);
    click(rowByText('Pin to Home'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onTogglePin).toHaveBeenCalledOnce();
  });

  it('shows the bird in Ask for a note Bower wrote (K-29, #910)', () => {
    mountFor({
      file: NOTE,
      title: 'Shopping list',
      askName: 'Shopping list',
      bowerWritten: true,
    });
    expectAsk('Shopping list', 'note');
    expect(openAsk.mock.calls[0]?.[0]).toMatchObject({
      icon: { bowerWritten: true },
    });
  });

  it('opens the Ask sheet about the note over the page (R-MORE-5, #910)', () => {
    mount(true);
    expectAsk('Shopping list', 'note');
    expect(openAsk.mock.calls[0]?.[0]).toMatchObject({
      icon: { name: 'Shopping list.md', path: 'Shopping list.md' },
    });
  });

  it('says "waits for the tidy-up" under Move to…, which opens Move to… for this note (#866, #909)', () => {
    openMoveTo.mockClear();
    const { onClose } = mount(true);
    const move = rowByText('Move to…');
    expect(move.textContent).toContain('Bower moves it at the next tidy-up');
    expect(openMoveTo).not.toHaveBeenCalled();
    click(move);
    expect(openMoveTo).toHaveBeenCalledWith({
      subject: { path: 'Shopping list.md', isFolder: false },
      name: 'Shopping list',
    });
    // The menu closes; the sheet takes over.
    expect(onClose).toHaveBeenCalled();
  });

  it('names the note under Show in folders, which reveals it (#608, #907)', () => {
    mount(true);
    const show = rowByText('Show in folders');
    expect(show.textContent).toContain('Opens your folders at Shopping list');
    expect(show.textContent).not.toContain('NEW');
    expect(show.getAttribute('href')).toBe('/notes?reveal=note%2Fnote-1');
  });

  it('links Open in Drive to the file, in a new tab', () => {
    mount(true);
    const open = rowByText('Open in Drive');
    expect(open.getAttribute('href')).toBe(
      'https://drive.google.com/file/d/note-1/view',
    );
    expect(open.getAttribute('target')).toBe('_blank');
  });

  it('closes and calls onEdit when Edit the text is activated', () => {
    const { onEdit, onClose } = mount(true);
    click(rowByText('Edit the text'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('is one menu on the overlay, with the page behind inert', () => {
    const page = document.createElement('div');
    page.id = 'app';
    const shell = document.createElement('div');
    shell.className = 'shell';
    page.append(shell);
    document.body.append(page);
    mount(true);
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(document.querySelector('.overlay--menu')).not.toBeNull();
    expect(shell.hasAttribute('inert')).toBe(true);
  });

  it('closes on a backdrop click, and returns focus to the opener', () => {
    const { onClose } = mount(true);
    const backdrop = document.querySelector('.overlay-scrim');
    if (backdrop === null) throw new Error('backdrop missing');
    click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Escape, and returns focus to the opener', () => {
    const { onClose } = mount(true);
    void act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      (document.activeElement ?? document.body).dispatchEvent(event);
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });

  it('falls back to a read-only link input when the Clipboard API is unavailable', async () => {
    // jsdom has no Clipboard API, so Copy link always takes this path here.
    mount(true);
    click(rowByText('Copy link'));
    await flush();
    const fallback = document.querySelector<HTMLInputElement>(
      '.note-menu-copy-fallback',
    );
    if (fallback === null) throw new Error('fallback input missing');
    expect(fallback.readOnly).toBe(true);
    expect(fallback.value).toBe(location.href);
  });

  it('has no Pin, Add a paragraph or Edit row for a file (#350)', () => {
    const pdf: DriveFile = {
      id: 'file-1',
      name: 'Lease 2026.pdf',
      mimeType: 'application/pdf',
      parents: ['FOLDER_ID'],
      path: '1-Projects/Flat hunt/Lease 2026.pdf',
    };
    mountFor({
      kind: 'file',
      file: pdf,
      title: 'Lease 2026',
      typeLabel: 'PDF',
      askName: pdf.name,
      // Even if a caller passed them, a file never gets the note-only rows.
      canEdit: true,
      canAppend: true,
      onEdit: vi.fn(),
      onAddParagraph: vi.fn(),
    });
    expect(
      document.querySelector('[role="menu"]')?.getAttribute('aria-label'),
    ).toBe('File actions');
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Ask Bower about this'),
      expect.stringContaining('Open in Drive'),
      expect.stringContaining('Show in folders'),
      expect.stringContaining('Move to…'),
      expect.stringContaining('Copy link'),
      expect.stringContaining('Download'),
      expect.stringContaining('Help and about this'),
    ]);
    expect(rowByText('Show in folders').getAttribute('href')).toBe(
      '/notes?reveal=file%2Ffile-1',
    );
    expectAsk('Lease 2026.pdf', 'file');
    openMoveTo.mockClear();
    click(rowByText('Move to…'));
    expect(
      (openMoveTo.mock.calls[0]?.[0] as { subject: { path: string } }).subject
        .path,
    ).toBe('1-Projects/Flat hunt/Lease 2026.pdf');
  });

  it('has Pin but no note-only rows for a folder, and opens the folder in Drive', () => {
    const folder: DriveFile = {
      id: 'folder-1',
      name: 'Flat hunt',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['FOLDER_ID'],
      path: '1-Projects/Flat hunt',
    };
    const onTogglePin = vi.fn();
    mountFor({
      kind: 'folder',
      file: folder,
      title: 'Flat hunt',
      typeLabel: 'Folder',
      askName: 'Flat hunt',
      pinned: true,
      onTogglePin,
    });
    expect(
      document.querySelector('[role="menu"]')?.getAttribute('aria-label'),
    ).toBe('Folder actions');
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Ask Bower about this'),
      expect.stringContaining('Unpin from Home'),
      expect.stringContaining('Open in Drive'),
      expect.stringContaining('Show in folders'),
      expect.stringContaining('Move to…'),
      expect.stringContaining('Copy link'),
      expect.stringContaining('Help and about this'),
    ]);
    expectAsk('Flat hunt', 'folder');
    expect(rowByText('Open in Drive').getAttribute('href')).toBe(
      'https://drive.google.com/drive/folders/folder-1',
    );
    expect(rowByText('Show in folders').getAttribute('href')).toBe(
      '/notes?reveal=folder%2F1-Projects%2FFlat%2520hunt',
    );
    click(rowByText('Unpin from Home'));
    expect(onTogglePin).toHaveBeenCalledOnce();
  });

  it('gives a root landmark no Rename… and no Move to… (AR-More)', () => {
    mountFor({
      kind: 'folder',
      file: {
        id: 'areas',
        name: '2-Areas',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['FOLDER_ID'],
        path: '2-Areas',
      },
      title: '2-Areas',
      askName: '2-Areas',
      siblingNames: [],
      onTogglePin: vi.fn(),
    });
    const text = rows().map((r) => r.textContent ?? '');
    expect(text.some((t) => t.includes('Rename…'))).toBe(false);
    expect(text.some((t) => t.includes('Move to…'))).toBe(false);
    expect(text).toHaveLength(6);
    // Named as shown, never with its numeric prefix (design gate, #907).
    expect(rowByText('Show in folders').textContent).toContain(
      'Opens your folders at Areas',
    );
    expectAsk('Areas', 'folder');
  });

  it('shows Copied. for 2 s after Copy link (R-API-11)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    mount(true);
    click(rowByText('Copy link'));
    await flush();
    expect(rowByText('Copy link').textContent).toContain('Copied.');
    void act(() => {
      vi.advanceTimersByTime(COPIED_MS);
    });
    expect(rowByText('Copy link').textContent).not.toContain('Copied.');
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('builds each tab menu, and hides Drive items whose id is not loaded (R-API-5)', () => {
    mountFor({ kind: 'settings' });
    expect(
      document.querySelector('[role="menu"]')?.getAttribute('aria-label'),
    ).toBe('Settings actions');
    expect(rows().map((r) => r.textContent)).toEqual(['Help and about this']);
    void act(() => render(null, root));
    mountFor({ kind: 'settings', driveIds: { root: 'ROOT_ID' } });
    expect(
      rowByText('Open your Bower folder in Drive').getAttribute('href'),
    ).toBe('https://drive.google.com/drive/folders/ROOT_ID');
    void act(() => render(null, root));
    const onToggleOwnFiles = vi.fn();
    mountFor({
      kind: 'notes',
      driveIds: { root: 'ROOT_ID' },
      ownFilesShown: true,
      onToggleOwnFiles,
    });
    click(rowByText("Hide Bower's own files"));
    expect(onToggleOwnFiles).toHaveBeenCalledOnce();
    void act(() => render(null, root));
    mountFor({
      kind: 'bower',
      driveIds: { rules: 'RULES_ID' },
      onIdeas: vi.fn(),
    });
    expect(rowByText('Open your rules in Drive').getAttribute('href')).toBe(
      'https://drive.google.com/file/d/RULES_ID/view',
    );
    expect(rowByText('Things you can ask').textContent).toContain(
      'Ideas for rules, jobs and questions',
    );
  });

  it('asks for Help with onHelp, closing the menu first', () => {
    const onHelp = vi.fn();
    const onClose = vi.fn();
    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(
        h(
          Fragment,
          null,
          h(NoteMenu, { kind: 'home', onHelp, onClose, onEditPinned: vi.fn() }),
          h(OverlayHost, null),
        ),
        root,
      );
    });
    expect(rows().map((r) => r.textContent)).toEqual([
      'Edit pinned',
      'Help and about this',
    ]);
    click(rowByText('Help and about this'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onHelp).toHaveBeenCalledOnce();
  });
});
