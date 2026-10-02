// @vitest-environment jsdom

/**
 * #1003 (R-SYS-7): the file page's pager said "2 of 9 in Finance" while the
 * folder said "8 things": it counted the page Bower wrote for the folder.
 * The pager walks the folder's things without it, so its count is the
 * folder's own (`folderCount`).
 */

import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { siblings } from '../src/folder-view.js';
import { buildTree, folderCount } from '../src/navigation.js';
import { pagerItems } from '../src/components/bower-folder-pages.js';
import { pagerPlace } from '../src/components/pager.js';
import { buildVaultIndex } from '../src/vault-index.js';

const FOLDER = '2-Areas/Finance';

function item(name: string, mimeType: string): DriveFile {
  return {
    id: `id-${name}`,
    name,
    mimeType,
    parents: ['FOLDER_ID'],
    path: `${FOLDER}/${name}`,
    modifiedTime: '2026-10-01T10:00:00Z',
  };
}

const PAGE = item('Finance.md', 'text/markdown');
const things = [
  item('Payslip September.pdf', 'application/pdf'),
  item('Payslip August.pdf', 'application/pdf'),
  item('Tax return 2025.pdf', 'application/pdf'),
  item('Bank statement.csv', 'text/csv'),
  item('Receipt.jpg', 'image/jpeg'),
  item('Budget.md', 'text/markdown'),
  item('Pension.pdf', 'application/pdf'),
  item('Insurance.pdf', 'application/pdf'),
];
const index = buildVaultIndex([PAGE, ...things]);
const bowerPages: ReadonlySet<string> = new Set([PAGE.id]);

describe('the file pager count (AC5)', () => {
  it('matches the folder count, leaving out the page Bower wrote for it', () => {
    const all = siblings(things[1] as DriveFile, buildTree(index));
    expect(all).toHaveLength(9);
    const walked = pagerItems(all, bowerPages);
    const place = pagerPlace(walked, (things[1] as DriveFile).id);
    expect(place?.total).toBe(
      folderCount(index, FOLDER, { exclude: bowerPages }),
    );
    expect(place?.total).toBe(8);
  });

  it('keeps every sibling when the folder has no page of its own', () => {
    const all = siblings(things[0] as DriveFile, buildTree(index));
    expect(pagerItems(all, new Set())).toEqual(all);
  });
});
