/**
 * design8-layout (designer, post-qa-7, P2-4): at 1280 with both side panels Home's two columns are about 570 px
 * together, so titles, dates and search cramp. Home splits into two columns only when its own width allows it (a CSS
 * container query on the page, at 760 px or more), not when the window is 1100 px wide (MDN, CSS container queries).
 * jsdom does not lay out container queries, so this reads the stylesheet itself, as `ui/pill.test.ts` does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'home.module.css'), 'utf8');
/** The body of each at-rule block whose prelude matches, braces balanced. */
function blocks(at: RegExp): Array<{ prelude: string; body: string }> {
  const out: Array<{ prelude: string; body: string }> = [];
  for (const m of css.matchAll(new RegExp(`${at.source}[^{]*\\{`, 'g'))) {
    let depth = 1;
    let i = (m.index ?? 0) + m[0].length;
    const start = i;
    for (; i < css.length && depth; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
    out.push({ prelude: m[0], body: css.slice(start, i - 1) });
  }
  return out;
}
const twoColumns = (body: string): boolean => /\.grid\s*\{[^}]*grid-template-columns/.test(body);

describe('AC1 Home has two columns only when it is wide enough', () => {
  it('AC1 design8-layout-columns-control: the grid and its two-column rule are there (positive control)', () => {
    expect(css).toMatch(/\.grid\s*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.grid\s*\{[^}]*grid-template-columns/);
  });

  it('AC1 design8-layout-columns-container: the page is a size container and the two columns wait for 760 px of it', () => {
    expect(css).toMatch(/\.page\s*\{[^}]*container(-type)?:\s*[^;}]*inline-size/);
    const wide = blocks(/@container/).filter((b) => twoColumns(b.body));
    expect(wide).toHaveLength(1);
    const min = Number(/min-width:\s*(\d+)px/.exec(wide[0]?.prelude ?? '')?.[1] ?? 0);
    expect(min).toBeGreaterThanOrEqual(760);
  });

  it('AC1 design8-layout-columns-no-media: no window-width rule splits Home into two columns', () => {
    expect(blocks(/@media/).filter((b) => twoColumns(b.body))).toEqual([]);
  });
});
