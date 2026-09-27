import { describe, expect, it } from 'vitest';

import {
  filesFromPickerResponse,
  folderIdFromPickerResponse,
} from '../src/picker.js';

describe('folderIdFromPickerResponse', () => {
  it('returns the folder id for a picked response', () => {
    expect(
      folderIdFromPickerResponse({
        action: 'picked',
        docs: [{ id: 'FOLDER_ID' }],
      }),
    ).toBe('FOLDER_ID');
  });

  it('returns null when the user cancelled', () => {
    expect(folderIdFromPickerResponse({ action: 'cancel' })).toBeNull();
  });

  it('returns null for a picked response with no docs', () => {
    expect(folderIdFromPickerResponse({ action: 'picked' })).toBeNull();
  });

  it('returns null for a picked response with an empty docs array', () => {
    expect(
      folderIdFromPickerResponse({ action: 'picked', docs: [] }),
    ).toBeNull();
  });

  it('returns null for an unexpected action', () => {
    expect(folderIdFromPickerResponse({ action: 'loaded' })).toBeNull();
  });
});

describe('filesFromPickerResponse', () => {
  it('returns every picked file and folder, folders flagged', () => {
    expect(
      filesFromPickerResponse(
        {
          action: 'picked',
          docs: [
            {
              id: 'PDF_ID',
              name: 'Lease agreement.pdf',
              mimeType: 'application/pdf',
              parentId: 'OTHER_ID',
            },
            {
              id: 'DIR_ID',
              name: 'Tax 2025',
              mimeType: 'application/vnd.google-apps.folder',
            },
          ],
        },
        'FOLDER_ID',
      ),
    ).toEqual({
      items: [
        {
          id: 'PDF_ID',
          name: 'Lease agreement.pdf',
          mimeType: 'application/pdf',
          isFolder: false,
        },
        {
          id: 'DIR_ID',
          name: 'Tax 2025',
          mimeType: 'application/vnd.google-apps.folder',
          isFolder: true,
        },
      ],
      excluded: 0,
    });
  });

  it('leaves out the Bower folder and what sits right in it', () => {
    const result = filesFromPickerResponse(
      {
        action: 'picked',
        docs: [
          { id: 'FOLDER_ID', name: 'Bower' },
          { id: 'INBOX_ID', name: '0-Inbox', parentId: 'FOLDER_ID' },
          { id: 'PHOTO_ID', name: 'IMG_1.jpg', mimeType: 'image/jpeg' },
        ],
      },
      'FOLDER_ID',
    );
    expect(result.items.map((item) => item.id)).toEqual(['PHOTO_ID']);
    expect(result.excluded).toBe(2);
  });

  it('names an untitled pick and skips one without an id', () => {
    const result = filesFromPickerResponse(
      { action: 'picked', docs: [{ id: '' }, { id: 'X_ID' }] },
      null,
    );
    expect(result.items).toEqual([
      { id: 'X_ID', name: 'Untitled', mimeType: '', isFolder: false },
    ]);
  });

  it('returns nothing for an empty or cancelled response', () => {
    const empty = { items: [], excluded: 0 };
    expect(filesFromPickerResponse({ action: 'picked' }, 'FOLDER_ID')).toEqual(
      empty,
    );
    expect(
      filesFromPickerResponse({ action: 'picked', docs: [] }, 'FOLDER_ID'),
    ).toEqual(empty);
    expect(filesFromPickerResponse({ action: 'cancel' }, 'FOLDER_ID')).toEqual(
      empty,
    );
  });
});
