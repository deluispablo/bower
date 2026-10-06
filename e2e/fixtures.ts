/**
 * The e2e suite runs on the demo (`pnpm e2e`) and on the real logic over a
 * fake Google Drive (`pnpm e2e:fake`). This `test` adds `source=` to every
 * address a test opens; the app keeps it for the tab after that.
 */
import { test as base, expect } from '@playwright/test';
import { guardConsole, type AllowConsole } from './console-guard';

export const source = process.env.E2E_SOURCE;
export const isFake = source === 'fake';

export function withSource(url: string): string {
  if (!source || /[?&]source=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}source=${source}`;
}

export const test = base.extend<{ allowConsole: AllowConsole; consoleGuard: void }>({
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
  consoleGuard: [async ({ allowConsole }, provide) => { void allowConsole; await provide(); }, { auto: true }],
});

export { expect };
