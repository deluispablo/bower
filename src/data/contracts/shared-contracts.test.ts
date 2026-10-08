/**
 * The contracts the app, the Worker and the fake share (TL-P4-14, c1-shared-contracts): one lease machine, one
 * list of run phases, one folder template. Each test fails while a second copy exists.
 */
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FakeLease } from '../fake/fake-lease';
import { LEASE_CASES } from './lease-cases';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('the Worker and the fake decide leases alike', () => {
  for (const c of LEASE_CASES) {
    it(`the fake: ${c.name}`, async () => {
      const store = new Map<string, string>();
      let now = 1_000_000_000_000;
      const lease = new FakeLease({ key: 'k', storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) }, now: () => now });
      const start = now;
      for (const s of c.steps) {
        now = start + s.at;
        expect(await lease.session(s.place, s.action, s.gen), `${s.action} by ${s.place} at ${s.at}`).toEqual({ active: s.active, epoch: s.epoch });
        if (s.holds) expect(lease.holds(s.holds.place, s.holds.epoch)).toBe(s.holds.yes);
      }
    });
  }
});

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules' || n === 'dist' || n === '.wrangler' || n === 'fixtures') return [];
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
const all = ['src', 'api/src', 'runner/src'].flatMap((d) => sources(join(ROOT, d)));
const where = (re: RegExp): string[] => all.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f));

describe('the run phases and the folder template are one each', () => {
  it('the run phase list is written once, in the contracts', () => {
    expect(where(/'queued',\s*'reading',\s*'writing',\s*'saving'/)).toEqual(['src/data/contracts/run-phases.ts']);
    expect(where(/queued:\s*0,\s*reading:\s*1/)).toEqual(['src/data/contracts/run-phases.ts']);
  });

  it('the folder template is written once, in the contracts', () => {
    expect(where(/\{ "v": 1, "hashes": \{\} \}/)).toEqual(['src/data/contracts/folder-template.ts']);
    expect(where(/Write a few lines about yourself/)).toEqual(['src/data/contracts/folder-template.ts']);
    expect(statSyncOrNull(join(ROOT, 'api/template'))).toBeNull();
  });
});

function statSyncOrNull(p: string): unknown {
  try {
    return statSync(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
