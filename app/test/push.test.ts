import { describe, expect, it } from 'vitest';

import {
  pushSupport,
  shouldPrompt,
  urlBase64ToUint8Array,
} from '../src/push.js';
import type { PushEnvironment } from '../src/push.js';

describe('urlBase64ToUint8Array', () => {
  it('decodes a known base64url vector', () => {
    // base64url "AAECAw" === base64 "AAECAw==" === bytes [0, 1, 2, 3].
    expect(urlBase64ToUint8Array('AAECAw')).toEqual(
      new Uint8Array([0, 1, 2, 3]),
    );
  });

  it('replaces "-" with "+" and "_" with "/" before decoding', () => {
    // Byte 0xFB base64-encodes to "+w==" in standard base64 ("-w" base64url,
    // no padding); byte triple 0xFF 0xFF 0xFF encodes to "////" ("____").
    expect(urlBase64ToUint8Array('-w')).toEqual(new Uint8Array([0xfb]));
    expect(urlBase64ToUint8Array('____')).toEqual(
      new Uint8Array([0xff, 0xff, 0xff]),
    );
  });
});

function env(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    isIOS: false,
    isStandalone: false,
    ...overrides,
  };
}

describe('pushSupport', () => {
  it('is "ready" when every API is present and it is not iOS', () => {
    expect(pushSupport(env())).toBe('ready');
  });

  it('is "ready" on iOS once the PWA is installed (standalone)', () => {
    expect(pushSupport(env({ isIOS: true, isStandalone: true }))).toBe('ready');
  });

  it('is "needs-install" on iOS before the PWA is installed', () => {
    expect(pushSupport(env({ isIOS: true, isStandalone: false }))).toBe(
      'needs-install',
    );
  });

  it('is "unsupported" without a service worker', () => {
    expect(pushSupport(env({ hasServiceWorker: false }))).toBe('unsupported');
  });

  it('is "unsupported" without a PushManager', () => {
    expect(pushSupport(env({ hasPushManager: false }))).toBe('unsupported');
  });

  it('is "unsupported" without Notification', () => {
    expect(pushSupport(env({ hasNotification: false }))).toBe('unsupported');
  });
});

describe('shouldPrompt', () => {
  it('is true right after a done run, never asked, default permission, ready', () => {
    expect(
      shouldPrompt({
        phase: 'done',
        alreadyAsked: false,
        permission: 'default',
        support: 'ready',
      }),
    ).toBe(true);
  });

  it('is false when the phase is not done', () => {
    expect(
      shouldPrompt({
        phase: 'running',
        alreadyAsked: false,
        permission: 'default',
        support: 'ready',
      }),
    ).toBe(false);
  });

  it('is false once already asked', () => {
    expect(
      shouldPrompt({
        phase: 'done',
        alreadyAsked: true,
        permission: 'default',
        support: 'ready',
      }),
    ).toBe(false);
  });

  it('is false when permission is already granted', () => {
    expect(
      shouldPrompt({
        phase: 'done',
        alreadyAsked: false,
        permission: 'granted',
        support: 'ready',
      }),
    ).toBe(false);
  });

  it('is false when permission was denied', () => {
    expect(
      shouldPrompt({
        phase: 'done',
        alreadyAsked: false,
        permission: 'denied',
        support: 'ready',
      }),
    ).toBe(false);
  });

  it('is false when push needs the PWA installed first (iOS)', () => {
    expect(
      shouldPrompt({
        phase: 'done',
        alreadyAsked: false,
        permission: 'default',
        support: 'needs-install',
      }),
    ).toBe(false);
  });

  it('is false when push is unsupported', () => {
    expect(
      shouldPrompt({
        phase: 'done',
        alreadyAsked: false,
        permission: 'default',
        support: 'unsupported',
      }),
    ).toBe(false);
  });
});
