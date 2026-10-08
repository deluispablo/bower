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
import { FOLDER_TEMPLATE, PLACEHOLDER_FILE } from './folder-template';
import { LEASE_CASES } from './lease-cases';
import { parseNote, serializeNote } from './note-format';
import { PHASE_RANK, RUN_PHASES, RUN_STEPS, isRunPhase } from './run-phases';
import { isRunWire } from './run-wire';
import { PARA_ROOTS } from './types';

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

describe('what the shared lists say', () => {
  it('the phases are ranked in order, the steps are the ones before done, and a run wire takes only them', () => {
    expect(RUN_STEPS).toEqual(RUN_PHASES.slice(0, 4));
    expect(RUN_PHASES.map((p) => PHASE_RANK[p])).toEqual([0, 1, 2, 3, 4, 4]);
    expect(RUN_PHASES.every(isRunPhase)).toBe(true);
    const wire = { id: 'r1', scope: 'all', requestedAt: 1, phaseAt: 1 };
    expect(RUN_PHASES.every((phase) => isRunWire({ ...wire, phase }))).toBe(true);
    expect(isRunWire({ ...wire, phase: 'paused' })).toBe(false);
  });

  it('the folder template has the five main folders, Bower\'s own folder and a Rules.md only Bower words', () => {
    const folders = new Set(FOLDER_TEMPLATE.flatMap((f) => (f.path.endsWith(`/${PLACEHOLDER_FILE}`) ? [f.path.slice(0, -PLACEHOLDER_FILE.length - 1)] : [])));
    for (const root of PARA_ROOTS) expect(folders.has(root) || FOLDER_TEMPLATE.some((f) => f.path.startsWith(`${root}/`))).toBe(true);
    expect(FOLDER_TEMPLATE.map((f) => f.path)).toEqual([...FOLDER_TEMPLATE.map((f) => f.path)].sort());
    expect(FOLDER_TEMPLATE.find((f) => f.path === 'Rules.md')?.appProperties).toMatchObject({ by: 'bower' });
  });

  it('About me.md is the note the accepted app made: the same bytes serializeNote writes', () => {
    const about = FOLDER_TEMPLATE.find((f) => f.path === 'About me.md')?.content ?? '';
    expect(about).toBe(serializeNote({ summary: 'What Bower knows about you. Change it whenever you like.', properties: [], tags: [], currentState: [], body: 'Write a few lines about yourself: where you live, what you do, who is in your life.', timeline: [], byBower: false }));
    expect(parseNote('About me.md', about).summary).toBe('What Bower knows about you. Change it whenever you like.');
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
