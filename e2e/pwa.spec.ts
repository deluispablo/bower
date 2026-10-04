import { expect, test } from '@playwright/test';

test('the built app has a manifest and registers a service worker', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as { name: string; display: string; icons: Array<{ sizes: string }> };
  expect(manifest.name).toBe('Bower');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  await page.goto('/?scenario=default&time=instant');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe('activated');
});

test('the service worker keeps the app shell only, never Google Drive or the Worker', async ({ request }) => {
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).not.toMatch(/googleapis/);
  expect(sw).not.toMatch(/runtimeCaching|NetworkFirst|StaleWhileRevalidate/);
});

test('with no network the app still opens', async ({ page, context }) => {
  await page.goto('/?scenario=default&time=instant');
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 8000 });
  await context.setOffline(false);
});
