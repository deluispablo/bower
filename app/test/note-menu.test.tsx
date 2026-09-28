// @vitest-environment jsdom

import { h, render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NoteMenu } from '../src/components/note-menu.js';
import type { NoteMenuProps } from '../src/components/note-menu.js';
import type { DriveFile } from '../src/drive.js';

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
    render(h(Harness, {}), root);
  });
  return { onEdit, onTogglePin, onAddParagraph, onClose };
}

/** The menu's rows, Cancel left out (it only closes the sheet). */
function rows(): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).filter((r) => !r.classList.contains('note-menu-cancel'));
}

/** Mounts the menu for a file or a folder, the way `file.tsx` and
 * `folder.tsx` do. */
function mountFor(props: Omit<NoteMenuProps, 'onClose'>): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(NoteMenu, { onClose: vi.fn(), ...props }), root);
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
  it('lists seven rows for a normal note, in the board order', () => {
    mount(true);
    expect(
      rows().map((r) => r.querySelector('.note-menu-row-label')?.textContent),
    ).toEqual([
      'Ask Bower about this',
      'Pin to Home',
      'Move to…',
      'Open in Drive',
      'Copy link',
      'Add a paragraph…',
      'Edit the text',
    ]);
  });

  it('heads the menu with the title, then the type word and the folder', () => {
    mount(true);
    expect(root.querySelector('.note-menu-title')?.textContent).toBe(
      'Shopping list',
    );
    // The note sits at the top of the Bower folder: just the type word.
    expect(root.querySelector('.note-menu-meta')?.textContent).toBe('Note');
  });

  it('closes on Cancel, and returns focus to the opener', () => {
    const { onClose } = mount(true);
    const cancel = root.querySelector('.note-menu-cancel');
    if (cancel === null) throw new Error('Cancel missing');
    click(cancel);
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });

  it('lists six rows, Edit left out, for a protected note', () => {
    mount(false);
    expect(rows()).toHaveLength(6);
    expect(rows().some((r) => r.textContent?.includes('Edit the text'))).toBe(
      false,
    );
  });

  it('leaves out Add a paragraph when the note cannot be appended to', () => {
    mount(true, vi.fn(), false, vi.fn(), false);
    expect(rows()).toHaveLength(6);
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

  it('prefills the Bower box with a wikilink to the note, and a space', () => {
    mount(true);
    const ask = rowByText('Ask Bower about this');
    expect(ask.getAttribute('href')).toBe(
      `/bower?text=${encodeURIComponent('[[Shopping list]] ')}`,
    );
  });

  it('prefills the Bower box with the note path and nothing else, for Move to… (#302)', () => {
    mount(true);
    const misfiled = rowByText('Move to…');
    expect(misfiled.getAttribute('href')).toBe(
      `/bower?text=${encodeURIComponent(
        '"Shopping list.md" was misfiled. It should go to: ',
      )}`,
    );
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

  it('closes on a backdrop click, and returns focus to the opener', () => {
    const { onClose } = mount(true);
    const backdrop = root.querySelector('.note-menu-backdrop');
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
    const fallback = root.querySelector<HTMLInputElement>(
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
      root.querySelector('[role="menu"]')?.getAttribute('aria-label'),
    ).toBe('File actions');
    expect(root.querySelector('.note-menu-meta')?.textContent).toBe(
      'PDF · 1-Projects / Flat hunt',
    );
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Ask Bower about this'),
      expect.stringContaining('Move to…'),
      expect.stringContaining('Open in Drive'),
      expect.stringContaining('Copy link'),
    ]);
    expect(rowByText('Ask Bower about this').getAttribute('href')).toBe(
      `/bower?text=${encodeURIComponent('[[Lease 2026.pdf]] ')}`,
    );
    expect(rowByText('Move to…').getAttribute('href')).toBe(
      `/bower?text=${encodeURIComponent(
        '"1-Projects/Flat hunt/Lease 2026.pdf" was misfiled. It should go to: ',
      )}`,
    );
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
      root.querySelector('[role="menu"]')?.getAttribute('aria-label'),
    ).toBe('Folder actions');
    expect(root.querySelector('.note-menu-meta')?.textContent).toBe(
      'Folder · 1-Projects',
    );
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Ask Bower about this'),
      expect.stringContaining('Unpin from Home'),
      expect.stringContaining('Move to…'),
      expect.stringContaining('Open in Drive'),
      expect.stringContaining('Copy link'),
    ]);
    expect(rowByText('Ask Bower about this').getAttribute('href')).toBe(
      `/bower?text=${encodeURIComponent('Flat hunt ')}`,
    );
    expect(rowByText('Open in Drive').getAttribute('href')).toBe(
      'https://drive.google.com/drive/folders/folder-1',
    );
    click(rowByText('Unpin from Home'));
    expect(onTogglePin).toHaveBeenCalledOnce();
  });
});
