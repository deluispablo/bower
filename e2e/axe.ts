import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import type { AxeResults } from 'axe-core';

/** The one shared axe helper (c4-test-timers): every spec scans through it. */
export interface AxeScope {
  /** CSS selectors to scan (default: the whole page). */
  include?: string | string[];
  /** The WCAG 2.2 AA tag set with the target-size rule on, as the touch-target specs use it. */
  wcag22?: boolean;
  disableRules?: string[];
}

export async function axeScan(page: Page, scope: AxeScope = {}): Promise<AxeResults> {
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
