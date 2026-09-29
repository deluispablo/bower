import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// (types for `node:fs` come from ./node-fs.d.ts)

// Parses tokens.css with a regex (no CSS engine): §3.1 and §3.3 of the
// redesign spec (the 2026-09-27 app redesign spec)
// require these custom properties to exist, with light values in `:root`
// and dark overrides in the dark block. A plain regex is enough here; this
// is not a computed-style test. Read from disk (not `?raw`, which Vite
// stubs to an empty string for `.css` files under vitest's SSR transform)
// relative to the app package root, which is vitest's working directory.

const REQUIRED_TOKENS = [
  // §3.1: colour
  '--color-sidebar',
  '--color-surface-hover',
  '--color-brand-tint',
  '--color-heading',
  // §3.3: motion
  '--motion-fast',
  '--motion-base',
  '--motion-bird',
  '--ease-out',
  '--ease-in-out',
];

function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'));
  const body = match?.[1];
  if (body === undefined) {
    throw new Error(`selector not found in tokens.css: ${selector}`);
  }
  return body;
}

function definedTokens(cssBlock: string): Set<string> {
  const names = new Set<string>();
  for (const match of cssBlock.matchAll(/(--[\w-]+)\s*:/g)) {
    const name = match[1];
    if (name !== undefined) {
      names.add(name);
    }
  }
  return names;
}

describe('tokens.css', () => {
  const raw = readFileSync('src/styles/tokens.css', 'utf8');
  const css = raw.replace(/\/\*.*?\*\//gs, '');
  const light = definedTokens(block(css, ':root'));
  const dark = definedTokens(block(css, ":root[data-theme='dark']"));

  it.each(REQUIRED_TOKENS)('defines %s in :root (light)', (token) => {
    expect(light.has(token)).toBe(true);
  });

  it.each(REQUIRED_TOKENS)('defines %s in the dark block', (token) => {
    expect(dark.has(token)).toBe(true);
  });
});

// Contrast, the method of scripts/brand/contrast.py (WCAG 2.x relative
// luminance). Ratios are the floors of spec §5 (v4 explorer spec).

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

function valueOf(cssBlock: string, token: string): string {
  const m = cssBlock.match(new RegExp(`${token}:\\s*([^;]+);`));
  const v = m?.[1];
  if (v === undefined) {
    throw new Error(`token not found: ${token}`);
  }
  return v.trim();
}

const PAGE = { light: '#faf9f6', dark: '#111a2b' };
// [name, mark vs page floor (light, dark), ink vs mark floor (light, dark)]
const PARA: [string, number, number, number, number][] = [
  ['inbox', 4.54, 7.6, 5.21, 9.3],
  ['projects', 4.5, 8.16, 5.17, 9.93],
  ['areas', 4.35, 8.43, 5.0, 10.26],
  ['resources', 5.08, 8.53, 5.84, 10.38],
  ['archives', 5.19, 8.33, 5.96, 10.14],
];

describe('PARA tokens (spec §5)', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8').replace(
    /\/\*.*?\*\//gs,
    '',
  );
  const themes = {
    light: block(css, ':root'),
    dark: block(css, ":root[data-theme='dark']"),
  };

  it.each(PARA)('%s: mark and ink meet the floors', (name, ml, md, il, id) => {
    const floors = { light: [ml, il], dark: [md, id] } as const;
    for (const theme of ['light', 'dark'] as const) {
      const mark = valueOf(themes[theme], `--color-para-${name}`);
      const ink = valueOf(themes[theme], `--color-para-${name}-on`);
      const [markFloor, inkFloor] = floors[theme];
      expect(ratio(mark, PAGE[theme])).toBeGreaterThanOrEqual(markFloor - 0.05);
      expect(ratio(ink, mark)).toBeGreaterThanOrEqual(inkFloor - 0.05);
    }
  });

  it('--color-new has 4.5:1 ink in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const bg = valueOf(themes[theme], '--color-new');
      const ink = valueOf(themes[theme], '--color-new-on');
      expect(ratio(ink, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['file', 'notes', 'web', 'you'])(
    'origin %s icon reaches 3:1 on the page in both themes',
    (name) => {
      for (const theme of ['light', 'dark'] as const) {
        const icon = valueOf(themes[theme], `--color-origin-${name}`);
        expect(ratio(icon, PAGE[theme])).toBeGreaterThanOrEqual(3);
        expect(themes[theme]).toContain(`--color-origin-${name}-bg:`);
      }
    },
  );
});
