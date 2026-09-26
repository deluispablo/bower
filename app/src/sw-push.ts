/// <reference lib="webworker" />
/**
 * Push notification handlers (#39): `push` shows the notification, and
 * `notificationclick` focuses a matching open tab or opens one. Kept out of
 * `sw.ts` so #41's Workbox runtime caching rebases cleanly against that
 * file; imported from there with one line.
 */

export {};

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

const DEFAULT_TITLE = 'Bower';
const DEFAULT_URL = '/';
const ICON_PATH = '/icons/icon-192.png';

/**
 * Parses the `push` event's JSON payload defensively: a missing or
 * malformed field (or no payload at all) falls back to a safe default
 * rather than dropping the notification.
 */
function parsePayload(event: PushEvent): PushPayload {
  try {
    const data = event.data?.json() as Partial<PushPayload> | undefined;
    return {
      title: typeof data?.title === 'string' ? data.title : DEFAULT_TITLE,
      body: typeof data?.body === 'string' ? data.body : '',
      url: typeof data?.url === 'string' ? data.url : DEFAULT_URL,
    };
  } catch {
    return { title: DEFAULT_TITLE, body: '', url: DEFAULT_URL };
  }
}

self.addEventListener('push', (event: PushEvent) => {
  const { title, body, url } = parsePayload(event);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: ICON_PATH,
      badge: ICON_PATH,
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | undefined;
  const url = data?.url ?? DEFAULT_URL;

  event.waitUntil(
    (async () => {
      const targetPath = new URL(url, self.location.origin).pathname;
      const openClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const match = openClients.find((client) => {
        try {
          return new URL(client.url).pathname === targetPath;
        } catch {
          return false;
        }
      });
      if (match !== undefined) {
        await match.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
