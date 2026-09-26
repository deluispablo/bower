import { describe, expect, it } from 'vitest';

import { formatAgo, sameListing } from '../src/vault-store.js';

describe('sameListing', () => {
  it('is true for two empty listings', () => {
    expect(sameListing([], [])).toBe(true);
  });

  it('is true when every id and modifiedTime match, in order', () => {
    const a = [
      { id: '1', modifiedTime: 'v1' },
      { id: '2', modifiedTime: 'v1' },
    ];
    const b = [
      { id: '1', modifiedTime: 'v1' },
      { id: '2', modifiedTime: 'v1' },
    ];
    expect(sameListing(a, b)).toBe(true);
  });

  it('is false when a file changed', () => {
    const a = [{ id: '1', modifiedTime: 'v1' }];
    const b = [{ id: '1', modifiedTime: 'v2' }];
    expect(sameListing(a, b)).toBe(false);
  });

  it('is false when a file was added or removed', () => {
    const a = [{ id: '1', modifiedTime: 'v1' }];
    const b = [
      { id: '1', modifiedTime: 'v1' },
      { id: '2', modifiedTime: 'v1' },
    ];
    expect(sameListing(a, b)).toBe(false);
    expect(sameListing(b, a)).toBe(false);
  });

  it('treats a missing modifiedTime consistently', () => {
    const a = [{ id: '1' }];
    const b = [{ id: '1' }];
    expect(sameListing(a, b)).toBe(true);
  });
});

describe('formatAgo', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');

  it('says "just now" under a minute', () => {
    expect(formatAgo('2026-01-01T11:59:30.000Z', now)).toBe('just now');
  });

  it('says "N min ago" under an hour', () => {
    expect(formatAgo('2026-01-01T11:58:00.000Z', now)).toBe('2 min ago');
  });

  it('says "N h ago" under a day', () => {
    expect(formatAgo('2026-01-01T11:00:00.000Z', now)).toBe('1 h ago');
  });

  it('says "yesterday" past a day', () => {
    expect(formatAgo('2025-12-30T12:00:00.000Z', now)).toBe('yesterday');
  });

  it('accepts a plain epoch-ms `now` too', () => {
    expect(formatAgo('2026-01-01T11:59:30.000Z', now.getTime())).toBe(
      'just now',
    );
  });
});
