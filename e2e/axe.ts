import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

/** The one shared axe helper (c4-test-timers): every spec scans through it. */
export interface AxeScope {
  /** CSS selectors to scan (default: the whole page). */
  include?: string | string[];
  /** The WCAG 2.2 AA tag set with the target-size rule on, as the touch-target specs use it. */
  wcag22?: boolean;
  disableRules?: string[];
}

/**
 * Waits until every animation and transition on the page that can end has ended, so axe reads settled colours and sizes:
 * `document.getAnimations()` lists them and each one's `finished` promise resolves at its end
 * (https://developer.mozilla.org/docs/Web/API/Animation/finished). An animation that repeats forever never finishes
 * and is left running; one that starts while we wait is waited for too (a few rounds at most).
 */
export async function animationsEnd(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let round = 0; round < 10; round += 1) {
      const ending = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.playState !== 'finished' && a.playState !== 'idle');
      if (!ending.length) return;
      // A cancelled animation rejects `finished`; it has ended all the same.
      await Promise.all(ending.map((a) => a.finished.catch(() => undefined)));
    }
  });
}

export async function axeScan(page: Page, scope: AxeScope = {}): Promise<AxeResults> {
  await animationsEnd(page);
  let builder = new AxeBuilder({ page });
  for (const selector of [scope.include ?? []].flat()) builder = builder.include(selector);
  if (scope.wcag22) builder = builder.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).options({ rules: { 'target-size': { enabled: true } } });
  if (scope.disableRules) builder = builder.disableRules(scope.disableRules);
  return builder.analyze();
}

/** Fails with each violation's rule and the elements it names. */
export async function expectAxeClean(page: Page, scope: AxeScope = {}): Promise<void> {
  const results = await axeScan(page, scope);
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
