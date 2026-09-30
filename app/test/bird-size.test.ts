import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BIRD_SIZE, birdSize } from '../src/components/bird-classes.js';

const TOKENS = readFileSync('src/styles/tokens.css', 'utf8');
const BIRD_CSS = readFileSync('src/styles/bird.css', 'utf8');

describe('bird size scale (R-BIRD-1)', () => {
  it.each(Object.entries(BIRD_SIZE))(
    '--bird-%s is %i px in tokens.css',
    (name, px) => {
      expect(TOKENS).toContain(`--bird-${name}: ${String(px)}px;`);
    },
  );

  it('the hero is 96 px from 900 px', () => {
    expect(TOKENS).toMatch(
      /@media \(min-width: 900px\) \{\s*:root \{\s*--bird-hero: 96px;/,
    );
  });

  it('a named size reads its token; a number stays px', () => {
    expect(birdSize('tab')).toEqual({ px: 72, css: 'var(--bird-tab)' });
    expect(birdSize(64)).toEqual({ px: 64 });
  });
});

describe('the tidying bird faces right (R-BIRD-2)', () => {
  it('p-tidy never turns round; flip still turns the tour bird', () => {
    expect(BIRD_CSS).toMatch(
      /\.b\.p-tidy \.turn \{\s*animation: none;\s*transform: none;\s*\}/,
    );
    expect(BIRD_CSS).not.toContain('ferryturn');
    expect(BIRD_CSS).toMatch(/\.flip \.turn \{\s*transform: scaleX\(-1\);/);
  });
});
