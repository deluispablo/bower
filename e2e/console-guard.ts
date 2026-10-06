/**
 * Console guard: a test fails after it runs on any `console.error` or `pageerror`
 * not allowed by that test. Playwright documents `page.on('console')` and
 * `page.on('pageerror')` (Page events) and auto fixtures with `use` for per-test setup
 * and teardown. There is no global allowlist: a failure-path test that expects a
 * `BowerError` log opts in for itself with `allowConsole(/pattern/, 'reason')`.
 */
import type { Page } from '@playwright/test';

export type AllowConsole = (pattern: RegExp, reason: string) => void;

export interface ConsoleGuard {
  allow: AllowConsole;
  /** Messages seen and not allowed, formatted for the failure text. */
  unexpected: () => string[];
}

export function guardConsole(page: Page): ConsoleGuard {
  const seen: string[] = [];
  const allowed: { pattern: RegExp; reason: string }[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') seen.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    seen.push(`pageerror: ${err.message}`);
  });
  return {
    allow: (pattern, reason) => {
      if (!reason.trim()) throw new Error('allowConsole needs a one-line reason');
      allowed.push({ pattern, reason });
    },
    unexpected: () => seen.filter((m) => !allowed.some((a) => a.pattern.test(m))),
  };
}
