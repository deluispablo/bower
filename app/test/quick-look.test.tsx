// @vitest-environment jsdom

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayHost } from '../src/components/overlay.js';
import type { DriveFile } from '../src/drive.js';

let demo = false;

vi.mock('../src/api.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/api.js')>();
  return { ...original, isDemo: () => demo };
});

vi.mock('../src/cache.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/cache.js')>();
  return {
    ...original,
    loadThumbnail: vi.fn(() => Promise.resolve(undefined)),
  };
});

// A note Bower wrote, for the preview column's Bower's note box.
const NOTE_TEXT = vi.hoisted(() =>
  [
    '---',
    'by: bower',
    '---',
    "## Bower's note",
    '- ✅ 10 % under the area average.',
    '',
    '## Why',
    'Cheapest, and close to the station.',
    '',
  ].join('\n'),
);
vi.mock('../src/vault-store.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/vault-store.js')>();
  const { buildVaultIndex } = await import('../src/vault-index.js');
  const index = buildVaultIndex([]);
  const getNoteText = (): Promise<string> => Promise.resolve(NOTE_TEXT);
  return { ...real, useVault: () => ({ index, getNoteText }) };
});

const { QuickLook, QuickLookPane, filedLine, kindLine, withoutTitle } =
  await import('../src/components/quick-look.js');
const { defaultLayout, noteLines } =
  await import('../src/components/folder-grid.js');

const NOW = Date.parse('2026-09-28T12:00:00Z');

const pdf: DriveFile = {
  id: 'FILE_ID',
  name: 'Lease agreement 2026.pdf',
  mimeType: 'application/pdf',
  parents: ['FOLDER_ID'],
  path: '1-Projects/Flat hunt/Lease agreement 2026.pdf',
  modifiedTime: '2026-09-27T08:00:00Z',
  size: 340 * 1024,
};

describe('kindLine', () => {
  it('joins the kind, the pages and the size', () => {
    expect(kindLine('pdf', 6, 340 * 1024)).toBe('PDF · 6 pages · 340 KB');
  });

  it('leaves out what is not known', () => {
    expect(kindLine('photo', undefined, undefined)).toBe('Photo');
    expect(kindLine('pdf', 1, undefined)).toBe('PDF · 1 page');
  });
});

describe('filedLine', () => {
  it('says who filed it and when', () => {
    expect(filedLine('filed', '2026-09-27T08:00:00Z', NOW)).toBe(
      'Filed by Bower yesterday',
    );
    expect(filedLine('yours', '2026-09-27T08:00:00Z', NOW)).toBe(
      'Added by you yesterday',
    );
  });

  it("never says Bower filed a note that isn't Bower's", () => {
    expect(filedLine(null, '2026-09-27T08:00:00Z', NOW, false)).toBe(
      'Added by you yesterday',
    );
    expect(filedLine(null, '2026-09-27T08:00:00Z', NOW, true)).toBe(
      'Filed by Bower yesterday',
    );
  });

  it('says nothing for a file with no date', () => {
    expect(filedLine('filed', undefined, NOW)).toBeNull();
  });
});

describe('defaultLayout', () => {
  it('is Grid when more than half of the folder is photos', () => {
    expect(defaultLayout(['photo', 'photo', 'pdf'])).toBe('grid');
    expect(defaultLayout(['heic', 'image', 'note', 'pdf'])).toBe('list');
  });

  it('is List for an empty folder', () => {
    expect(defaultLayout([])).toBe('list');
  });
});

describe('noteLines', () => {
  it('skips the frontmatter, headings and list marks', () => {
    const text =
      '---\nkind: rental-listing\n---\n\n# Title\n\n- **Rent** £2,150\n- Tube 6 minutes\nA sentence.\nFourth.\n';
    expect(noteLines(text)).toEqual([
      'Rent £2,150',
      'Tube 6 minutes',
      'A sentence.',
    ]);
  });
});

