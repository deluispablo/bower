// @vitest-environment jsdom

import { h, render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NoteMenu } from '../src/components/note-menu.js';
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
): { onEdit: () => void; onTogglePin: () => void; onClose: () => void } {
  const onClose = vi.fn();

  function Harness() {
    const [open, setOpen] = useState(true);
    if (!open) return null;
    return h(NoteMenu, {
      file: NOTE,
      noteName: 'Shopping list',
      canEdit,
      pinned,
      onTogglePin,
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
  return { onEdit, onTogglePin, onClose };
}

function rows(): HTMLElement[] {
  return Array.from(root.querySelectorAll('[role="menuitem"]'));
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
  it('lists six rows for a normal note, Pin first', () => {
    mount(true);
    expect(rows()).toHaveLength(6);
    expect(rowByText('Pin to Home')).toBeDefined();
    expect(rowByText('Ask Bower about this note')).toBeDefined();
    expect(rowByText('This was misfiled')).toBeDefined();
    expect(rowByText('Open in Drive')).toBeDefined();
    expect(rowByText('Copy link')).toBeDefined();
    expect(rowByText('Edit the text')).toBeDefined();
    expect(rows()[0]?.textContent).toContain('Pin to Home');
  });

  it('lists five rows, Edit left out, for a protected note', () => {
    mount(false);
    expect(rows()).toHaveLength(5);
    expect(rows().some((r) => r.textContent?.includes('Edit the text'))).toBe(
      false,
    );
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

  it('prefills Tell Bower with a wikilink to the note, and a space', () => {
    mount(true);
    const ask = rowByText('Ask Bower about this note');
    expect(ask.getAttribute('href')).toBe(
      `/tell?text=${encodeURIComponent('[[Shopping list]] ')}`,
    );
  });

  it('prefills Tell Bower with the note path and nothing else, for This was misfiled', () => {
    mount(true);
    const misfiled = rowByText('This was misfiled');
    expect(misfiled.getAttribute('href')).toBe(
      `/tell?text=${encodeURIComponent(
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
});
