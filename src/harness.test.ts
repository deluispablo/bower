/// <reference types="node" />
/** The harness's own rules (scripts/harness-rules.mjs): what makes the feature list dishonest. */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module, checked by these tests
import { hashOf, othersFlipped, problems, readProofs } from '../scripts/harness-rules.mjs';

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
    expect(problems([{ id: 'ok', task: 'qa-6', verify: 'bash scripts/e2e-both.sh e2e/a.spec.ts -g "x"', passes: false }], new Map())).toEqual([]);
  });

  it('one entry per commit', () => {
    const before = [{ id: 'a', passes: false }, { id: 'b', passes: false }];
    expect(othersFlipped(before, [{ id: 'a', passes: true }, { id: 'b', passes: false }], 'a')).toEqual([]);
    expect(othersFlipped(before, [{ id: 'a', passes: true }, { id: 'b', passes: true }], 'a')).toEqual(['b']);
  });
});
