/**
 * Web push: the browser side of #39. Pure helpers — `urlBase64ToUint8Array`,
 * `pushSupport`, `shouldPrompt` — are unit-tested in `push.test.ts`. The rest
 * talks to `Notification`, `ServiceWorkerRegistration.pushManager` and the
 * Worker (`getPushPublicKey`/`subscribePush`/`unsubscribePush` in `api.ts`);
 * per CLAUDE.md (pure functions unit-tested, handlers not) it stays
 * untested here. `push-prompt.tsx` and `settings.tsx` are its only callers.
 */

import { getPushPublicKey, subscribePush, unsubscribePush } from './api.js';
import { getPref, setPref } from './prefs.js';
import type { RunPhase } from './run-store.js';

/**
 * The VAPID public key (`GET /push/public-key`, base64url) as the
 * `Uint8Array` `pushManager.subscribe` expects for `applicationServerKey`.
 */
export function urlBase64ToUint8Array(
  base64url: string,
): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

export type PushSupport = 'unsupported' | 'needs-install' | 'ready';

export interface PushEnvironment {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  isStandalone: boolean;
}

/**
 * `'unsupported'`: no Push API here at all. `'needs-install'`: iOS Safari,
 * which can only push once the PWA has been added to the Home Screen.
 * `'ready'`: everything else that has the three APIs.
 */
export function pushSupport(env: PushEnvironment): PushSupport {
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    return 'unsupported';
  }
  if (env.isIOS && !env.isStandalone) return 'needs-install';
  return 'ready';
}

function isStandaloneDisplay(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean })
    .standalone;
  if (iosStandalone === true) return true;
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function currentEnvironment(): PushEnvironment {
  return {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    isIOS: /iphone|ipad|ipod/i.test(navigator.userAgent),
    isStandalone: isStandaloneDisplay(),
  };
}

/** `pushSupport` read from the real browser. */
export function currentPushSupport(): PushSupport {
  return pushSupport(currentEnvironment());
}

/** `Notification.permission`, or `'denied'` where `Notification` doesn't exist. */
export function currentPermission(): NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'denied';
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}

/**
 * Asks for permission and, if granted, subscribes this browser with the
 * Worker's VAPID key and registers the subscription (`POST
 * /push/subscribe`). Does nothing if permission is refused. Throws on any
 * failure; the caller (`push-prompt.tsx`, `settings.tsx`) shows one
 * sentence and logs the rest.
 */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;
  const registration = await readyRegistration();
  const { publicKey } = await getPushPublicKey();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await subscribePush(subscription.toJSON());
}

/**
 * Removes the subscription server-side (`DELETE /push/subscribe`), then
 * unsubscribes locally. A no-op if there was no subscription.
 */
export async function disablePush(): Promise<void> {
  const registration = await readyRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (subscription === null) return;
  if (subscription.endpoint !== '') {
    await unsubscribePush(subscription.endpoint);
  }
  await subscription.unsubscribe();
}

export type PushState = 'on' | 'off';

/** Whether this browser currently holds a push subscription. */
export async function currentPushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'off';
  }
  const registration = await readyRegistration();
  const subscription = await registration.pushManager.getSubscription();
  return subscription === null ? 'off' : 'on';
}

export interface ShouldPromptInput {
  phase: RunPhase;
  alreadyAsked: boolean;
  permission: NotificationPermission;
  support: PushSupport;
}

/**
 * True only right after a run finishes (`done`), the first time: never
 * asked before, permission still `'default'`, and push is `'ready'` here.
 */
export function shouldPrompt(input: ShouldPromptInput): boolean {
  return (
    input.phase === 'done' &&
    !input.alreadyAsked &&
    input.permission === 'default' &&
    input.support === 'ready'
  );
}

/** Persisted so the prompt card (`push-prompt.tsx`) shows at most once ever. */
export function hasBeenPrompted(): boolean {
  return getPref('pushPromptShown');
}

export function markPrompted(): void {
  setPref('pushPromptShown', true);
}
