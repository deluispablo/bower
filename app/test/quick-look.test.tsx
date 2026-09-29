// @vitest-environment jsdom

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const { QuickLook, filedLine, kindLine } =
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
        />,
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
    const dialog = root.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(root.querySelector('.quick-look-title')?.textContent).toBe(
      'Lease agreement 2026',
    );
    expect(root.querySelector('.quick-look-kind')?.textContent).toBe(
      'PDF · 6 pages · 340 KB',
    );
    expect(root.querySelector('.quick-look-path-text')?.textContent).toBe(
      'Projects › Flat hunt',
    );
    expect(root.querySelector('.quick-look-filed')?.textContent).toBe(
      'Filed by Bower yesterday',
    );
    const open = root.querySelector<HTMLAnchorElement>('.quick-look-open');
    expect(open?.textContent).toBe('Open');
    expect(open?.getAttribute('href')).toBe('/file/FILE_ID');
    const drive = root.querySelector<HTMLAnchorElement>('.quick-look-drive');
    expect(drive?.textContent).toBe('Open in Drive');
    expect(drive?.href).toContain('drive.google.com');
    expect(drive?.getAttribute('target')).toBe('_blank');
  });

  it('disables Open in Drive in the demo, where the ids are not real', () => {
    demo = true;
    mount();
    const drive = root.querySelector<HTMLButtonElement>('.quick-look-drive');
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
    const grip = root.querySelector<HTMLElement>('.quick-look-grip');
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
      const backdrop = root.querySelector<HTMLElement>('.quick-look-backdrop');
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
