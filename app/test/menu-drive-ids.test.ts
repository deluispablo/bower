/** The Drive ids the tab ⋯ menus open (R-API-5, #922). */

import { describe, expect, it } from 'vitest';

import { RULES_FILE_PATH, menuDriveIds } from '../src/menu-drive-ids.js';

const vault = { folderId: 'FOLDER_ID', inboxFolderId: 'INBOX_FOLDER_ID' };
const byPath = new Map([[RULES_FILE_PATH, { id: 'RULES_ID' }]]);

describe('menuDriveIds', () => {
  it('gives the Bower folder, the inbox and the rules file once loaded', () => {
    expect(menuDriveIds({ vault, byPath })).toEqual({
      root: 'FOLDER_ID',
      inbox: 'INBOX_FOLDER_ID',
      rules: 'RULES_ID',
    });
  });

  it('leaves every id out while the account and the listing load', () => {
    expect(menuDriveIds({ vault: undefined, byPath: undefined })).toEqual({});
    expect(menuDriveIds({ vault: null, byPath: null })).toEqual({});
  });

  it('gives the folder ids before the listing has the rules file', () => {
    expect(menuDriveIds({ vault, byPath: new Map() })).toEqual({
      root: 'FOLDER_ID',
      inbox: 'INBOX_FOLDER_ID',
    });
  });

  it('hides the folder items when the folder is gone, and blank ids', () => {
    expect(
      menuDriveIds({
        vault: { ...vault, missingAt: '2026-09-30T10:00:00.000Z' },
        byPath,
      }),
    ).toEqual({ rules: 'RULES_ID' });
    expect(
      menuDriveIds({
        vault: { folderId: '', inboxFolderId: '' },
        byPath: new Map([[RULES_FILE_PATH, { id: '' }]]),
      }),
    ).toEqual({});
  });
});
