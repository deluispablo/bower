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

  it('no stale comment says the pretend Drive starts over on reload', () => {
    expect(read('e2e/qa5.spec.ts')).not.toMatch(/starts the pretend Drive again, so the folder is missing again/);
  });

  it("the fixture says how its timeline dates work", () => {
    expect(read('src/data/demo/fixture.ts')).toMatch(/Timeline dates are fixed text/);
  });

  it('the docs say which writes check what (a content write passes its modifiedTime; a move or rename checks name and place)', () => {
    for (const doc of ['AGENTS.md', 'docs/superpowers/plans/2026-10-04-phase-2-app-logic.md']) {
      const text = read(doc);
      expect(text, doc).not.toMatch(/every write passes the modifiedTime/);
      expect(text, doc).toMatch(/content write passes the modifiedTime it read/);
      expect(text, doc).toMatch(/move or rename checks the name and place it read/);
    }
    expect(read('docs/superpowers/plans/2026-10-04-phase-2-ledger.md')).toMatch(/Ruling: a move or rename is not a content conflict/);
  });
});
