/// <reference types="node" />
/** The harness's own rules (scripts/harness-rules.mjs): what makes the feature list dishonest. */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module, checked by these tests
import { doneArgs, hashOf, nextProblems, notStaged, othersFlipped, problems, readProofs, redKind } from '../scripts/harness-rules.mjs';

type Entry = { id: string; task: string | number; steps?: string[]; verify: string; passes: boolean };
const S = ['Open Home.', 'See it.'];
const V = 'pnpm vitest run src/x.test.ts -t "it works"';
const proofOf = (e: Entry): Map<string, string> => readProofs(`${e.id}\t${hashOf(e.verify)}\t2026-10-04\tred\n`) as Map<string, string>;

describe('the harness', () => {
  it('an entry that passes needs a proof from done.sh', () => {
    const e: Entry = { id: 'a', task: 'qa-6', steps: S, verify: V, passes: true };
    expect(problems([e], new Map())).toHaveLength(1);
    expect(problems([e], proofOf(e))).toEqual([]);
  });

  it('a verify changed after closing loses its proof', () => {
    const e: Entry = { id: 'a', task: 'qa-6', steps: S, verify: V, passes: true };
    const proofs = proofOf(e);
    expect(problems([{ ...e, verify: `${V} || true` }], proofs)).toHaveLength(1);
  });

  it('a verify must name its test', () => {
    const bad: Entry[] = [
      { id: 'u', task: 'qa-6', steps: S, verify: 'pnpm vitest run src/data', passes: false },
      { id: 'e', task: 'qa-6', steps: S, verify: 'bash scripts/e2e-both.sh e2e/qa6.spec.ts', passes: false },
    ];
    expect(problems(bad, new Map())).toHaveLength(2);
    expect(problems([{ id: 'ok', task: 'qa-6', steps: S, verify: 'bash scripts/e2e-both.sh e2e/a.spec.ts -g "a whole name"', passes: false }], new Map())).toEqual([]);
  });

  it('one entry per commit', () => {
    const before = [{ id: 'a', passes: false }, { id: 'b', passes: false }];
    expect(othersFlipped(before, [{ id: 'a', passes: true }, { id: 'b', passes: false }], 'a')).toEqual([]);
    expect(othersFlipped(before, [{ id: 'a', passes: true }, { id: 'b', passes: true }], 'a')).toEqual(['b']);
  });

  it('one entry per commit: only what is staged goes in', () => {
    // git status --porcelain: column 1 is the index, column 2 the working tree.
    const status = ['M  src/a.ts', 'MM src/b.ts', ' M src/c.ts', '?? src/d.ts', 'A  src/e.ts', ' M harness/features.json', '?? harness/proof.log'].join('\n');
    expect(notStaged(status)).toEqual(['src/b.ts', 'src/c.ts', 'src/d.ts']);
    expect(notStaged('M  src/a.ts\n')).toEqual([]);
  });

  it('a pattern must match a test, and be a real name', () => {
    const tests = { unit: ['the journal outbox: a line waits'], e2e: ['Add warns about a file you already have'] };
    const ok: Entry = { id: 'a', task: 'qa-7', steps: S, verify: 'pnpm vitest run src/x -t "outbox: a line waits" && bash scripts/e2e-both.sh e2e/x.spec.ts -g "already have"', passes: false };
    expect(problems([ok], new Map(), tests)).toEqual([]);
    const gone: Entry = { ...ok, verify: 'pnpm vitest run src/x -t "a test that is gone"' };
    // An open entry may name a test not written yet; a closed one may not.
    expect(problems([gone], new Map(), tests)).toEqual([]);
    expect(problems([{ ...gone, passes: true }], new Map(), tests).some((m: string) => /matches no test/.test(m))).toBe(true);
    const loose: Entry = { ...ok, verify: 'pnpm vitest run src/x -t ""' };
    expect(problems([loose], new Map(), tests)[0]).toMatch(/too short/);
    const pwa: Entry = { ...ok, verify: 'pnpm build && pnpm exec playwright test -c e2e/pwa.config.ts' };
    expect(problems([pwa], new Map(), tests)[0]).toMatch(/names no test/);
  });

  it('reproved only for the entries before the rule', () => {
    const legacy: Entry = { id: 'old', task: 3, verify: V, passes: true };
    const recent: Entry = { id: 'new', task: 'qa-7', steps: S, verify: V, passes: true };
    const proofs = readProofs(`old\t${hashOf(V)}\t2026-10-04\treproved\nnew\t${hashOf(V)}\t2026-10-04\treproved\n`);
    expect(problems([legacy], proofs)).toEqual([]);
    expect(problems([recent], proofs)[0]).toMatch(/reproved/);
  });

  it('done.sh takes fixed-in, or a known-green reason only with a note', () => {
    expect(doneArgs(['a', 'msg'], {})).toMatchObject({ id: 'a', mode: 'red' });
    expect(doneArgs(['a', 'msg', '--fixed-in', 'abc1234'], {})).toMatchObject({ mode: 'fixed-in', sha: 'abc1234' });
    expect(() => doneArgs(['a', 'msg', '--green-befor', 'x'], {})).toThrow(/unknown/);
    expect(() => doneArgs(['a', 'msg', '--known-green', 'why'], {})).toThrow(/note/);
    expect(doneArgs(['a', 'msg', '--known-green', 'why'], { note: 'decided' })).toMatchObject({ mode: 'known-green', reason: 'why' });
  });

  it('every finding has steps an evaluator can replay', () => {
    const tests = { unit: ['it works'], e2e: [] };
    const bare = { id: 'a', task: 'qa-7', verify: V, passes: false };
    expect(problems([bare], new Map(), tests).some((m: string) => /no steps/.test(m))).toBe(true);
    expect(problems([{ ...bare, steps: ['Open Home.', 'See the card.'] }], new Map(), tests)).toEqual([]);
    // The phase plan's numbered tasks have their steps in the plan.
    expect(problems([{ ...bare, task: 3 }], new Map(), tests)).toEqual([]);
  });

  it('the progress log says the next step', () => {
    expect(nextProblems('# Progress\n\n- 2026-10-04: a passes\n')).toMatch(/Next/);
    expect(nextProblems('# Progress\n\n## Next\n\n## Log\n')).toMatch(/Next/);
    expect(nextProblems('# Progress\n\n## Next\n\n- Fix the rest of qa-7.\n\n## Log\n')).toBeNull();
  });

  it('a red is a failed assertion, not a test file that failed to load', () => {
    expect(redKind(' Test Files  1 failed | 3 passed (4)\n      Tests  2 failed | 10 passed (12)\n')).toBe('assert');
    expect(redKind(' Test Files  1 failed (1)\n      Tests  no tests\n')).toBe('load');
    expect(redKind(' Test Files  1 failed | 3 passed (4)\n      Tests  10 passed (10)\n')).toBe('load');
    expect(redKind('  1 failed\n    [desktop] › e2e/a.spec.ts:3:1 › x\n  2 passed (4s)\n')).toBe('assert');
    expect(redKind('Error: Cannot find module\n')).toBe('none');
  });

  it('every name in a verify matches a test, not just one of them', () => {
    const tests = { unit: ['ConfirmBin asks first', 'the tour goes at sign-out'], e2e: [] };
    const both: Entry = { id: 'a', task: 'qa-9', steps: S, verify: 'pnpm vitest run src -t "ConfirmBin|tour goes"', passes: true };
    expect(problems([both], proofOf(both), tests)).toEqual([]);
    const half: Entry = { ...both, verify: 'pnpm vitest run src -t "ConfirmBin|a test that is gone"' };
    expect(problems([half], proofOf(half), tests).some((m: string) => /"a test that is gone" matches no test/.test(m))).toBe(true);
    // A group keeps its own alternatives: "row.s menu (opens|shows)" is one name.
    const grouped: Entry = { ...both, verify: 'pnpm vitest run src -t "the (tour|walk) goes"' };
    expect(problems([grouped], proofOf(grouped), tests)).toEqual([]);
  });
});

