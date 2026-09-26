import { describe, expect, it } from 'vitest';

import { parseFolderId } from '../src/onboarding.js';

describe('parseFolderId', () => {
  it('accepts a bare folder id', () => {
    expect(parseFolderId('FOLDER_ID')).toBe('FOLDER_ID');
  });

  it('trims surrounding whitespace', () => {
    expect(parseFolderId('  FOLDER_ID  ')).toBe('FOLDER_ID');
  });

  it('accepts a drive.google.com/drive/folders/<id> link', () => {
    expect(
      parseFolderId('https://drive.google.com/drive/folders/FOLDER_ID'),
    ).toBe('FOLDER_ID');
  });

  it('accepts a drive.google.com/drive/u/0/folders/<id>?usp=… link', () => {
    expect(
      parseFolderId(
        'https://drive.google.com/drive/u/0/folders/FOLDER_ID?usp=sharing',
      ),
    ).toBe('FOLDER_ID');
  });

  it('accepts a drive.google.com/open?id=<id> link', () => {
    expect(parseFolderId('https://drive.google.com/open?id=FOLDER_ID')).toBe(
      'FOLDER_ID',
    );
  });

  it('returns null for an empty or blank string', () => {
    expect(parseFolderId('')).toBeNull();
    expect(parseFolderId('   ')).toBeNull();
  });

  it('returns null for a link to a different host', () => {
    expect(
      parseFolderId('https://example.com/drive/folders/FOLDER_ID'),
    ).toBeNull();
  });

  it('returns null for a Drive link with no folder id', () => {
    expect(parseFolderId('https://drive.google.com/drive/my-drive')).toBeNull();
  });

  it('returns null for arbitrary text', () => {
    expect(parseFolderId('not a folder link')).toBeNull();
  });
});
