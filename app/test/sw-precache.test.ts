import { describe, expect, it } from 'vitest';

import {
  isCacheablePrecacheResponse,
  isOutdatedPrecache,
  PRECACHE_NAME,
} from '../src/sw-precache.js';

const at = (path: string): URL => new URL(path, 'https://app.example.com');

describe('isCacheablePrecacheResponse', () => {
  it('refuses the SPA served as a JS chunk', () => {
    expect(
      isCacheablePrecacheResponse(
        at('/assets/picker-abc123.js'),
        200,
        'text/html; charset=utf-8',
      ),
    ).toBe(false);
  });

  it('refuses the SPA served as a stylesheet', () => {
    expect(
      isCacheablePrecacheResponse(
        at('/assets/index-abc.css'),
        200,
        'text/html',
      ),
    ).toBe(false);
  });

  it('refuses a chunk with no content-type', () => {
    expect(
      isCacheablePrecacheResponse(at('/assets/add-abc.js'), 200, null),
    ).toBe(false);
  });

  it('keeps a real JS chunk, with or without a charset', () => {
    expect(
      isCacheablePrecacheResponse(
        at('/assets/add-abc.js?__WB_REVISION__=1'),
        200,
        'application/javascript',
      ),
    ).toBe(true);
    expect(
      isCacheablePrecacheResponse(
        at('/assets/add-abc.js'),
        200,
        'Text/JavaScript; charset=utf-8',
      ),
    ).toBe(true);
  });

  it('keeps a real stylesheet', () => {
    expect(
      isCacheablePrecacheResponse(
        at('/assets/index-abc.css'),
        200,
        'text/css; charset=utf-8',
      ),
    ).toBe(true);
  });

  it('keeps index.html and files outside /assets/', () => {
    expect(
      isCacheablePrecacheResponse(at('/index.html'), 200, 'text/html'),
    ).toBe(true);
    expect(
      isCacheablePrecacheResponse(at('/fonts/inter.woff2'), 200, 'font/woff2'),
    ).toBe(true);
  });

  it("refuses an error status, like Workbox's default check", () => {
    expect(
      isCacheablePrecacheResponse(
        at('/assets/add-abc.js'),
        404,
        'application/javascript',
      ),
    ).toBe(false);
  });
});

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
