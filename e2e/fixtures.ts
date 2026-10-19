/**
 * The e2e suite runs on the demo (`pnpm e2e`) and on the real logic over a
 * fake Google Drive (`pnpm e2e:fake`). This `test` adds `source=` to every
 * address a test opens; the app keeps it for the tab after that.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { guardConsole, type AllowConsole } from './console-guard';

/** Opens the tidy-up sheet from the one launch on screen: the checklist's, the Inbox's or the top bar's. Call it before a sheet is open. */
export async function openTidy(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Tidy up( \d+( things?)?)?$/, disabled: false }).first().click();
}

export const source = process.env.E2E_SOURCE;
export const isFake = source === 'fake';

export function withSource(url: string): string {
  if (!source || /[?&]source=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}source=${source}`;
}

export const test = base.extend<{ allowConsole: AllowConsole; consoleGuard: undefined }>({
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page);
    page.goto = (url, opts) => goto(withSource(url), opts);
    await provide(page);
  },
  // Per test: allowConsole(/pattern/, 'reason') lets one expected message through.
  allowConsole: async ({ page }, provide) => {
    const guard = guardConsole(page);
    await provide(guard.allow);
    const bad = guard.unexpected();
    if (bad.length) throw new Error(`Unexpected console errors:\n${bad.join('\n')}`);
  },
  consoleGuard: [async ({ allowConsole }, provide) => { void allowConsole; await provide(undefined); }, { auto: true }],
});

export { expect };
