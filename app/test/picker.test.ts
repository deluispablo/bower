import { describe, expect, it } from 'vitest';

import { folderIdFromPickerResponse } from '../src/picker.js';

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
