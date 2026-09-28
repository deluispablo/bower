import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  appFileLabel,
  buildVaultIndex,
  fileKind,
  fileTitle,
  isAppFile,
  isHidden,
  parseCatalogueFiles,
  withRulesVersion,
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
    dir('.claude'),
    entry('.claude/settings.json', 'application/json'),
    entry('.hidden.md'),
    dir('0-Inbox'),
    dir('0-Inbox/Processed'),
    entry('0-Inbox/Processed/scan.pdf', 'application/pdf'),
    dir('1-Projects'),
    dir('1-Projects/Garden'),
    dir('1-Projects/Garden/Processed'),
    entry('1-Projects/Garden/Processed/old.md'),
    dir('1-Projects/Garden/.trash'),
    entry('1-Projects/Garden/.trash/deleted.md'),
    entry('1-Projects/_Garden.md'),
    entry('1-Projects/Garden/Seed List.md'),
    entry('1-Projects/Garden/photo.JPG', 'image/jpeg'),
    entry('2-Areas/seed list.MD'),
    entry('_notes.txt', 'text/plain'),
    entry('index.md'),
  ];
  const index = buildVaultIndex(files);

  it('hides dot-folders at any depth, dot-files, _*.md folder notes and anything under Processed/', () => {
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

  it('sets aside the top-level `.claude` folder as `agentSettingsFolder`', () => {
    expect(index.agentSettingsFolder?.path).toBe('.claude');
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

describe('isHidden', () => {
  it('hides a dot-folder at the top level (depth 0)', () => {
    expect(isHidden(dir('.trash'))).toBe(true);
    expect(isHidden(entry('.trash/x.md'))).toBe(true);
  });

  it('hides a dot-folder nested two levels deep (depth 2)', () => {
    expect(isHidden(dir('1-Projects/Garden/.smart-connections'))).toBe(true);
    expect(
      isHidden(entry('1-Projects/Garden/.smart-connections/data.json')),
    ).toBe(true);
  });

  it('hides a `.hidden.md`-style file even outside any dot-folder', () => {
    expect(isHidden(entry('.hidden.md'))).toBe(true);
    expect(isHidden(entry('1-Projects/.hidden.md'))).toBe(true);
  });

  it('still hides anything under Processed/, unchanged', () => {
    expect(isHidden(dir('0-Inbox/Processed'))).toBe(true);
    expect(
      isHidden(entry('0-Inbox/Processed/scan.pdf', 'application/pdf')),
    ).toBe(true);
  });

  it('does not hide a folder or file that merely contains a dot', () => {
    expect(isHidden(dir('2026.Q1'))).toBe(false);
    expect(isHidden(entry('1-Projects/Garden/Seed List.md'))).toBe(false);
  });
});

describe('isAppFile', () => {
  it('is true for each top-level file Bower keeps for itself', () => {
    for (const name of [
      'CLAUDE.md',
      'Rules.md',
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
    expect(isAppFile('3-Resources/Rules.md', 'Rules.md')).toBe(false);
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
    expect(appFileLabel('Rules.md')).toBe('Your rules');
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

describe('bowerRulesVersion', () => {
  it('starts unknown and is set by withRulesVersion, nothing else changed', () => {
    const index = buildVaultIndex([entry('CLAUDE.md'), entry('Rules.md')]);
    expect(index.bowerRulesVersion).toBeNull();
    const versioned = withRulesVersion(index, 2);
    expect(versioned.bowerRulesVersion).toBe(2);
    expect(versioned.byPath).toBe(index.byPath);
    expect(index.bowerRulesVersion).toBeNull();
  });
});

describe('files', () => {
  it('lists every visible file that is not a note, apart from the notes', () => {
    const index = buildVaultIndex([
      dir('1-Projects'),
      entry('1-Projects/Plan.md'),
      entry('1-Projects/Lease.pdf', 'application/pdf'),
      entry('1-Projects/Processed/Old.pdf', 'application/pdf'),
      entry('.obsidian/app.json', 'application/json'),
    ]);
    expect(index.files.map((f) => f.path)).toEqual(['1-Projects/Lease.pdf']);
    expect(index.notes.map((f) => f.path)).toEqual(['1-Projects/Plan.md']);
  });
});

describe('fileKind', () => {
  it('tells a file’s kind from its name and type', () => {
    const kind = (name: string, mimeType: string): string =>
      fileKind({ name, mimeType });
    expect(kind('a.md', 'text/markdown')).toBe('note');
    expect(kind('a.pdf', 'application/pdf')).toBe('pdf');
    expect(kind('a.jpg', 'image/jpeg')).toBe('photo');
    expect(kind('a.svg', 'image/svg+xml')).toBe('image');
    expect(kind('a', 'application/vnd.google-apps.document')).toBe('doc');
    expect(kind('a', 'application/vnd.google-apps.spreadsheet')).toBe('sheet');
    expect(kind('a.m4a', 'audio/mp4')).toBe('audio');
    expect(kind('a.zip', 'application/zip')).toBe('file');
  });
});

describe('fileTitle', () => {
  it('drops the extension only', () => {
    expect(fileTitle('Lease agreement 2026.pdf')).toBe('Lease agreement 2026');
    expect(fileTitle('Budget')).toBe('Budget');
    expect(fileTitle('.env')).toBe('.env');
  });
});

describe('parseCatalogueFiles', () => {
  const catalogue = [
    '# Index',
    '',
    '## Projects',
    '- [[1-Projects/Flat hunt/Flat hunt]]',
    '- [[1-Projects/Flat hunt/Lease agreement 2026.pdf]] · PDF · filed by Bower',
    '- [[1-Projects/Flat hunt/Arlington Road, window sign.jpg]] · Photo · filed by Bower',
    '- [[2-Areas/Finance/Budget.xlsx]] · Spreadsheet · filed by Bower',
    '- [[3-Resources/Recipes/Bread.md]] · Note · your note',
    '- [[1-Projects/Flat hunt/Lease agreement 2026.pdf]] · PDF · your note',
    '- [[Scan.pdf|the scan]] · PDF',
    'Loose text with [[Not a row.pdf]] in it',
  ].join('\n');

  it('reads the file rows the agent writes, with path, folder, type and origin', () => {
    expect(parseCatalogueFiles(catalogue)).toEqual([
      {
        path: '1-Projects/Flat hunt/Lease agreement 2026.pdf',
        folder: '1-Projects/Flat hunt',
        type: 'PDF',
        kind: 'pdf',
        origin: 'filed by Bower',
      },
      {
        path: '1-Projects/Flat hunt/Arlington Road, window sign.jpg',
        folder: '1-Projects/Flat hunt',
        type: 'Photo',
        kind: 'photo',
        origin: 'filed by Bower',
      },
      {
        path: '2-Areas/Finance/Budget.xlsx',
        folder: '2-Areas/Finance',
        type: 'Spreadsheet',
        kind: null,
        origin: 'filed by Bower',
      },
      { path: 'Scan.pdf', folder: '', type: 'PDF', kind: 'pdf', origin: '' },
    ]);
  });

  it('finds nothing in a catalogue with notes only', () => {
    expect(parseCatalogueFiles('## Meta\n- [[About-Me]]\n- [[log]]\n')).toEqual(
      [],
    );
  });
});
