// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  foldedLabel,
  MadeFrom,
  madeFromSources,
  SOURCES_FOLDED_KEY,
} from '../src/components/made-from.js';
import type { DriveFile } from '../src/drive.js';

function file(path: string): DriveFile {
  return {
    id: `id-${String(path.length)}`,
    name: path.split('/').pop() ?? path,
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path,
  };
}

const CLIP = file('Clippings/Data Lead, Northwind (clip).md');
const CV = file('Applications/CV 2026.docx');
const files = [CLIP, CV];
const lookup = { files, byPath: new Map(files.map((f) => [f.path, f])) };
const note = { path: 'Applications/Data Lead offer.md' };

describe('madeFromSources (R-NOTE-3)', () => {
  it('lists the clip and the advert, never the raw wikilink', () => {
    const sources = madeFromSources({
      note,
      original: '[[Clippings/Data Lead, Northwind (clip).md]]',
      source: 'https://www.careers.northwind.example/jobs/1',
      kind: 'job-offer',
      lookup,
    });
    expect(sources.map((s) => [s.name, s.role, s.href])).toEqual([
      ['Data Lead, Northwind (clip)', 'your clip', `/note/${CLIP.id}`],
      [
        'careers.northwind.example',
        'job advert',
        'https://www.careers.northwind.example/jobs/1',
      ],
    ]);
    expect(JSON.stringify(sources)).not.toContain('[[');
    expect(foldedLabel(sources)).toBe('Made from your clip and a job advert');
  });

  it('names a Word document and a missing original', () => {
    const doc = madeFromSources({
      note,
      original: 'CV 2026.docx',
      source: undefined,
      kind: undefined,
      lookup,
    });
    expect(doc[0]?.role).toBe('Word document');
    expect(doc[0]?.href).toBe(`/file/${CV.id}`);
    expect(foldedLabel(doc)).toBe('Made from your Word document');

    const gone = madeFromSources({
      note,
      original: '[[Nowhere.pdf]]',
      source: 'not a url',
      kind: undefined,
      lookup,
    });
    expect(gone).toHaveLength(1);
    expect(gone[0]?.missing).toBe(true);
    expect(gone[0]?.name).toBe('Nowhere.pdf');
  });
});

describe('MadeFrom (R-NOTE-7)', () => {
  let root: HTMLDivElement;
  beforeEach(() => {
    localStorage.clear();
    root = document.createElement('div');
    document.body.append(root);
  });
  afterEach(() => {
    void act(() => {
      render(null, root);
    });
    root.remove();
  });

  const sources = madeFromSources({
    note,
    original: 'CV 2026.docx',
    source: 'https://jobs.example.com/a',
    kind: 'job-offer',
    lookup,
  });

  it('is open by default, opens the web page in a new tab and folds to one button', async () => {
    await act(() => {
      render(h(MadeFrom, { sources }), root);
    });
    const caption = root.querySelector('.made-from-caption');
    expect(caption?.getAttribute('aria-expanded')).toBe('true');
    const web = root.querySelector<HTMLAnchorElement>('a[target="_blank"]');
    expect(web?.rel).toBe('noopener');

    await act(() => {
      caption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const fold = root.querySelector('.made-from-fold');
    expect(fold?.textContent).toBe(
      'Made from your Word document and a job advert',
    );
    expect(fold?.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('.made-from-list')).toBeNull();
    expect(localStorage.getItem(SOURCES_FOLDED_KEY)).toBe('true');

    await act(() => {
      fold?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(root.querySelector('.made-from-list')).not.toBeNull();
    expect(localStorage.getItem(SOURCES_FOLDED_KEY)).toBe('false');
  });

  it('starts folded when the preference says so, and shows a missing target as text', async () => {
    localStorage.setItem(SOURCES_FOLDED_KEY, 'true');
    await act(() => {
      render(h(MadeFrom, { sources }), root);
    });
    expect(root.querySelector('.made-from-fold')).not.toBeNull();

    await act(() => {
      render(null, root);
    });
    localStorage.setItem(SOURCES_FOLDED_KEY, 'false');
    const gone = madeFromSources({
      note,
      original: 'Nowhere.pdf',
      source: undefined,
      kind: undefined,
      lookup,
    });
    await act(() => {
      render(h(MadeFrom, { sources: gone }), root);
    });
    const missing = root.querySelector('.made-from-missing');
    expect(missing?.textContent).toContain('Nowhere.pdf');
    expect(missing?.textContent).toContain('not found');
    expect(root.querySelector('a.made-from-source')).toBeNull();
  });
});
