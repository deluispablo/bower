/// <reference types="node" />
/** Things the repository promises its agents and its pages, checked. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('what the repository promises', () => {
  it('AGENTS.md keeps the copy and brand rules', () => {
    const map = read('AGENTS.md');
    expect(map).toMatch(/never "the bird" in copy/);
    expect(map).toMatch(/--brand-line/);
    expect(map).toMatch(/do not edit it by hand/);
  });

  it('the landing has no placeholder the browser would parse', () => {
    const html = read('public/landing/index.html');
    expect(html.match(/\s(d|fill|stroke|opacity|marker-end|points|transform|viewBox)="[^"]*\{\{/g) ?? []).toEqual([]);
    expect(read('scripts/fix-landing.mjs')).toMatch(/sc-camel-/);
  });
});
