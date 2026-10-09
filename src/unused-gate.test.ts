import { describe, it, expect } from 'vitest';
// @ts-expect-error plain JS module, the gate's rules
import { compare, findingsOf } from '../scripts/unused-gate-rules.mjs';

// The gate's rules, fed a fixture of what knip reports. The tool runs once, in `pnpm check` (scripts/check-unused-gate.mjs);
// no test here starts it (TL-P4-17 addendum 6).
const report = (names: string[]): unknown => ({ issues: [{ file: 'src/lib.ts', exports: names.map((name) => ({ name })) }] });

describe('unused-code gate', () => {
  it('a new unused export fails the unused-code gate', () => {
    const baseline = new Set<string>();
    expect(compare(findingsOf(report([])), baseline)).toEqual({ fresh: [], stale: [] });

    const found = findingsOf(report(['neverCalled']));
    expect(compare(found, baseline).fresh).toEqual(['exports src/lib.ts neverCalled']);

    expect(compare(found, new Set(['exports src/lib.ts neverCalled']))).toEqual({ fresh: [], stale: [] });
  });

  it('the unused baseline may only shrink', () => {
    const { fresh, stale } = compare(findingsOf(report([])), new Set(['exports src/lib.ts gone']));
    expect(fresh).toEqual([]);
    expect(stale).toEqual(['exports src/lib.ts gone']);
  });

  it('a file, a duplicate and a member are each one line', () => {
    const found = findingsOf({
      issues: [
        { file: 'src/dead.ts', files: [{ name: 'src/dead.ts' }] },
        { file: 'src/a.ts', duplicates: [[{ name: 'one' }, { name: 'two' }]], types: [{ name: 'T' }] },
      ],
    });
    expect([...found].sort()).toEqual(['duplicates src/a.ts one=two', 'files src/dead.ts src/dead.ts', 'types src/a.ts T']);
  });

  it('an export only tests call fails the production unused-code gate', () => {
    // Tests are entries of the normal pass only, so a helper only they call is a finding of the production pass alone.
    const normal = findingsOf(report([]));
    const production = findingsOf(report(['keepFinished']));
    expect(compare(normal, new Set<string>())).toEqual({ fresh: [], stale: [] });
    expect(compare(production, new Set<string>()).fresh).toEqual(['exports src/lib.ts keepFinished']);
    expect(compare(production, new Set(['exports src/lib.ts keepFinished']))).toEqual({ fresh: [], stale: [] });
  });

  it('the production unused baseline may only shrink', () => {
    const { fresh, stale } = compare(findingsOf(report([])), new Set(['exports src/lib.ts gone']));
    expect(fresh).toEqual([]);
    expect(stale).toEqual(['exports src/lib.ts gone']);
  });
});
