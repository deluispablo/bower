import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { buildVaultIndex } from '../src/vault-index.js';

let nextId = 0;

function entry(path: string, mimeType = 'text/markdown'): DriveFile {
  nextId++;
  const name = path.split('/').pop() ?? path;
  return { id: `id${nextId}`, name, mimeType, parents: ['PARENT'], path };
}

function dir(path: string): DriveFile {
  return entry(path, FOLDER_MIME);
}

describe('buildVaultIndex', () => {
  const files = [
    dir('.obsidian'),
    entry('.obsidian/app.json', 'application/json'),
    dir('0-Inbox'),
    dir('0-Inbox/Processed'),
    entry('0-Inbox/Processed/scan.pdf', 'application/pdf'),
    dir('1-Projects'),
    dir('1-Projects/Garden'),
    dir('1-Projects/Garden/Processed'),
    entry('1-Projects/Garden/Processed/old.md'),
    entry('1-Projects/_Garden.md'),
    entry('1-Projects/Garden/Seed List.md'),
    entry('1-Projects/Garden/photo.JPG', 'image/jpeg'),
    entry('2-Areas/seed list.MD'),
    entry('_notes.txt', 'text/plain'),
    entry('index.md'),
  ];
  const index = buildVaultIndex(files);

  it('hides .obsidian, _*.md folder notes and anything under Processed/', () => {
    const paths = [...index.byPath.keys()].sort();
    expect(paths).toEqual([
      '0-Inbox',
      '1-Projects',
      '1-Projects/Garden',
      '1-Projects/Garden/Seed List.md',
      '1-Projects/Garden/photo.JPG',
      '2-Areas/seed list.MD',
      '_notes.txt',
      'index.md',
    ]);
    expect(index.byId.size).toBe(paths.length);
  });

  it('maps by id and by path', () => {
    const seeds = index.byPath.get('1-Projects/Garden/Seed List.md');
    expect(seeds?.name).toBe('Seed List.md');
    expect(seeds && index.byId.get(seeds.id)).toBe(seeds);
  });

  it('maps lower-cased basenames without extension to every match', () => {
    expect(
      index.byBasename
        .get('seed list')
        ?.map((f) => f.path)
        .sort(),
    ).toEqual(['1-Projects/Garden/Seed List.md', '2-Areas/seed list.MD']);
    expect(index.byBasename.get('photo')?.map((f) => f.name)).toEqual([
      'photo.JPG',
    ]);
    expect(index.byBasename.has('garden')).toBe(false);
    expect(index.byBasename.has('old')).toBe(false);
  });

  it('lists visible folders and Markdown notes', () => {
    expect(index.folders.map((f) => f.path)).toEqual([
      '0-Inbox',
      '1-Projects',
      '1-Projects/Garden',
    ]);
    expect(index.notes.map((f) => f.path)).toEqual([
      '1-Projects/Garden/Seed List.md',
      '2-Areas/seed list.MD',
      'index.md',
    ]);
  });
});
