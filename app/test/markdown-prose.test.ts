import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// (types for `node:fs` come from ./node-fs.d.ts)

/**
 * `.markdown p, .markdown li` (the design's `.prose`, #503, C.5, spec §6
 * row Note): 16 px body text at 1.6 line height on the phone (no 17 px,
 * spec 2.2, #950 F-12), no media
 * query narrowing it back down at 375 px. A regex check on the raw file
 * (not a computed-style test), the same approach as `tokens.test.ts`.
 */
describe('markdown.css .prose type (#503)', () => {
  const css = readFileSync('src/styles/markdown.css', 'utf8').replace(
    /\/\*.*?\*\//gs,
    '',
  );

  it('sets 16px/1.6 for p and li, outside any media query', () => {
    // Strip every `@media { ... }` block first, so a rule found afterward
    // is guaranteed to be the unconditional, phone-width default.
    const withoutMediaQueries = css.replace(
      /@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gs,
      '',
    );
    const match = withoutMediaQueries.match(
      /\.markdown p,\s*\.markdown li\s*\{([^}]*)\}/,
    );
    const body = match?.[1];
    expect(body).toBeDefined();
    expect(body).toMatch(/font-size:\s*var\(--text-base\)/);
    expect(body).toMatch(/line-height:\s*1\.6\b/);
  });
});
