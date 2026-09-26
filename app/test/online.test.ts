import { describe, expect, it } from 'vitest';

import { offlineReason } from '../src/online.js';
import type { OfflineAction } from '../src/online.js';
import { isApiStatusRequest, isGoogleApi } from '../src/sw-routes.js';

describe('offlineReason', () => {
  it('has a sentence for every action, each mentioning being offline', () => {
    const actions: OfflineAction[] = ['add', 'tell', 'process'];
    for (const action of actions) {
      expect(offlineReason(action)).toMatch(/^You are offline\./);
    }
  });

  it('does not promise a queue for Add, which has none', () => {
    expect(offlineReason('add')).toBe(
      'You are offline. Adding files needs a connection.',
    );
  });

  it('has the exact sentence for Tell', () => {
    expect(offlineReason('tell')).toBe(
      'You are offline. Sending needs a connection.',
    );
  });

  it('has the exact sentence for Process', () => {
    expect(offlineReason('process')).toBe(
      'You are offline. Bower can run when you are back online.',
    );
  });
});

describe('isGoogleApi', () => {
  it('is true for Drive requests', () => {
    expect(
      isGoogleApi(new URL('https://www.googleapis.com/drive/v3/files')),
    ).toBe(true);
  });

  it('is false for any other origin', () => {
    expect(isGoogleApi(new URL('https://api.example.com/me'))).toBe(false);
    expect(isGoogleApi(new URL('http://localhost:8787/status'))).toBe(false);
  });
});

describe('isApiStatusRequest', () => {
  it('matches /me and /status regardless of origin, since it is not known at build time', () => {
    expect(isApiStatusRequest(new URL('https://api.example.com/me'))).toBe(
      true,
    );
    expect(isApiStatusRequest(new URL('https://api.example.com/status'))).toBe(
      true,
    );
    expect(isApiStatusRequest(new URL('http://localhost:8787/status'))).toBe(
      true,
    );
  });

  it('never matches Drive, even on a /me or /status path', () => {
    expect(isApiStatusRequest(new URL('https://www.googleapis.com/me'))).toBe(
      false,
    );
    expect(
      isApiStatusRequest(new URL('https://www.googleapis.com/status')),
    ).toBe(false);
  });

  it('ignores unrelated paths', () => {
    expect(isApiStatusRequest(new URL('https://api.example.com/process'))).toBe(
      false,
    );
    expect(isApiStatusRequest(new URL('https://api.example.com/'))).toBe(false);
  });
});
