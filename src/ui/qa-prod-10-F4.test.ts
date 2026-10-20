/**
 * qa-prod-10-F4: the dock (the run chip and the messages) sits below the sheets' scrim, so a sheet covers page chrome,
 * and above the phone tab bar (specs/qa-prod-10/plan.md, F4). Prior art: WAI-ARIA APG modal dialog (outside content is
 * inert and below it); Bootstrap's z-index scale (fixed chrome below the modal backdrop, the backdrop below the modal).
 * jsdom does not stack, so this reads the stylesheets, as `ui/design8-disabled.test.ts` does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const ui = strip(readFileSync(join(__dirname, 'ui.module.css'), 'utf8'));
const shell = strip(readFileSync(join(__dirname, '../app/shell.module.css'), 'utf8'));

/** The z-index of the one rule whose whole selector is `selector` and that sets one. */
function zIndex(css: string, selector: string): number {
  const found = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1]?.trim() === selector)
    .map((m) => /(?:^|;)\s*z-index:\s*(\d+)/.exec(m[2] ?? '')?.[1])
    .filter((z): z is string => z !== undefined);
  expect(found, `one z-index for ${selector}`).toHaveLength(1);
  return Number(found[0]);
}

describe('qa-prod-10-F4', () => {
  it('AC1 qa10-dock-below-sheets: the dock is above the tab bar and below the scrim, the scrim below the sheet', () => {
    const dock = zIndex(ui, '.dock');
    const scrim = zIndex(ui, '.scrim');
    const sheet = zIndex(ui, '.sheet');
    const tabbar = zIndex(shell, '.tabbar');
    expect(dock, 'AC1: a sheet\'s scrim covers the dock').toBeLessThan(scrim);
    expect(scrim).toBeLessThan(sheet);
    expect(dock, 'AC1: the dock stays above the tab bar').toBeGreaterThan(tabbar);
  });
});
