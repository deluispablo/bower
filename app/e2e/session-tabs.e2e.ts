/**
 * Signing out in one tab ends the session in every other tab of the same
 * browser at once, with no reload (#994). Two pages of one browser context
 * share the origin's `BroadcastChannel` and `localStorage`, as two tabs do.
 *
 * The demo build keeps Sign out disabled ("Not in the demo"), so tab B sends
 * the very message a sign-out sends (`announceSignOut` in
 * `src/session-guard.ts`: the channel message, then the storage fallback);
 * the unit tests cover that Sign out sends it.
 */

import { expect, openHome, test } from './demo.js';

const SESSION_CHANNEL = 'bower:session';
const SIGNED_OUT_KEY = 'bower:signed-out';

test('signing out in one tab sends the other tab to sign-in within a second', async ({
  page,
}) => {
  await openHome(page);
  await expect(page).not.toHaveURL(/\/login$/);

  const other = await page.context().newPage();
  await other.goto('/privacy');
  await other.evaluate(
    ({ channelName, key }) => {
      const channel = new BroadcastChannel(channelName);
      channel.postMessage({ type: 'signed-out' });
      channel.close();
      localStorage.setItem(key, String(Date.now()));
      localStorage.removeItem(key);
    },
    { channelName: SESSION_CHANNEL, key: SIGNED_OUT_KEY },
  );

  await expect(page).toHaveURL(/\/login$/, { timeout: 1_000 });
  await other.close();
});

test('the storage fallback alone signs the other tab out too', async ({
  page,
}) => {
  await openHome(page);

  const other = await page.context().newPage();
  await other.goto('/privacy');
  await other.evaluate((key) => {
    localStorage.setItem(key, String(Date.now()));
    localStorage.removeItem(key);
  }, SIGNED_OUT_KEY);

  await expect(page).toHaveURL(/\/login$/, { timeout: 1_000 });
  await other.close();
});
