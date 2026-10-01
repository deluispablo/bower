import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * The start-up screen paints before tokens.css loads, so index.html repeats
 * some tokens as literals (R-BOOT-9). These tests keep them equal, and pin
 * the markup contract that boot-screen.ts (#985) relies on.
 */

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const TOKENS = readFileSync(
  new URL('./styles/tokens.css', import.meta.url),
  'utf8',
);
const VITE_CONFIG = readFileSync(
  new URL('../vite.config.ts', import.meta.url),
  'utf8',
);

const STYLE = /<style>([\s\S]*?)<\/style>/.exec(HTML)?.[1] ?? '';

const LIGHT = ':root {';
const DARK_SYSTEM = ":root:not([data-theme='light']) {";
const DARK_MANUAL = ":root[data-theme='dark'] {";

/** The body of the first rule that opens with `opener` in `css`. */
function block(css: string, opener: string): string {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`No "${opener}" rule found.`);
  const end = css.indexOf('}', start);
  return css.slice(start + opener.length, end);
}

/** The value of custom property `name` declared in `body`. */
function prop(body: string, name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(body);
  if (!match?.[1]) throw new Error(`No ${name} declared.`);
  return match[1].trim();
}

const PAIRS: [boot: string, token: string][] = [
  ['--boot-bg', '--color-bg'],
  ['--boot-text', '--color-text'],
  ['--boot-muted', '--color-text-muted'],
  ['--boot-link', '--color-link'],
  ['--boot-focus', '--color-focus'],
];

const THEMES: [theme: string, opener: string][] = [
  ['light', LIGHT],
  ['dark (system)', DARK_SYSTEM],
  ['dark (manual)', DARK_MANUAL],
];

describe('start-up screen colours match tokens.css (R-BOOT-9)', () => {
  it('has an inline style', () => {
    expect(STYLE).not.toBe('');
  });

  for (const [theme, opener] of THEMES) {
    it.each(PAIRS)(`${theme}: %s equals %s`, (boot, token) => {
      expect(prop(block(STYLE, opener), boot)).toBe(
        prop(block(TOKENS, opener), token),
      );
    });
  }

  it('uses the tokens.css theme selectors, the system one under the media query', () => {
    expect(STYLE).toMatch(
      /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{/,
    );
  });

  it('paints html and #boot with the background (R-BOOT-1)', () => {
    expect(block(STYLE, 'html {')).toContain('background: var(--boot-bg);');
    expect(block(STYLE, '#boot {')).toContain('background: var(--boot-bg);');
  });

  it('declares the color-scheme meta (R-BOOT-1)', () => {
    expect(HTML).toContain('<meta name="color-scheme" content="light dark" />');
  });

  it('the manifest background is the dark --color-bg (R-BOOT-8)', () => {
    expect(VITE_CONFIG).toContain(
      `background_color: '${prop(block(TOKENS, DARK_MANUAL), '--color-bg')}',`,
    );
  });
});

describe('start-up screen markup (R-BOOT-2)', () => {
  it('puts #boot before #app', () => {
    const boot = HTML.indexOf('<div id="boot" aria-busy="true">');
    expect(boot).toBeGreaterThan(-1);
    expect(boot).toBeLessThan(HTML.indexOf('<div id="app"></div>'));
  });

  it('has the hidden 72 px bird', () => {
    expect(HTML).toMatch(
      /<svg class="boot-bird" viewBox="0 0 100 100" width="72" height="72" aria-hidden="true" focusable="false">/,
    );
  });

  it('has the status line, the hint and the retry link with their copy (BOOT-1, BOOT-8)', () => {
    expect(HTML).toContain(
      '<p class="boot-line" role="status" aria-live="polite">Opening Bower…</p>',
    );
    expect(HTML).toContain('<p class="boot-hint"></p>');
    expect(HTML).toContain('<a class="boot-retry" href="">Try again</a>');
  });

  it('has no inline script: the CSP is script-src self', () => {
    const scripts = HTML.match(/<script\b[^>]*>/g) ?? [];
    for (const tag of scripts) expect(tag).toMatch(/\bsrc="/);
  });
});
