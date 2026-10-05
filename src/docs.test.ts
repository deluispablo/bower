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

  it('the code says why the outbox stays at sign-out', () => {
    expect(read('src/data/device.ts')).toMatch(/The journal outbox \(`bower:outbox:<folder>`\) stays at sign-out/);
    expect(read('AGENTS.md')).toMatch(/outbox stays at sign-out/);
  });

  it('the contract says journal records are unique by id', () => {
    expect(read('docs/specs/2026-10-04-worker-contract.md')).toMatch(/Journal records are unique by `id`: a runner keeps one per id and archives every copy/);
  });

  it('the landing has no jargon where it says what a tidy-up does', () => {
    const html = read('public/landing/index.html');
    expect(html).not.toMatch(/using PARA unless your rules say otherwise/);
    expect(html).toMatch(/in folders by how soon you need things/);
  });

  it('a new agent is sent to the handoff, and the handoff has the plan and the traps', () => {
    expect(read('AGENTS.md')).toMatch(/docs\/harness\/HANDOFF\.md/);
    expect(read('AGENTS.md')).toMatch(/docs\/PHASES\.md/);
    const phases = read('docs/PHASES.md');
    for (const n of [1, 2, 3, 4]) expect(phases, `phase ${n}`).toMatch(new RegExp(`## Phase ${n}:`));
    const handoff = read('docs/harness/HANDOFF.md');
    for (const part of ['## Where things stand', '## The plan, in order', '## How to run a round', '## Traps on this machine', '## Decisions taken in phase 2']) expect(handoff, part).toContain(part);
  });
});

