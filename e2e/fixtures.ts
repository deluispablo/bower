/**
 * The e2e suite runs on the demo (`pnpm e2e`) and on the real logic over a
 * fake Google Drive (`pnpm e2e:fake`). This `test` adds `source=` to every
 * address a test opens; the app keeps it for the tab after that.
 */
import { test as base, expect } from '@playwright/test';

export const source = process.env.E2E_SOURCE;
export const isFake = source === 'fake';

export function withSource(url: string): string {
  if (!source || /[?&]source=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}source=${source}`;
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = (url, opts) => goto(withSource(url), opts);
    await use(page);
  },
});

export { expect };
