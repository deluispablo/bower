// @vitest-environment jsdom

/** FileIcon picks bird / tinted glyph / outline / disc (#905, K-13,
 * R-FILEICON-1, R-FILEICON-3), as on SE-Query-375 and PF-Drawer-375. */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FileIcon,
  fileIconChoice,
  fileIconLabel,
} from '../src/components/file-icon.js';
import type {
  FileIconItem,
  FileIconSize,
} from '../src/components/file-icon.js';
import { MARK_LETTER_PX } from '../src/components/folder-mark.js';
import { FOLDER_MIME } from '../src/drive.js';

const MD = 'text/markdown';
const PDF = 'application/pdf';

const bowerNote: FileIconItem = {
  name: '10-43 Buckley St, Moonee Ponds.md',
  mimeType: MD,
  path: '1-Projects/Housing/Moonee Ponds/10-43 Buckley St, Moonee Ponds.md',
  bowerWritten: true,
};
const yourNote: FileIconItem = {
  name: '8-128 Park St.md',
  mimeType: MD,
  path: '1-Projects/Housing/Moonee Ponds/Listings/8-128 Park St.md',
};
const inboxPdf: FileIconItem = {
  name: 'Passport copy.pdf',
  mimeType: PDF,
  path: '0-Inbox/Passport copy.pdf',
};
const subfolder: FileIconItem = {
  name: 'Listings',
  mimeType: FOLDER_MIME,
  path: '1-Projects/Housing/Moonee Ponds/Listings',
};
const areas: FileIconItem = {
  name: '2-Areas',
  mimeType: FOLDER_MIME,
  path: '2-Areas',
};
const answers: FileIconItem = {
  name: 'Answers',
  mimeType: FOLDER_MIME,
  path: 'Answers',
};
const clipping: FileIconItem = {
  name: 'Article.md',
  mimeType: MD,
  path: 'Clippings/Article.md',
};

describe('fileIconChoice', () => {
  it('draws the bird for what Bower wrote', () => {
    expect(fileIconChoice(bowerNote)).toEqual({
      mark: 'bird',
      kind: 'bower-note',
      root: 'projects',
    });
  });
  it('tints an original’s glyph in its root colour', () => {
    expect(fileIconChoice(yourNote)).toEqual({
      mark: 'glyph',
      kind: 'note',
      root: 'projects',
    });
    expect(fileIconChoice(inboxPdf)).toEqual({
      mark: 'glyph',
      kind: 'pdf',
      root: 'inbox',
    });
  });
  it('outlines a subfolder in its root colour', () => {
    expect(fileIconChoice(subfolder)).toEqual({
      mark: 'outline',
      kind: 'folder',
      root: 'projects',
    });
  });
  it('draws a root as its disc', () => {
    expect(fileIconChoice(areas)).toEqual({
      mark: 'disc',
      kind: 'folder',
      root: 'areas',
    });
  });
  it('keeps Answers and Clippings muted', () => {
    expect(fileIconChoice(answers)).toEqual({
      mark: 'outline',
      kind: 'folder',
      root: null,
    });
    expect(fileIconChoice(clipping).root).toBeNull();
  });
  it('names the kind and the root', () => {
    expect(
      fileIconLabel({ ...inboxPdf, path: '2-Areas/Visa/Passport copy.pdf' }),
    ).toBe('PDF in Areas');
    expect(fileIconLabel(clipping)).toBe('Note');
  });
});

let root: HTMLDivElement | undefined;

afterEach(() => {
  if (root === undefined) return;
  render(null, root);
  root.remove();
  root = undefined;
});

async function mount(node: preact.VNode): Promise<HTMLElement> {
  const host = document.createElement('div');
  root = host;
  document.body.append(host);
  await act(() => {
    render(node, host);
  });
  const icon = host.querySelector<HTMLElement>('.file-icon');
  if (icon === null) throw new Error('no icon');
  return icon;
}

describe('FileIcon', () => {
  it('renders the still bird mark at the asked size', async () => {
    const icon = await mount(<FileIcon item={bowerNote} size={16} />);
    const svg = icon.querySelector('svg.b.mark');
    expect(svg?.getAttribute('width')).toBe('16');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('strokes a glyph in the root colour token', async () => {
    const icon = await mount(<FileIcon item={inboxPdf} size={20} box />);
    expect(icon.style.color).toBe('var(--color-para-inbox)');
    expect(icon.style.background).toBe('var(--color-surface)');
    expect(icon.querySelector('svg')?.getAttribute('width')).toBe('20');
  });

  it('draws the muted outline for Answers', async () => {
    const icon = await mount(<FileIcon item={answers} size={16} />);
    expect(icon.dataset.mark).toBe('outline');
    expect(icon.style.color).toBe('var(--color-text-muted)');
  });

  it.each([
    [16, 18],
    [20, 18],
    [28, 28],
    [40, 40],
  ] as [FileIconSize, 18 | 28 | 40][])(
    'draws a root at size %i as the %i px disc with its letter size',
    async (size, disc) => {
      const icon = await mount(<FileIcon item={areas} size={size} />);
      const mark = icon.querySelector<HTMLElement>('.folder-mark');
      expect(mark?.classList.contains(`folder-mark-${disc}`)).toBe(true);
      expect(mark?.style.fontSize).toBe(`${MARK_LETTER_PX[disc]}px`);
    },
  );

  it('carries an accessible name when asked', async () => {
    const icon = await mount(<FileIcon item={inboxPdf} size={16} labelled />);
    expect(icon.getAttribute('role')).toBe('img');
    expect(icon.getAttribute('aria-label')).toBe('PDF in Inbox');
    expect(icon.hasAttribute('aria-hidden')).toBe(false);
  });
});
