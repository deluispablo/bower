import { describe, expect, it } from 'vitest';

import { isOutdatedPrecache, PRECACHE_NAME } from '../src/sw-precache.js';

describe('isOutdatedPrecache', () => {
  it("deletes Workbox's default precache, which held the bad chunk", () => {
    expect(
      isOutdatedPrecache('workbox-precache-v2-https://app.example.com/'),
    ).toBe(true);
  });

  it('deletes another earlier precache name', () => {
    expect(isOutdatedPrecache('bower-precache-v1')).toBe(true);
  });

  it('keeps the current precache', () => {
    expect(isOutdatedPrecache(PRECACHE_NAME)).toBe(false);
  });

  it("keeps the app's other caches", () => {
    expect(isOutdatedPrecache('bower-api')).toBe(false);
    expect(isOutdatedPrecache('bower-share')).toBe(false);
  });
});
