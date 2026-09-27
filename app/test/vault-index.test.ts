import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  appFileLabel,
  buildVaultIndex,
  isAppFile,
} from '../src/vault-index.js';

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

describe('isAppFile', () => {
  it('is true for each top-level file Bower keeps for itself', () => {
    for (const name of [
      'CLAUDE.md',
      'index.md',
      'log.md',
      'About-Me.md',
      'README.md',
      'Lint Report.md',
    ]) {
      expect(isAppFile(name, name)).toBe(true);
    }
  });

  it('is true for a dated Lint Report at the top level', () => {
    expect(
      isAppFile('Lint Report 2026-09-01.md', 'Lint Report 2026-09-01.md'),
    ).toBe(true);
  });

  it('is case-insensitive on the extension only', () => {
    expect(isAppFile('CLAUDE.MD', 'CLAUDE.MD')).toBe(true);
    expect(isAppFile('index.Md', 'index.Md')).toBe(true);
  });

  it('is false once one of those names is nested (not top-level)', () => {
    expect(isAppFile('1-Projects/index.md', 'index.md')).toBe(false);
    expect(isAppFile('1-Projects/CLAUDE.md', 'CLAUDE.md')).toBe(false);
  });

  it('is true for an instruction note (Bower - *.md) at any depth', () => {
    const name = 'Bower - 2026-09-26 1405 Receipts.md';
    expect(isAppFile(name, name)).toBe(true);
    expect(isAppFile(`0-Inbox/${name}`, name)).toBe(true);
    expect(isAppFile(`1-Projects/Garden/${name}`, name)).toBe(true);
  });

  it('is false for a user note that merely starts with "Bower" (no dash)', () => {
    expect(isAppFile('Bower notes.md', 'Bower notes.md')).toBe(false);
    expect(isAppFile('0-Inbox/Bower notes.md', 'Bower notes.md')).toBe(false);
  });

  it('is false for a folder note (that stays hidden for its own reason)', () => {
    expect(isAppFile('1-Projects/_Folder.md', '_Folder.md')).toBe(false);
  });

  it('is false for an ordinary user note', () => {
    expect(isAppFile('1-Projects/Plan.md', 'Plan.md')).toBe(false);
  });

  it('is false for a non-Markdown file, even with a matching name', () => {
    expect(isAppFile('README.txt', 'README.txt')).toBe(false);
  });
});

describe('appFileLabel', () => {
  it('maps each top-level file to its friendly name', () => {
    expect(appFileLabel('CLAUDE.md')).toBe('Rulebook');
    expect(appFileLabel('index.md')).toBe('Catalogue');
    expect(appFileLabel('log.md')).toBe('Journal');
    expect(appFileLabel('About-Me.md')).toBe('About me');
    expect(appFileLabel('README.md')).toBe('Read me');
    expect(appFileLabel('Lint Report.md')).toBe('Health report');
  });

  it('maps a dated Lint Report to "Health report" too', () => {
    expect(appFileLabel('Lint Report 2026-09-01.md')).toBe('Health report');
  });

  it('labels an instruction note by its own title', () => {
    expect(appFileLabel('Bower - 2026-09-26 1405 Receipts.md')).toBe(
      'Bower - 2026-09-26 1405 Receipts',
    );
  });
});