describe('QuickLook', () => {
  let root: HTMLElement;
  const onClose = vi.fn();

  function mount(): void {
    void act(() => {
      render(
        <>
          <QuickLook
            title="Lease agreement 2026"
            href="/file/FILE_ID"
            file={pdf}
            kind="pdf"
            pages={6}
            origin="filed"
            folderPath="1-Projects/Flat hunt"
            now={NOW}
            onClose={onClose}
          />
          <OverlayHost />
        </>,
        root,
      );
    });
  }

  beforeEach(() => {
    demo = false;
    onClose.mockReset();
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    void act(() => render(null, root));
    root.remove();
  });

  it('shows the board content and opens the file', () => {
    mount();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(document.querySelector('.quick-look-title')?.textContent).toBe(
      'Lease agreement 2026',
    );
    expect(document.querySelector('.quick-look-kind')?.textContent).toBe(
      'PDF · 6 pages · 340 KB',
    );
    expect(document.querySelector('.quick-look-path-text')?.textContent).toBe(
      'Projects › Flat hunt',
    );
    expect(document.querySelector('.quick-look-filed')?.textContent).toBe(
      'Filed by Bower yesterday',
    );
    const open = document.querySelector<HTMLAnchorElement>('.quick-look-open');
    expect(open?.textContent).toBe('Open');
    expect(open?.getAttribute('href')).toBe('/file/FILE_ID');
    const drive =
      document.querySelector<HTMLAnchorElement>('.quick-look-drive');
    expect(drive?.textContent).toBe('Open in Drive');
    expect(drive?.href).toContain('drive.google.com');
    expect(drive?.getAttribute('target')).toBe('_blank');
  });

  it('disables Open in Drive in the demo, where the ids are not real', () => {
    demo = true;
    mount();
    const drive =
      document.querySelector<HTMLButtonElement>('.quick-look-drive');
    expect(drive?.tagName).toBe('BUTTON');
    expect(drive?.disabled).toBe(true);
  });

  it('closes on Escape', () => {
    mount();
    void act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a swipe down on its handle, not on a short drag', () => {
    mount();
    const grip = document.querySelector<HTMLElement>('.quick-look-grip');
    expect(grip).not.toBeNull();
    const pointer = (type: string, clientY: number): void => {
      void act(() => {
        grip?.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }));
      });
    };
    pointer('pointerdown', 0);
    pointer('pointermove', 20);
    pointer('pointerup', 20);
    expect(onClose).not.toHaveBeenCalled();
    pointer('pointerdown', 0);
    pointer('pointermove', 120);
    pointer('pointerup', 120);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the backdrop once the opening tap has passed', () => {
    vi.useFakeTimers();
    try {
      mount();
      const backdrop = document.querySelector<HTMLElement>('.overlay-scrim');
      void act(() => backdrop?.click());
      expect(onClose).not.toHaveBeenCalled();
      vi.setSystemTime(Date.now() + 400);
      void act(() => backdrop?.click());
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('QuickLookPane, the desktop preview column (§3.37, R-PREVIEW-1)', () => {
  let root: HTMLElement;

  const note: DriveFile = {
    id: 'NOTE_ID',
    name: '10-43 Example St.md',
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path: '1-Projects/Flat hunt/10-43 Example St.md',
    modifiedTime: '2026-09-28T08:00:00Z',
    size: 1024,
  };

  beforeEach(() => {
    demo = false;
    localStorage.clear();
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    void act(() => render(null, root));
    root.remove();
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  it('says "Select something to see it here." when nothing is selected', () => {
    void act(() => render(<QuickLookPane item={null} />, root));
    expect(root.querySelector('.quick-look-empty')?.textContent).toBe(
      'Select something to see it here.',
    );
  });

  it("shows Open, Open in Drive, the meta and Bower's note box, which folds", async () => {
    void act(() =>
      render(
        <QuickLookPane
          item={{
            title: '10-43 Example St',
            href: '/note/NOTE_ID',
            file: note,
            kind: 'note',
            origin: null,
            bower: true,
            folderPath: '1-Projects/Flat hunt',
            now: NOW,
          }}
        />,
        root,
      ),
    );
    await settle();
    expect(root.querySelector('.quick-look-pane-title')?.textContent).toBe(
      '10-43 Example St',
    );
    const buttons = [
      ...root.querySelectorAll('.quick-look-pane-actions .btn-sm'),
    ].map((el) => el.textContent);
    expect(buttons).toEqual(['Open', 'Open in Drive']);
    expect(root.querySelector('.quick-look-pane-meta')?.textContent).toBe(
      'Bower note · 1 KB · filed by Bower today',
    );
    const fold = root.querySelector<HTMLButtonElement>('.bower-note-box-fold');
    expect(fold).not.toBeNull();
    void act(() => fold?.click());
    expect(fold?.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows a folder with "Inside" and its rows', () => {
    void act(() =>
      render(
        <QuickLookPane
          item={{
            type: 'folder',
            title: 'Viewings',
            href: '/folder/1-Projects/Flat%20hunt/Viewings',
            path: '1-Projects/Flat hunt/Viewings',
            things: 2,
            updated: '2026-09-27T09:00:00Z',
            now: NOW,
            inside: [
              {
                id: 'PDF_ID',
                title: 'Floor plan',
                href: '/file/PDF_ID',
                name: 'Floor plan.pdf',
                mimeType: 'application/pdf',
                path: '1-Projects/Flat hunt/Viewings/Floor plan.pdf',
                modified: '2026-09-27T09:00:00Z',
                isNew: true,
              },
            ],
          }}
        />,
        root,
      ),
    );
    expect(root.querySelector('.quick-look-pane-meta')?.textContent).toBe(
      'Folder · 2 things · updated yesterday',
    );
    expect(root.querySelector('.quick-look-pane-overline')?.textContent).toBe(
      'Inside',
    );
    expect(root.querySelector('.list-row-title')?.textContent).toBe(
      'Floor plan',
    );
    expect(root.textContent).toContain('New');
  });
});

describe('the preview shows the name once (#950 F-16)', () => {
  it('drops the leading h1 of the note, and only that', () => {
    expect(withoutTitle('<h1>Offer</h1><p>Body</p>')).toBe('<p>Body</p>');
    expect(withoutTitle('<p>Body</p><h1>Later</h1>')).toBe(
      '<p>Body</p><h1>Later</h1>',
    );
  });

  it('reads a Bower answer as one in the kind line (#950 F-4)', () => {
    expect(kindLine('note', undefined, 2048, true)).toBe('Bower answer · 2 KB');
  });
});
