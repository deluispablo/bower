import { describe, expect, it } from 'vitest';

import { firstVisitOpen } from '../src/components/tree.js';
import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { buildTree } from '../src/navigation.js';
import { buildVaultIndex } from '../src/vault-index.js';

function dir(path: string): DriveFile {
  return {
    id: `id-${path}`,
    name: path.split('/').pop() ?? path,
    mimeType: FOLDER_MIME,
    path,
    parents: [],
  };
}

const TREE = buildTree(
  buildVaultIndex([
    dir('0-Inbox'),
    dir('1-Projects'),
    dir('1-Projects/Garden'),
    dir('2-Areas'),
    dir('3-Resources'),
    dir('4-Archives'),
  ]),
);

describe('firstVisitOpen (#950)', () => {
  it('opens Projects and Areas in the demo', () => {
    expect(firstVisitOpen(TREE, true)).toEqual(['1-Projects', '2-Areas']);
  });

  it('opens nothing for a real folder', () => {
    expect(firstVisitOpen(TREE, false)).toEqual([]);
  });
});
