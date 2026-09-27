import { describe, expect, it } from 'vitest';

import type { Me } from '../src/api.js';
import { parseFolderId, shouldShowTour } from '../src/onboarding.js';

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

describe('shouldShowTour', () => {
  const base: Me = {
    email: 'you@example.com',
    vault: { folderId: 'FOLDER_ID', inboxFolderId: 'FOLDER_ID', name: 'Bower' },
    quota: { used: 0, limit: 10 },
    needsReauth: false,
    hasApiKey: false,
  };
  const seen: Me = { ...base, tourSeenAt: '2026-09-27T10:00:00.000Z' };

  it('shows the tour to an account with a folder that has not seen it', () => {
    expect(shouldShowTour(base, false)).toBe(true);
  });

  it('does not show it again once it was seen', () => {
    expect(shouldShowTour(seen, false)).toBe(false);
  });

  it('replays it from Settings even when it was seen', () => {
    expect(shouldShowTour(seen, true)).toBe(true);
  });

  it('waits for a folder before the first tour', () => {
    expect(shouldShowTour({ ...base, vault: null }, false)).toBe(false);
  });
});
