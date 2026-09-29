import { describe, expect, it } from 'vitest';

import {
  originalDisplayName,
  originalTarget,
  resolveOriginal,
} from '../src/companion.js';
import type { DriveFile } from '../src/drive.js';

function file(path: string): DriveFile {
  return {
    id: `id:${path}`,
    name: path.split('/').pop() ?? path,
    mimeType: 'text/plain',
    parents: ['FOLDER_ID'],
    path,
  };
}

function lookup(paths: string[]): {
  files: DriveFile[];
  byPath: Map<string, DriveFile>;
} {
  const files = paths.map(file);
  return { files, byPath: new Map(files.map((f) => [f.path, f])) };
}

const NOTE = { path: 'Applications/Data Lead offer.md' };

describe('originalTarget and originalDisplayName', () => {
  it('strip the wikilink, alias and heading', () => {
    expect(originalTarget('[[Clippings/Data Lead.md|the clip]]')).toBe(
      'Clippings/Data Lead.md',
    );
    expect(originalDisplayName('[[Clippings/Data Lead.md|the clip]]')).toBe(
      'Data Lead.md',
    );
    expect(originalDisplayName('CV 2026.docx')).toBe('CV 2026.docx');
  });
});

describe('resolveOriginal (R-NOTE-3)', () => {
  it('prefers the path the original names', () => {
    const l = lookup(['Clippings/Data Lead.md', 'Applications/Data Lead.md']);
    expect(resolveOriginal(NOTE, '[[Clippings/Data Lead.md]]', l)?.path).toBe(
      'Clippings/Data Lead.md',
    );
  });

  it('then finds the name in the same folder, ignoring case', () => {
    const l = lookup(['Applications/cv 2026.docx', 'Other/cv 2026.docx']);
    expect(resolveOriginal(NOTE, 'CV 2026.docx', l)?.path).toBe(
      'Applications/cv 2026.docx',
    );
  });

  it('then pairs a file that shares the note name', () => {
    const l = lookup(['Applications/Data Lead offer.pdf']);
    expect(resolveOriginal(NOTE, '[[Old name.pdf]]', l)?.path).toBe(
      'Applications/Data Lead offer.pdf',
    );
  });

  it('then falls back to the name anywhere, and to nothing', () => {
    const l = lookup(['Clippings/Data Lead.md']);
    expect(resolveOriginal(NOTE, 'Data Lead.md', l)?.path).toBe(
      'Clippings/Data Lead.md',
    );
    expect(resolveOriginal(NOTE, 'Missing.md', l)).toBeUndefined();
    expect(resolveOriginal(NOTE, undefined, l)).toBeUndefined();
  });
});
