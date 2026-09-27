import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// (types for `node:fs` come from ./node-fs.d.ts)

// Parses tokens.css with a regex (no CSS engine): §3.1 and §3.3 of the
// redesign spec (docs/superpowers/specs/2026-09-27-app-redesign-design.md)
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
