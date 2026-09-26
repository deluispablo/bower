import { describe, expect, it } from 'vitest';

import { uniqueName } from '../src/upload-names.js';

describe('uniqueName', () => {
  it('returns the name unchanged when it is not taken', () => {
    expect(uniqueName('photo.jpg', new Set())).toBe('photo.jpg');
    expect(uniqueName('photo.jpg', new Set(['other.jpg']))).toBe('photo.jpg');
  });

  it('appends (2) before the extension on the first collision', () => {
    expect(uniqueName('photo.jpg', new Set(['photo.jpg']))).toBe(
      'photo (2).jpg',
    );
  });

  it('counts up past existing (2), (3), … candidates', () => {
    const existing = new Set(['photo.jpg', 'photo (2).jpg', 'photo (3).jpg']);
    expect(uniqueName('photo.jpg', existing)).toBe('photo (4).jpg');
  });

  it('compares names case-insensitively', () => {
    expect(uniqueName('Photo.JPG', new Set(['photo.jpg']))).toBe(
      'Photo (2).JPG',
    );
  });

  it('handles a name with no extension', () => {
    expect(uniqueName('README', new Set(['README']))).toBe('README (2)');
  });

  it('handles a dotfile with no extension as a whole name', () => {
    expect(uniqueName('.gitignore', new Set(['.gitignore']))).toBe(
      '.gitignore (2)',
    );
  });

  it('handles a name with multiple dots, keeping the last as the extension', () => {
    expect(uniqueName('notes.v2.md', new Set(['notes.v2.md']))).toBe(
      'notes.v2 (2).md',
    );
  });

  it('does not mutate the existing set', () => {
    const existing = new Set(['photo.jpg']);
    uniqueName('photo.jpg', existing);
    expect(existing).toEqual(new Set(['photo.jpg']));
  });
});
