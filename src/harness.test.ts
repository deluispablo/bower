/// <reference types="node" />
/** The harness's own rules (scripts/harness-rules.mjs): what makes the feature list dishonest. */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module, checked by these tests
import { doneArgs, hashOf, othersFlipped, problems, readProofs } from '../scripts/harness-rules.mjs';

type Entry = { id: string; task: string | number; verify: string; passes: boolean };
const V = 'pnpm vitest run src/x.test.ts -t "it works"';
const proofOf = (e: Entry): Map<string, string> => readProofs(`${e.id}\t${hashOf(e.verify)}\t2026-10-04\tred\n`) as Map<string, string>;

describe('the harness', () => {
  it('an entry that passes needs a proof from done.sh', () => {
    const e: Entry = { id: 'a', task: 'qa-6', verify: V, passes: true };
    expect(problems([e], new Map())).toHaveLength(1);
    expect(problems([e], proofOf(e))).toEqual([]);
  });

  it('a verify changed after closing loses its proof', () => {
    const e: Entry = { id: 'a', task: 'qa-6', verify: V, passes: true };
    const proofs = proofOf(e);
    expect(problems([{ ...e, verify: `${V} || true` }], proofs)).toHaveLength(1);
  });

  it('a verify must name its test', () => {
    const bad: Entry[] = [
      { id: 'u', task: 'qa-6', verify: 'pnpm vitest run src/data', passes: false },
      { id: 'e', task: 'qa-6', verify: 'bash scripts/e2e-both.sh e2e/qa6.spec.ts', passes: false },
    ];
    expect(problems(bad, new Map())).toHaveLength(2);
    expect(problems([{ id: 'ok', task: 'qa-6', verify: 'bash scripts/e2e-both.sh e2e/a.spec.ts -g "a whole name"', passes: false }], new Map())).toEqual([]);
  });

  it('one entry per commit', () => {
    const before = [{ id: 'a', passes: false }, { id: 'b', passes: false }];
    expect(othersFlipped(before, [{ id: 'a', passes: true }, { id: 'b', passes: false }], 'a')).toEqual([]);
    expect(othersFlipped(before, [{ id: 'a', passes: true }, { id: 'b', passes: true }], 'a')).toEqual(['b']);
  });

  it('a pattern must match a test, and be a real name', () => {
    const tests = { unit: ['the journal outbox: a line waits'], e2e: ['Add warns about a file you already have'] };
    const ok: Entry = { id: 'a', task: 'qa-7', verify: 'pnpm vitest run src/x -t "outbox: a line waits" && bash scripts/e2e-both.sh e2e/x.spec.ts -g "already have"', passes: false };
    expect(problems([ok], new Map(), tests)).toEqual([]);
    const gone: Entry = { ...ok, verify: 'pnpm vitest run src/x -t "a test that is gone"' };
    expect(problems([gone], new Map(), tests)[0]).toMatch(/matches no test/);
    const loose: Entry = { ...ok, verify: 'pnpm vitest run src/x -t ""' };
    expect(problems([loose], new Map(), tests)[0]).toMatch(/too short/);
    const pwa: Entry = { ...ok, verify: 'pnpm build && pnpm exec playwright test -c e2e/pwa.config.ts' };
    expect(problems([pwa], new Map(), tests)[0]).toMatch(/names no test/);
  });

  it('reproved only for the entries before the rule', () => {
    const legacy: Entry = { id: 'old', task: 3, verify: V, passes: true };
    const recent: Entry = { id: 'new', task: 'qa-7', verify: V, passes: true };
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
});
