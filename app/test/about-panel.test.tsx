// @vitest-environment jsdom

/**
 * About this note / About this file (#912, R-ABOUT-1..3): the same "In
 * this folder" list on a note and a file of one folder, in tree order, and
 * the Source row by name, a link, with no brackets and no extension.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { siblings } from '../src/folder-view.js';
import { buildTree } from '../src/navigation.js';
import { noteMetaFrom } from '../src/note-meta.js';
import { currentToast, dismissToast } from '../src/toast-store.js';
import { buildVaultIndex } from '../src/vault-index.js';

vi.mock('../src/cache.js', () => ({
  loadNote: () => Promise.resolve(undefined),
  loadNoteMetaEntry: () => Promise.resolve(undefined),
}));

const { AboutPanel, aboutSource } =
  await import('../src/components/about-panel.js');

const FOLDER = '1-Projects/Job Search Australia';

function item(name: string, mimeType: string): DriveFile {
  return {
    id: `id-${name}`,
    name,
    mimeType,
    parents: ['FOLDER_ID'],
    path: `${FOLDER}/${name}`,
    modifiedTime: '2026-09-29T10:00:00Z',
  };
}

const HUB = item('Job Search Australia.md', 'text/markdown');
const LETTER = item('Cover Letter - Alex.pdf', 'application/pdf');
const INSIGHTS = item('CV insights.md', 'text/markdown');
const RESUME = item(
  'Resume Australia.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
);

const index = buildVaultIndex([RESUME, INSIGHTS, LETTER, HUB]);
const meta = noteMetaFrom({
  by: 'bower',
  original: '[[Resume Australia.docx]]',
});

const roots: HTMLDivElement[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    render(null, root);
    root.remove();
  }
});

async function mount(
  props: Parameters<typeof AboutPanel>[0],
): Promise<HTMLDivElement> {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  await act(() => {
    render(h(AboutPanel, props), root);
  });
  return root;
}

function folderRows(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('.about-folder-row')).map(
    (row) => row.textContent ?? '',
  );
}

describe('About this note and About this file', () => {
  it('lists the same siblings in tree order on a note and a file, the one on show selected', async () => {
    const folder = { name: 'Job Search Australia', href: '/folder/x' };
    const note = await mount({
      kind: 'note',
      index,
      file: INSIGHTS,
      html: '<h2 id="why">Why</h2>',
      properties: { tags: ['summary', 'career'], created: '2026-09-29' },
      folder,
      meta,
      items: siblings(INSIGHTS, buildTree(index)),
    });
    const file = await mount({
      kind: 'file',
      index,
      file: LETTER,
      folder,
      rows: {
        kind: 'PDF, 117 KB',
        filed: 'yesterday, by Bower, as it is',
        driveHref: null,
      },
      items: siblings(LETTER, buildTree(index)),
    });

    const expected = [
      'Job Search Australia',
      'Cover Letter - Alex',
      'CV insights',
      'Resume Australia',
    ];
    expect(folderRows(note)).toEqual(expected);
    expect(folderRows(file)).toEqual(expected);
    expect(
      note.querySelector('.about-folder-row[aria-current="page"]')?.textContent,
    ).toBe('CV insights');
    expect(
      file.querySelector('.about-folder-row[aria-current="page"]')?.textContent,
    ).toBe('Cover Letter - Alex');
    expect(
      note.querySelectorAll(
        '.about-folder-row .file-icon, .about-folder-row svg',
      ).length,
    ).toBeGreaterThan(0);

    expect(note.querySelector('.about-heading')?.textContent).toBe(
      'About this note',
    );
    expect(file.querySelector('.about-heading')?.textContent).toBe(
      'About this file',
    );
    const fileRows = Array.from(file.querySelectorAll('.about-prop')).map(
      (row) => row.textContent,
    );
    expect(fileRows).toEqual([
      'FolderJob Search Australia',
      'KindPDF, 117 KB',
      'Filedyesterday, by Bower, as it is',
      'In DriveOpen in Drive',
    ]);
    // The demo: Open in Drive is a text link that says why it does nothing
    // (FI-Main-1280, #920 DA-21).
    const drive = file.querySelector<HTMLButtonElement>('.about-prop-drive');
    expect(drive?.disabled).toBe(false);
    expect(drive?.querySelector('svg')).toBeNull();
    drive?.click();
    expect(currentToast()?.message).toBe(
      'Not in the demo. Run your own Bower to use it.',
    );
    dismissToast();
  });

  it('shows Source as a link by name, without brackets or extension, with its kind', async () => {
    expect(aboutSource(index, INSIGHTS, meta, undefined)).toEqual({
      name: 'Resume Australia',
      href: `/file/${RESUME.id}`,
      kind: 'Word',
    });
    const root = await mount({
      kind: 'note',
      index,
      file: INSIGHTS,
      html: '',
      properties: { tags: [] },
      meta,
      items: [],
    });
    const link = root.querySelector(`.about-prop a[href="/file/${RESUME.id}"]`);
    expect(link?.textContent).toBe('Resume Australia');
    expect(root.querySelector('.about-prop-kind')?.textContent?.trim()).toBe(
      'Word',
    );
    expect(root.textContent).not.toContain('[[');
    expect(root.textContent).not.toContain('.docx');
  });

  it('leaves the overline out in the phone sheet', async () => {
    const root = await mount({
      kind: 'file',
      index,
      file: LETTER,
      rows: { kind: 'PDF', filed: '', driveHref: null },
      items: [],
      inSheet: true,
    });
    expect(root.querySelector('.about-properties .about-heading')).toBeNull();
    expect(root.textContent).not.toContain('Filed');
  });
});
