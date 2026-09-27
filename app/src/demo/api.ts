/**
 * The demo's Worker client (#192): the `WorkerClient` surface of `api.ts`
 * answered from memory by `server.ts`. Signed in as Alex, one Bower folder,
 * the first-run tour not seen yet. Settings changes are kept until the page
 * reloads; push is a no-op; deleting the account is refused with code
 * `demo`, since there is no account behind the demo.
 */

import { ApiError } from '../api.js';
import type { Me, WorkerClient } from '../api.js';
import type { DemoServer } from './server.js';

/** A year ahead: the demo's Drive token never needs renewing. */
const TOKEN_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

export function notInDemo(message: string): ApiError {
  return new ApiError(403, 'demo', message);
}

/**
 * `answer()` as a promise, the way a request would settle: a throw becomes
 * a rejection. Shared with the demo Drive client (`drive.ts`).
 */
export function reply<T>(answer: () => T | Promise<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    resolve(answer());
  });
}

export function createDemoWorker(
  server: DemoServer,
  now: () => number = () => Date.now(),
): WorkerClient {
  const vault = (): Promise<NonNullable<Me['vault']>> =>
    reply(() => {
      const current = server.me.vault;
      if (current === null) {
        throw new ApiError(409, 'no_vault', 'No folder yet.');
      }
      return { ...current };
    });

  return {
    getHealth: () => reply(() => ({ ok: true, version: 'demo' })),
    getMe: () => reply(() => ({ ...server.me, quota: { ...server.me.quota } })),
    createVault: vault,
    selectVault: vault,
    logout: () => reply(() => undefined),
    logoutAll: () => reply(() => undefined),
    updateSettings: (input) =>
      reply(() => {
        if (input.apiKey !== undefined) {
          server.me.hasApiKey = input.apiKey !== null;
        }
        if (input.tourSeenAt !== undefined) {
          server.me.tourSeenAt = input.tourSeenAt;
        }
        return { hasApiKey: server.me.hasApiKey };
      }),
    deleteAccount: () =>
      reply(() => {
        throw notInDemo('There is no account to delete in the demo.');
      }),
    startProcess: async () => ({ run: await server.startProcess() }),
    getStatus: () => reply(() => server.status()),
    getPushPublicKey: () =>
      reply(() => {
        throw notInDemo('Notifications are not available in the demo.');
      }),
    subscribePush: (subscription) => {
      if (
        subscription.endpoint === undefined ||
        subscription.keys?.p256dh === undefined ||
        subscription.keys.auth === undefined
      ) {
        throw new Error('Incomplete push subscription.');
      }
      return reply(() => undefined);
    },
    unsubscribePush: () => reply(() => undefined),
    getDriveToken: () =>
      reply(() => ({
        accessToken: 'demo',
        expiresAt: new Date(now() + TOKEN_LIFETIME_MS).toISOString(),
        folderId: server.me.vault?.folderId ?? null,
      })),
  };
}
