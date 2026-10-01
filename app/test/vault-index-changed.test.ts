import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { changedUnder } from '../src/vault-index.js';

function file(
  path: string,
  mimeType: string,
  modifiedTime?: string,
): DriveFile {
  return {
    id: `id-${path}`,
    name: path.split('/').pop() ?? path,
    mimeType,
    parents: ['FOLDER_ID'],
    path,
    ...(modifiedTime === undefined ? {} : { modifiedTime }),
  };
}

const files = [
  file('2-Areas', FOLDER_MIME),
  file('2-Areas/Visa', FOLDER_MIME),
  file(
    '2-Areas/Visa/Passport copy.pdf',
    'application/pdf',
    '2026-09-29T15:03:00Z',
  ),
  file('2-Areas/Visa/Visa.md', 'text/markdown', '2026-09-29T15:02:00Z'),
  file('2-Areas/Health', FOLDER_MIME),
  file('2-Areas/Health/Plan.md', 'text/markdown', '2026-09-20T09:00:00Z'),
  file('1-Projects/Other.md', 'text/markdown', '2026-09-30T09:00:00Z'),
];
const byPath = new Map(files.map((one) => [one.path, one]));

describe('changedUnder (R-API-1)', () => {
  it('lists the files under a folder at any depth, newest first, no folders', () => {
    expect(changedUnder(byPath, '2-Areas').map((one) => one.name)).toEqual([
      'Passport copy.pdf',
      'Visa.md',
      'Plan.md',
    ]);
  });

  it('keeps at most `max`, and a folder of its own only', () => {
    expect(changedUnder(byPath, '2-Areas', 1)).toHaveLength(1);
    expect(
      changedUnder(byPath, '2-Areas/Health').map((one) => one.name),
    ).toEqual(['Plan.md']);
  });
});
